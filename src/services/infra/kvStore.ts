import Redis from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export interface BucketResult {
  allowed: boolean;
  /** Tokens left after this call (fractional refill is kept internally; floor for display). */
  tokens: number;
}

/**
 * Minimal key-value contract shared by the cache, rate limiter, idempotency store, fraud counters and
 * A/B-free counters. Implemented by Redis (shared across processes) and by an in-process Map.
 */
export interface KvStore {
  readonly backend: 'redis' | 'memory';
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** SET key value NX EX ttl: true if the key was created. The primitive behind idempotency locks. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(...keys: string[]): Promise<number>;
  /** Atomic increment; the TTL is applied when the counter is created. */
  incr(key: string, ttlSeconds?: number): Promise<number>;
  /** Keys matching a glob, found with SCAN (never KEYS). */
  scan(pattern: string): Promise<string[]>;
  /** Atomic token bucket: refill by elapsed time, then take `cost` tokens if available. */
  tokenBucket(key: string, capacity: number, refillPerSecond: number, cost: number): Promise<BucketResult>;
  ping(): Promise<boolean>;
}

interface Entry {
  value: string;
  expiresAt: number | null;
}

export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

/** In-process implementation. Single instance only: use Redis when running more than one process. */
export class MemoryKvStore implements KvStore {
  readonly backend = 'memory' as const;
  private readonly data = new Map<string, Entry>();
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  private live(key: string): Entry | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.data.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.live(key)) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.data.delete(key)) removed++;
      this.buckets.delete(key);
    }
    return removed;
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const existing = this.live(key);
    const next = (existing ? parseInt(existing.value, 10) : 0) + 1;
    this.data.set(key, {
      value: String(next),
      expiresAt: existing ? existing.expiresAt : ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
    return next;
  }

  async scan(pattern: string): Promise<string[]> {
    const matcher = globToRegExp(pattern);
    const keys: string[] = [];
    for (const key of [...this.data.keys()]) {
      if (this.live(key) && matcher.test(key)) keys.push(key);
    }
    return keys;
  }

  async tokenBucket(key: string, capacity: number, refillPerSecond: number, cost: number): Promise<BucketResult> {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: capacity, at: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + (Math.max(0, now - bucket.at) / 1000) * refillPerSecond);
    bucket.at = now;
    const allowed = bucket.tokens >= cost;
    if (allowed) bucket.tokens -= cost;
    this.buckets.set(key, bucket);
    if (this.buckets.size > 20_000) {
      const idleMs = (capacity / refillPerSecond) * 1000;
      for (const [k, b] of this.buckets) if (now - b.at > idleMs) this.buckets.delete(k);
    }
    return { allowed, tokens: bucket.tokens };
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

/**
 * Atomic token bucket in Lua: concurrent requests (and concurrent app instances) can never both
 * spend the same last token. Returns {allowed, tokens * 1000}.
 */
const TOKEN_BUCKET_LUA = `
local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  ts = now
end
tokens = math.min(capacity, tokens + math.max(0, now - ts) / 1000 * rate)
local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / rate * 1000) + 1000)
return {allowed, math.floor(tokens * 1000)}
`;

/** Redis-backed store. A failing Redis call degrades to the in-process store instead of failing the request. */
export class RedisKvStore implements KvStore {
  readonly backend = 'redis' as const;
  private readonly fallback = new MemoryKvStore();
  private readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
    });
    this.client.on('error', (err) => logger.warn('Redis error', { message: err.message }));
    this.client.on('ready', () => logger.info('Redis connection ready'));
  }

  private async run<T>(op: string, redisCall: () => Promise<T>, fallbackCall: () => Promise<T>): Promise<T> {
    try {
      return await redisCall();
    } catch (err) {
      logger.warn(`Redis ${op} failed, using in-process fallback`, { message: err instanceof Error ? err.message : String(err) });
      return fallbackCall();
    }
  }

  get(key: string) {
    return this.run('get', () => this.client.get(key), () => this.fallback.get(key));
  }

  set(key: string, value: string, ttlSeconds?: number) {
    return this.run(
      'set',
      async () => {
        if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
        else await this.client.set(key, value);
      },
      () => this.fallback.set(key, value, ttlSeconds),
    );
  }

  setIfAbsent(key: string, value: string, ttlSeconds: number) {
    return this.run(
      'setIfAbsent',
      async () => (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK',
      () => this.fallback.setIfAbsent(key, value, ttlSeconds),
    );
  }

  del(...keys: string[]) {
    return this.run('del', async () => (keys.length ? this.client.del(...keys) : 0), () => this.fallback.del(...keys));
  }

  incr(key: string, ttlSeconds?: number) {
    return this.run(
      'incr',
      async () => {
        const value = await this.client.incr(key);
        if (value === 1 && ttlSeconds) await this.client.expire(key, ttlSeconds);
        return value;
      },
      () => this.fallback.incr(key, ttlSeconds),
    );
  }

  scan(pattern: string) {
    return this.run(
      'scan',
      async () => {
        const found: string[] = [];
        let cursor = '0';
        do {
          const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
          cursor = next;
          found.push(...keys);
        } while (cursor !== '0');
        return found;
      },
      () => this.fallback.scan(pattern),
    );
  }

  tokenBucket(key: string, capacity: number, refillPerSecond: number, cost: number) {
    return this.run(
      'tokenBucket',
      async () => {
        const [allowed, milli] = (await this.client.eval(TOKEN_BUCKET_LUA, 1, key, capacity, refillPerSecond, Date.now(), cost)) as [number, number];
        return { allowed: allowed === 1, tokens: milli / 1000 };
      },
      () => this.fallback.tokenBucket(key, capacity, refillPerSecond, cost),
    );
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}

let store: KvStore | null = null;

/** Process-wide store: Redis when REDIS_URL is set, otherwise memory. */
export function getKvStore(): KvStore {
  if (!store) store = env.redisUrl ? new RedisKvStore(env.redisUrl) : new MemoryKvStore();
  return store;
}

export async function closeKvStore(): Promise<void> {
  if (store instanceof RedisKvStore) await store.close();
  store = null;
}
