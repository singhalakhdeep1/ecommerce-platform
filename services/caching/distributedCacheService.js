/**
 * Distributed Caching Service with Cache-Aside Pattern
 * Manages distributed cache coherency across multiple instances
 */
class DistributedCacheService {
  constructor(redisClient, options = {}) {
    this.redis = redisClient;
    this.defaultExpiration = options.defaultExpiration || 1800; // 30 minutes
    this.keyPrefix = options.keyPrefix || 'ecommerce:';
  }

  /**
   * Get value from cache (Cache-Aside Pattern)
   */
  async get(key) {
    const cacheKey = this.getCacheKey(key);
    const cachedValue = await this.redis.get(cacheKey);

    if (cachedValue === null) {
      console.debug(`Cache miss for key: ${key}`);
      return null;
    }

    console.debug(`Cache hit for key: ${key}`);
    return JSON.parse(cachedValue);
  }

  /**
   * Set value in cache
   */
  async set(key, value, expiration) {
    const cacheKey = this.getCacheKey(key);
    const serializedValue = JSON.stringify(value);
    const exp = expiration || this.defaultExpiration;

    await this.redis.setex(cacheKey, exp, serializedValue);
    console.debug(`Set cache for key: ${key}`);
  }

  /**
   * Remove value from cache
   */
  async remove(key) {
    const cacheKey = this.getCacheKey(key);
    await this.redis.del(cacheKey);
    console.debug(`Removed cache for key: ${key}`);
  }

  /**
   * Get or set pattern - fetch from cache or load from source
   */
  async getOrSet(key, factory, expiration) {
    const cachedValue = await this.get(key);
    if (cachedValue !== null) {
      return cachedValue;
    }

    const value = await factory();
    await this.set(key, value, expiration);
    return value;
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern) {
    const cachePattern = this.keyPrefix + pattern + '*';
    const keys = await this.redis.keys(cachePattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    console.log(`Invalidating cache pattern: ${pattern}`);
  }

  /**
   * Clear all cache
   */
  async clearAll() {
    console.warn('Clearing all cache');
    const pattern = this.keyPrefix + '*';
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  getCacheKey(key) {
    return this.keyPrefix + key;
  }
}

module.exports = DistributedCacheService;
