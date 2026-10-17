import { KvStore, getKvStore } from '../infra/kvStore';
import { metrics } from '../metrics';

export interface CacheOptions {
  defaultExpiration?: number;
  keyPrefix?: string;
}

/**
 * Cache-aside over the shared key-value store (Redis when configured). Every instance reads and
 * invalidates the same keys, so a product update on one instance is visible to all of them.
 */
export class DistributedCacheService {
  private readonly defaultExpiration: number;
  private readonly keyPrefix: string;
  /** In-flight loads per key: concurrent misses for the same key share one database query (stampede guard). */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: KvStore = getKvStore(),
    options: CacheOptions = {},
  ) {
    this.defaultExpiration = options.defaultExpiration ?? Number(process.env.CACHE_DEFAULT_EXPIRATION ?? 300);
    this.keyPrefix = options.keyPrefix ?? process.env.CACHE_KEY_PREFIX ?? 'ecommerce:';
  }

  getCacheKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.store.get(this.getCacheKey(key));
    if (raw === null) {
      metrics.cacheRequests.inc({ result: 'miss' });
      return null;
    }
    metrics.cacheRequests.inc({ result: 'hit' });
    return JSON.parse(raw) as T;
  }

  async set(key: string, value: unknown, expiration = this.defaultExpiration): Promise<void> {
    await this.store.set(this.getCacheKey(key), JSON.stringify(value), expiration);
  }

  async remove(key: string): Promise<void> {
    await this.store.del(this.getCacheKey(key));
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, expiration = this.defaultExpiration): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const load = (async () => {
      try {
        const value = await factory();
        await this.set(key, value, expiration);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, load);
    return load;
  }

  /** Removes every key matching a glob such as `products:*` (SCAN based, safe on large keyspaces). */
  async invalidatePattern(pattern: string): Promise<number> {
    const keys = await this.store.scan(this.getCacheKey(pattern));
    return keys.length ? this.store.del(...keys) : 0;
  }

  async clearAll(): Promise<number> {
    return this.invalidatePattern('*');
  }
}

export const cache = new DistributedCacheService();
