/**
 * Idempotency Service for E-commerce Orders
 * Ensures duplicate requests don't cause duplicate orders
 */
const { v4: uuidv4 } = require('uuid');

class IdempotencyService {
  constructor(redisClient, options = {}) {
    this.redis = redisClient;
    this.expiration = options.expiration || 86400; // 24 hours
    this.keyPrefix = options.keyPrefix || 'idempotency:';
  }

  /**
   * Check if request with idempotency key has been processed
   */
  async isProcessed(idempotencyKey) {
    const cacheKey = this.getCacheKey(idempotencyKey);
    const exists = await this.redis.exists(cacheKey);

    if (exists) {
      console.debug(`Idempotency key already processed: ${idempotencyKey}`);
    }

    return exists === 1;
  }

  /**
   * Get cached response for idempotency key
   */
  async getCachedResponse(idempotencyKey) {
    const cacheKey = this.getCacheKey(idempotencyKey);
    const cachedValue = await this.redis.get(cacheKey);

    if (cachedValue === null) {
      return null;
    }

    return JSON.parse(cachedValue);
  }

  /**
   * Store response for idempotency key
   */
  async storeResponse(idempotencyKey, response) {
    const cacheKey = this.getCacheKey(idempotencyKey);
    const serializedValue = JSON.stringify(response);

    await this.redis.setex(cacheKey, this.expiration, serializedValue);
    console.debug(`Stored response for idempotency key: ${idempotencyKey}`);
  }

  /**
   * Validate idempotency key format
   */
  isValidIdempotencyKey(key) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(key);
  }

  /**
   * Generate idempotency key
   */
  generateIdempotencyKey() {
    return uuidv4();
  }

  /**
   * Invalidate idempotency key
   */
  async invalidate(idempotencyKey) {
    const cacheKey = this.getCacheKey(idempotencyKey);
    await this.redis.del(cacheKey);
    console.debug(`Invalidated idempotency key: ${idempotencyKey}`);
  }

  getCacheKey(idempotencyKey) {
    return this.keyPrefix + idempotencyKey;
  }
}

module.exports = IdempotencyService;
