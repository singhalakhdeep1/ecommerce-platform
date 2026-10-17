import { QueryTypes, Sequelize } from 'sequelize';
import { env } from '../../config/env';
import { sequelize as primary } from '../../config/database';
import { logger } from '../../utils/logger';
import { connectionPool } from '../connectionPool/connectionPoolService';

interface ReplicaConfig {
  id: string;
  connectionString: string;
  region?: string;
}

interface ReplicaState extends ReplicaConfig {
  client: Sequelize;
  healthy: boolean;
  lagSeconds: number | null;
  checkedAt: Date | null;
}

/**
 * Routes read-only queries (analytics and reports) to PostgreSQL streaming replicas, picking a
 * random healthy one. Writes always go to the primary. If no replica is configured or all are
 * unhealthy (or lagging more than DB_REPLICA_MAX_LAG_SECONDS), reads fall back to the primary.
 */
export class ReadReplicaService {
  private readonly replicas: ReplicaState[];
  private readonly maxLagSeconds: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(configs: ReplicaConfig[] = ReadReplicaService.fromEnv()) {
    this.maxLagSeconds = Number(process.env.DB_REPLICA_MAX_LAG_SECONDS ?? 30);
    this.replicas = configs.map((c) => ({ ...c, client: connectionPool.getConnection(c.connectionString), healthy: true, lagSeconds: null, checkedAt: null }));
  }

  /** DB_READ_REPLICAS=postgres://...,postgres://...  (optionally `region|postgres://...`). */
  static fromEnv(): ReplicaConfig[] {
    return env.db.readReplicas.map((entry, i) => {
      const [region, url] = entry.includes('|') ? entry.split('|', 2) : [undefined, entry];
      return { id: `replica_${i + 1}`, connectionString: url, region };
    });
  }

  get count(): number {
    return this.replicas.length;
  }

  getReadReplica(): Sequelize {
    const healthy = this.replicas.filter((r) => r.healthy);
    if (healthy.length === 0) return primary;
    return healthy[Math.floor(Math.random() * healthy.length)].client;
  }

  getReplicaByRegion(region: string): Sequelize {
    const match = this.replicas.find((r) => r.region === region && r.healthy);
    return match ? match.client : this.getReadReplica();
  }

  getPrimary(): Sequelize {
    return primary;
  }

  /** Runs a read on a replica; a replica failure is retried once on the primary. */
  async executeRead<T>(operation: (db: Sequelize) => Promise<T>): Promise<T> {
    const db = this.getReadReplica();
    if (db === primary) return operation(primary);
    try {
      return await operation(db);
    } catch (error) {
      logger.warn('Replica read failed, retrying on primary', { error: error instanceof Error ? error.message : String(error) });
      return operation(primary);
    }
  }

  async executeReadInRegion<T>(region: string, operation: (db: Sequelize) => Promise<T>): Promise<T> {
    return operation(this.getReplicaByRegion(region));
  }

  executeWrite<T>(operation: (db: Sequelize) => Promise<T>): Promise<T> {
    return operation(primary);
  }

  /** Raw SQL read helper used by the analytics reports. */
  query<T extends object>(sql: string, replacements: Record<string, unknown> = {}): Promise<T[]> {
    return this.executeRead((db) => db.query<T>(sql, { replacements, type: QueryTypes.SELECT }));
  }

  /** Replication lag in seconds per replica (0 on a server that is not in recovery). */
  async getReplicaLag(): Promise<Array<{ id: string; region?: string; lagSeconds: number | null; healthy: boolean }>> {
    await this.checkReplicaHealth();
    return this.replicas.map((r) => ({ id: r.id, region: r.region, lagSeconds: r.lagSeconds, healthy: r.healthy }));
  }

  async checkReplicaHealth(): Promise<void> {
    await Promise.all(
      this.replicas.map(async (replica) => {
        try {
          const [row] = await replica.client.query<{ lag: string | null }>(
            `SELECT CASE WHEN pg_is_in_recovery()
                    THEN COALESCE(EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp()), 0)
                    ELSE 0 END AS lag`,
            { type: QueryTypes.SELECT },
          );
          replica.lagSeconds = Number(row?.lag ?? 0);
          const wasHealthy = replica.healthy;
          replica.healthy = replica.lagSeconds <= this.maxLagSeconds;
          if (wasHealthy !== replica.healthy) logger.warn(`Read replica ${replica.id} ${replica.healthy ? 'recovered' : 'is lagging'}`, { lagSeconds: replica.lagSeconds });
        } catch (error) {
          if (replica.healthy) logger.error(`Read replica ${replica.id} is down`, { error: error instanceof Error ? error.message : String(error) });
          replica.healthy = false;
          replica.lagSeconds = null;
        }
        replica.checkedAt = new Date();
      }),
    );
  }

  startHealthChecks(intervalMs = 15_000): void {
    if (this.timer || this.replicas.length === 0) return;
    void this.checkReplicaHealth();
    this.timer = setInterval(() => void this.checkReplicaHealth(), intervalMs);
    this.timer.unref();
  }

  stopHealthChecks(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status() {
    return this.replicas.map((r) => ({
      id: r.id,
      region: r.region ?? null,
      target: connectionPool.getConnectionKey(r.connectionString),
      healthy: r.healthy,
      lagSeconds: r.lagSeconds,
      checkedAt: r.checkedAt,
    }));
  }
}

export const readReplicas = new ReadReplicaService();
