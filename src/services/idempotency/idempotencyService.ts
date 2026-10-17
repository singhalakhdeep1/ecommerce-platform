import { randomUUID } from 'crypto';
import { KvStore, getKvStore } from '../infra/kvStore';

export interface StoredResponse {
  status: number;
  body: unknown;
  /** Hash of the request body: the same key with a different body is a client bug (422). */
  fingerprint: string;
}

const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,64}$/;

/**
 * Idempotency keys for unsafe requests (checkout, payments). The first request takes a short lock
 * (SET NX), runs, and stores its response for 24h; retries with the same key get the stored
 * response instead of creating a second order or charge.
 */
export class IdempotencyService {
  private readonly expiration: number;
  private readonly keyPrefix: string;

  constructor(
    private readonly store: KvStore = getKvStore(),
    options: { expiration?: number; keyPrefix?: string } = {},
  ) {
    this.expiration = options.expiration ?? Number(process.env.IDEMPOTENCY_EXPIRATION ?? 86_400);
    this.keyPrefix = options.keyPrefix ?? process.env.IDEMPOTENCY_KEY_PREFIX ?? 'idempotency:';
  }

  isValidIdempotencyKey(key: string): boolean {
    return KEY_PATTERN.test(key);
  }

  generateIdempotencyKey(): string {
    return randomUUID();
  }

  private cacheKey(scope: string, key: string): string {
    return `${this.keyPrefix}${scope}:${key}`;
  }

  async getCachedResponse(scope: string, key: string): Promise<StoredResponse | null> {
    const raw = await this.store.get(this.cacheKey(scope, key));
    return raw ? (JSON.parse(raw) as StoredResponse) : null;
  }

  async isProcessed(scope: string, key: string): Promise<boolean> {
    return (await this.getCachedResponse(scope, key)) !== null;
  }

  /** Takes the processing lock; false means another request with this key is still running. */
  async acquire(scope: string, key: string, lockSeconds = 60): Promise<boolean> {
    return this.store.setIfAbsent(`${this.cacheKey(scope, key)}:lock`, '1', lockSeconds);
  }

  async release(scope: string, key: string): Promise<void> {
    await this.store.del(`${this.cacheKey(scope, key)}:lock`);
  }

  async storeResponse(scope: string, key: string, response: StoredResponse): Promise<void> {
    await this.store.set(this.cacheKey(scope, key), JSON.stringify(response), this.expiration);
  }

  async invalidate(scope: string, key: string): Promise<void> {
    await this.store.del(this.cacheKey(scope, key));
  }
}

export const idempotency = new IdempotencyService();
