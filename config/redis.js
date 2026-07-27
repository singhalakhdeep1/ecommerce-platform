const redis = require('redis');
const logger = require('../utils/logger');

/**
 * CURRICULUM COVERAGE:
 * #676-700: Caching strategies - Redis implementation
 * #951-1000: Performance optimization - Redis caching
 */

class RedisClient {
    constructor() {
        this.client = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
            
            this.client = redis.createClient({
                url: redisUrl,
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries > 10) {
                            logger.error('Redis reconnection failed after 10 retries');
                            return new Error('Redis reconnection failed');
                        }
                        return Math.min(retries * 100, 3000);
                    }
                }
            });

            this.client.on('error', (err) => {
                logger.error('Redis Client Error', { error: err.message });
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                logger.info('Redis Client Connected');
                this.isConnected = true;
            });

            this.client.on('disconnect', () => {
                logger.warn('Redis Client Disconnected');
                this.isConnected = false;
            });

            await this.client.connect();
            logger.info('✅ Redis connected successfully');
            
        } catch (error) {
            logger.error('Redis connection failed', { error: error.message });
            this.isConnected = false;
        }
    }

    async get(key) {
        try {
            if (!this.isConnected) return null;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Redis GET error', { key, error: error.message });
            return null;
        }
    }

    async set(key, value, ttl = 3600) {
        try {
            if (!this.isConnected) return false;
            await this.client.setEx(key, ttl, JSON.stringify(value));
            return true;
        } catch (error) {
            logger.error('Redis SET error', { key, error: error.message });
            return false;
        }
    }

    async del(key) {
        try {
            if (!this.isConnected) return false;
            await this.client.del(key);
            return true;
        } catch (error) {
            logger.error('Redis DEL error', { key, error: error.message });
            return false;
        }
    }

    async exists(key) {
        try {
            if (!this.isConnected) return false;
            return await this.client.exists(key);
        } catch (error) {
            logger.error('Redis EXISTS error', { key, error: error.message });
            return false;
        }
    }

    async flushAll() {
        try {
            if (!this.isConnected) return false;
            await this.client.flushAll();
            logger.info('Redis cache flushed');
            return true;
        } catch (error) {
            logger.error('Redis FLUSH error', { error: error.message });
            return false;
        }
    }

    async disconnect() {
        try {
            if (this.client) {
                await this.client.quit();
                logger.info('Redis client disconnected');
            }
        } catch (error) {
            logger.error('Redis disconnect error', { error: error.message });
        }
    }
}

// Create singleton instance
const redisClient = new RedisClient();

// Auto-connect on module load
if (process.env.REDIS_ENABLED !== 'false') {
    redisClient.connect().catch(err => {
        logger.warn('Redis auto-connect failed, running without cache', { error: err.message });
    });
}

module.exports = redisClient;
