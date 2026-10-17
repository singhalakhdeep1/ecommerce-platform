import { createHash } from 'crypto';
import { QueryTypes, Sequelize } from 'sequelize';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { connectionPool } from '../connectionPool/connectionPoolService';

export interface ShardConfig {
  id: string;
  connectionString: string;
  /** Relative share of the key space (number of virtual nodes = weight * 100). */
  weight?: number;
}

/**
 * Horizontal partitioning of the analytics event stream (the store's highest-volume, append-only
 * table). Events are placed on a shard by consistent hashing of the customer id (or session id for
 * guests), so adding a shard moves only ~1/N of the keys. Reports fan out to every shard and merge.
 *
 * With DB_SHARDS empty the service is disabled and events stay in the primary's analytics_events.
 */
export class DatabaseShardingService {
  private readonly shards: Array<ShardConfig & { client: Sequelize }>;
  private readonly ring: Array<{ hash: number; shardId: string }> = [];

  constructor(configs: ShardConfig[] = env.db.shards) {
    this.shards = configs.map((c) => ({ ...c, client: connectionPool.getConnection(c.connectionString) }));
    for (const shard of this.shards) {
      const vnodes = Math.max(1, Math.round((shard.weight ?? 1) * 100));
      for (let v = 0; v < vnodes; v++) this.ring.push({ hash: this.hashString(`${shard.id}#${v}`), shardId: shard.id });
    }
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  get enabled(): boolean {
    return this.shards.length > 0;
  }

  get shardIds(): string[] {
    return this.shards.map((s) => s.id);
  }

  /** First ring position clockwise from the key's hash. */
  getShardIdByCustomer(customerKey: string): string {
    if (!this.enabled) throw new Error('Sharding is not configured (DB_SHARDS)');
    const h = this.hashString(customerKey);
    let lo = 0;
    let hi = this.ring.length - 1;
    if (h > this.ring[hi].hash) return this.ring[0].shardId;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.ring[mid].hash < h) lo = mid + 1;
      else hi = mid;
    }
    return this.ring[lo].shardId;
  }

  /** Region / segment routing: a shard whose id contains both tokens, else hashing on the pair. */
  getShardId(region: string, customerSegment: string): string {
    const direct = this.shards.find((s) => s.id.includes(region.toLowerCase()) && s.id.includes(customerSegment.toLowerCase()));
    return direct ? direct.id : this.getShardIdByCustomer(`${region}:${customerSegment}`);
  }

  getShardClient(shardId: string): Sequelize {
    const shard = this.shards.find((s) => s.id === shardId);
    if (!shard) throw new Error(`Unknown shard ${shardId}`);
    return shard.client;
  }

  executeOnShard<T>(shardId: string, operation: (client: Sequelize) => Promise<T>): Promise<T> {
    return operation(this.getShardClient(shardId));
  }

  /** Cross-shard query: runs on every shard in parallel and returns the per-shard results. */
  async executeOnAllShards<T>(operation: (client: Sequelize, shardId: string) => Promise<T>): Promise<Array<{ shardId: string; result: T }>> {
    return Promise.all(this.shards.map(async (s) => ({ shardId: s.id, result: await operation(s.client, s.id) })));
  }

  async getShardHealth() {
    return Promise.all(
      this.shards.map(async (s) => {
        const started = Date.now();
        try {
          const [row] = await s.client.query<{ events: string }>('SELECT COUNT(*)::bigint AS events FROM analytics_events', { type: QueryTypes.SELECT });
          return { id: s.id, target: connectionPool.getConnectionKey(s.connectionString), healthy: true, latencyMs: Date.now() - started, events: Number(row.events) };
        } catch (error) {
          return { id: s.id, target: connectionPool.getConnectionKey(s.connectionString), healthy: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
        }
      }),
    );
  }

  /** Creates the shard-local analytics schema (no FK to users: users live on the primary). */
  async migrateShards(): Promise<string[]> {
    const done: string[] = [];
    for (const shard of this.shards) {
      await shard.client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE TABLE IF NOT EXISTS analytics_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID,
          session_id VARCHAR(64),
          event_type VARCHAR(64) NOT NULL,
          event_data JSONB,
          ab_group VARCHAR(16),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_analytics_type_created ON analytics_events (event_type, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events (user_id, created_at);
      `);
      logger.info(`Shard ${shard.id} schema is up to date`);
      done.push(shard.id);
    }
    return done;
  }

  /** Distribution check: which shard each of `keys` maps to (used by GET /api/system/shards?sample=). */
  distribution(keys: string[]): Record<string, number> {
    const counts: Record<string, number> = Object.fromEntries(this.shardIds.map((id) => [id, 0]));
    for (const key of keys) counts[this.getShardIdByCustomer(key)]++;
    return counts;
  }

  hashString(value: string): number {
    return createHash('md5').update(value).digest().readUInt32BE(0);
  }
}

export const sharding = new DatabaseShardingService();
