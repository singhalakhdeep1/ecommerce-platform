import { Sequelize } from 'sequelize';
import { createSequelize, sequelize as primary } from '../../config/database';
import { logger } from '../../utils/logger';
import { metrics } from '../metrics';

interface PooledConnection {
  client: Sequelize;
  createdAt: number;
  lastUsed: number;
  borrowed: number;
}

/** Shape of the pool object Sequelize keeps on its connection manager (sequelize-pool). */
interface SequelizePool {
  size: number;
  available: number;
  using: number;
  waiting: number;
  maxSize: number;
}

/**
 * Keeps one Sequelize client (each with its own pg connection pool) per connection string, so
 * read replicas and shards reuse connections instead of opening a new pool per request. Idle
 * clients are closed after `connectionLifetime`.
 */
export class ConnectionPoolService {
  private readonly connections = new Map<string, PooledConnection>();
  private readonly maxPoolSize: number;
  private readonly connectionLifetime: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: { maxPoolSize?: number; connectionLifetime?: number } = {}) {
    this.maxPoolSize = options.maxPoolSize ?? Number(process.env.CONNECTION_POOL_MAX_SIZE ?? 100);
    this.connectionLifetime = options.connectionLifetime ?? Number(process.env.CONNECTION_POOL_LIFETIME ?? 1_800_000);
  }

  getConnection(connectionString: string): Sequelize {
    const key = this.getConnectionKey(connectionString);
    const existing = this.connections.get(key);
    if (existing) {
      existing.lastUsed = Date.now();
      existing.borrowed++;
      return existing.client;
    }
    if (this.connections.size >= this.maxPoolSize) {
      throw new Error(`Connection pool exhausted (${this.maxPoolSize} clients)`);
    }
    const client = createSequelize(connectionString, { pool: { max: Number(process.env.DB_POOL_MAX ?? 10), min: 0, idle: 10_000, acquire: 30_000 } });
    this.connections.set(key, { client, createdAt: Date.now(), lastUsed: Date.now(), borrowed: 1 });
    logger.info('Opened pooled database client', { target: key });
    this.ensureCleanupTimer();
    return client;
  }

  returnConnection(connectionString: string): void {
    const entry = this.connections.get(this.getConnectionKey(connectionString));
    if (entry) entry.lastUsed = Date.now();
  }

  /** Pool numbers for the primary and every pooled client (GET /api/system/health, /metrics). */
  getStatistics() {
    const primaryPool = poolOf(primary);
    if (primaryPool) {
      metrics.dbPool.set({ state: 'in_use' }, primaryPool.using);
      metrics.dbPool.set({ state: 'idle' }, primaryPool.available);
      metrics.dbPool.set({ state: 'waiting' }, primaryPool.waiting);
    }
    return {
      primary: primaryPool ? { size: primaryPool.size, inUse: primaryPool.using, idle: primaryPool.available, waiting: primaryPool.waiting, max: primaryPool.maxSize } : null,
      pooledClients: [...this.connections.entries()].map(([target, c]) => {
        const pool = poolOf(c.client);
        return {
          target,
          borrowed: c.borrowed,
          ageSeconds: Math.round((Date.now() - c.createdAt) / 1000),
          idleSeconds: Math.round((Date.now() - c.lastUsed) / 1000),
          size: pool?.size ?? 0,
          inUse: pool?.using ?? 0,
        };
      }),
      maxPooledClients: this.maxPoolSize,
    };
  }

  async cleanupIdleConnections(): Promise<number> {
    const now = Date.now();
    let closed = 0;
    for (const [key, entry] of this.connections) {
      if (now - entry.lastUsed > this.connectionLifetime) {
        this.connections.delete(key);
        await entry.client.close().catch(() => undefined);
        closed++;
      }
    }
    return closed;
  }

  async clearAllConnections(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    const all = [...this.connections.values()];
    this.connections.clear();
    await Promise.all(all.map((c) => c.client.close().catch(() => undefined)));
  }

  /** Strips credentials so connection strings can be logged and returned by the API. */
  getConnectionKey(connectionString: string): string {
    try {
      const url = new URL(connectionString);
      return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
    } catch {
      return connectionString.replace(/\/\/[^@]*@/, '//');
    }
  }

  private ensureCleanupTimer(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => void this.cleanupIdleConnections(), 60_000);
    this.cleanupTimer.unref();
  }
}

function poolOf(client: Sequelize): SequelizePool | null {
  const manager = (client as unknown as { connectionManager?: { pool?: SequelizePool } }).connectionManager;
  return manager?.pool ?? null;
}

export const connectionPool = new ConnectionPoolService();
