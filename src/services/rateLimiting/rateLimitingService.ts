import { KvStore, getKvStore } from '../infra/kvStore';

export interface RateLimitOptions {
  /** Maximum burst size. */
  bucketCapacity?: number;
  /** Tokens added per second. */
  refillRate?: number;
  keyPrefix?: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Seconds until at least one token is available again (0 when allowed). */
  retryAfterSeconds: number;
}

/**
 * Token bucket rate limiter. The bucket lives in the shared store and is updated atomically
 * (a Lua script on Redis), so the limit holds across all API instances.
 */
export class RateLimitingService {
  readonly bucketCapacity: number;
  readonly refillRate: number;
  private readonly keyPrefix: string;

  constructor(
    options: RateLimitOptions = {},
    private readonly store: KvStore = getKvStore(),
  ) {
    this.bucketCapacity = options.bucketCapacity ?? Number(process.env.RATE_LIMIT_BUCKET_CAPACITY ?? 100);
    this.refillRate = options.refillRate ?? Number(process.env.RATE_LIMIT_REFILL_RATE ?? 1);
    this.keyPrefix = options.keyPrefix ?? 'ratelimit:';
  }

  async consume(key: string, tokensRequested = 1): Promise<RateLimitDecision> {
    const result = await this.store.tokenBucket(`${this.keyPrefix}${key}`, this.bucketCapacity, this.refillRate, tokensRequested);
    const missing = Math.max(0, tokensRequested - result.tokens);
    return {
      allowed: result.allowed,
      remaining: Math.floor(result.tokens),
      limit: this.bucketCapacity,
      retryAfterSeconds: result.allowed ? 0 : Math.ceil(missing / this.refillRate),
    };
  }

  async isAllowed(key: string, tokensRequested = 1): Promise<boolean> {
    return (await this.consume(key, tokensRequested)).allowed;
  }

  async resetBucket(key: string): Promise<void> {
    await this.store.del(`${this.keyPrefix}${key}`);
  }
}
