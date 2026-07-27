const { AnalyticsEvent } = require('../models');
const redisClient = require('../config/redis');
const logger = require('../utils/logger');

/**
 * CURRICULUM COVERAGE:
 * #676-700: Caching - Redis for conversion tracking
 * #1826-1850: Business logic - Conversion tracking
 */

class ConversionTracking {
    static EVENT_TYPES = {
        PAGE_VIEW: 'page_view',
        PRODUCT_VIEW: 'product_view',
        ADD_TO_CART: 'add_to_cart',
        REMOVE_FROM_CART: 'remove_from_cart',
        CHECKOUT_START: 'checkout_start',
        CHECKOUT_COMPLETE: 'checkout_complete',
        PAYMENT_SUCCESS: 'payment_success',
        PAYMENT_FAILED: 'payment_failed',
        SEARCH: 'search',
        FILTER: 'filter',
        CATEGORY_VIEW: 'category_view',
        WISHLIST_ADD: 'wishlist_add',
        WISHLIST_REMOVE: 'wishlist_remove',
        REVIEW_SUBMIT: 'review_submit',
        NEWSLETTER_SIGNUP: 'newsletter_signup',
        ACCOUNT_REGISTER: 'account_register',
        ACCOUNT_LOGIN: 'account_login'
    };

    /**
     * Track a conversion event
     * @param {object} eventData - Event data
     * @param {string} eventData.userId - User ID (optional for guests)
     * @param {string} eventData.eventType - Event type
     * @param {object} eventData.metadata - Additional event metadata
     * @param {string} eventData.sessionId - Session ID
     * @returns {Promise<void>}
     */
    static async trackEvent(eventData) {
        try {
            const { userId, eventType, metadata = {}, sessionId } = eventData;

            // Store in database for long-term analytics
            if (userId) {
                await AnalyticsEvent.create({
                    userId,
                    eventType,
                    metadata,
                    sessionId
                });
            }

            // Store in Redis for real-time analytics (24 hour TTL)
            const redisKey = `conversion:${eventType}:${Date.now()}`;
            await redisClient.set(redisKey, JSON.stringify({
                userId,
                eventType,
                metadata,
                sessionId,
                timestamp: new Date().toISOString()
            }), 24 * 3600);

            // Increment counters
            await this.incrementCounter(eventType);

            logger.info('Conversion event tracked', { userId, eventType });
        } catch (error) {
            logger.error('Error tracking conversion event', { error: error.message });
        }
    }

    /**
     * Increment event counter in Redis
     * @param {string} eventType - Event type
     */
    static async incrementCounter(eventType) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const key = `conversion:counters:${today}:${eventType}`;
            const current = await redisClient.get(key) || 0;
            await redisClient.set(key, parseInt(current) + 1, 7 * 24 * 3600); // 7 days TTL
        } catch (error) {
            logger.error('Error incrementing counter', { error: error.message });
        }
    }

    /**
     * Get conversion funnel data
     * @param {string} startDate - Start date (ISO string)
     * @param {string} endDate - End date (ISO string)
     * @returns {object} Funnel data
     */
    static async getFunnelData(startDate, endDate) {
        try {
            const funnelSteps = [
                this.EVENT_TYPES.PRODUCT_VIEW,
                this.EVENT_TYPES.ADD_TO_CART,
                this.EVENT_TYPES.CHECKOUT_START,
                this.EVENT_TYPES.PAYMENT_SUCCESS
            ];

            const funnelData = {};

            for (const step of funnelSteps) {
                const count = await this.getEventCount(step, startDate, endDate);
                funnelData[step] = count;
            }

            // Calculate conversion rates
            const productViews = funnelData[this.EVENT_TYPES.PRODUCT_VIEW] || 1;
            const addToCartRate = ((funnelData[this.EVENT_TYPES.ADD_TO_CART] || 0) / productViews) * 100;
            const checkoutStartRate = ((funnelData[this.EVENT_TYPES.CHECKOUT_START] || 0) / productViews) * 100;
            const paymentSuccessRate = ((funnelData[this.EVENT_TYPES.PAYMENT_SUCCESS] || 0) / productViews) * 100;

            return {
                steps: funnelData,
                conversionRates: {
                    addToCart: parseFloat(addToCartRate.toFixed(2)),
                    checkoutStart: parseFloat(checkoutStartRate.toFixed(2)),
                    paymentSuccess: parseFloat(paymentSuccessRate.toFixed(2))
                }
            };
        } catch (error) {
            logger.error('Error getting funnel data', { error: error.message });
            return {};
        }
    }

    /**
     * Get event count for a specific type and date range
     * @param {string} eventType - Event type
     * @param {string} startDate - Start date
     * @param {string} endDate - End date
     * @returns {number} Event count
     */
    static async getEventCount(eventType, startDate, endDate) {
        try {
            const count = await AnalyticsEvent.count({
                where: {
                    eventType,
                    createdAt: {
                        [require('sequelize').Op.between]: [startDate, endDate]
                    }
                }
            });
            return count;
        } catch (error) {
            logger.error('Error getting event count', { error: error.message });
            return 0;
        }
    }

    /**
     * Get user conversion path
     * @param {string} userId - User ID
     * @returns {Array} Array of events in chronological order
     */
    static async getUserPath(userId) {
        try {
            const events = await AnalyticsEvent.findAll({
                where: { userId },
                order: [['createdAt', 'ASC']],
                limit: 50
            });

            return events.map(event => ({
                eventType: event.eventType,
                timestamp: event.createdAt,
                metadata: event.metadata
            }));
        } catch (error) {
            logger.error('Error getting user path', { error: error.message });
            return [];
        }
    }

    /**
     * Calculate conversion rate for a specific event
     * @param {string} eventType - Event type to calculate rate for
     * @param {string} baseEventType - Base event type (default: product_view)
     * @param {string} startDate - Start date
     * @param {string} endDate - End date
     * @returns {number} Conversion rate percentage
     */
    static async calculateConversionRate(eventType, baseEventType = this.EVENT_TYPES.PRODUCT_VIEW, startDate, endDate) {
        try {
            const eventCount = await this.getEventCount(eventType, startDate, endDate);
            const baseCount = await this.getEventCount(baseEventType, startDate, endDate);

            if (baseCount === 0) return 0;

            return ((eventCount / baseCount) * 100).toFixed(2);
        } catch (error) {
            logger.error('Error calculating conversion rate', { error: error.message });
            return 0;
        }
    }

    /**
     * Get top performing products by views
     * @param {number} limit - Number of products to return
     * @param {string} startDate - Start date
     * @param {string} endDate - End date
     * @returns {Array} Top performing products
     */
    static async getTopProducts(limit = 10, startDate, endDate) {
        try {
            const results = await AnalyticsEvent.findAll({
                where: {
                    eventType: this.EVENT_TYPES.PRODUCT_VIEW,
                    createdAt: {
                        [require('sequelize').Op.between]: [startDate, endDate]
                    }
                },
                attributes: [
                    ['metadata', 'productId'],
                    [require('sequelize').fn('COUNT', '*'), 'viewCount']
                ],
                group: ['metadata->>productId'],
                order: [[require('sequelize').fn('COUNT', '*'), 'DESC']],
                limit
            });

            return results.map(r => ({
                productId: r.metadata.productId,
                viewCount: r.dataValues.viewCount
            }));
        } catch (error) {
            logger.error('Error getting top products', { error: error.message });
            return [];
        }
    }

    /**
     * Track page view
     * @param {string} userId - User ID
     * @param {string} pageUrl - Page URL
     * @param {string} sessionId - Session ID
     */
    static async trackPageView(userId, pageUrl, sessionId) {
        await this.trackEvent({
            userId,
            eventType: this.EVENT_TYPES.PAGE_VIEW,
            metadata: { pageUrl },
            sessionId
        });
    }

    /**
     * Track product view
     * @param {string} userId - User ID
     * @param {string} productId - Product ID
     * @param {string} sessionId - Session ID
     */
    static async trackProductView(userId, productId, sessionId) {
        await this.trackEvent({
            userId,
            eventType: this.EVENT_TYPES.PRODUCT_VIEW,
            metadata: { productId },
            sessionId
        });
    }

    /**
     * Track add to cart
     * @param {string} userId - User ID
     * @param {string} productId - Product ID
     * @param {number} quantity - Quantity
     * @param {string} sessionId - Session ID
     */
    static async trackAddToCart(userId, productId, quantity, sessionId) {
        await this.trackEvent({
            userId,
            eventType: this.EVENT_TYPES.ADD_TO_CART,
            metadata: { productId, quantity },
            sessionId
        });
    }

    /**
     * Track purchase
     * @param {string} userId - User ID
     * @param {string} orderId - Order ID
     * @param {number} orderValue - Order value
     * @param {string} sessionId - Session ID
     */
    static async trackPurchase(userId, orderId, orderValue, sessionId) {
        await this.trackEvent({
            userId,
            eventType: this.EVENT_TYPES.PAYMENT_SUCCESS,
            metadata: { orderId, orderValue },
            sessionId
        });
    }

    /**
     * Get real-time conversion metrics
     * @returns {object} Real-time metrics
     */
    static async getRealTimeMetrics() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const metrics = {};

            const eventTypes = Object.values(this.EVENT_TYPES);
            for (const eventType of eventTypes) {
                const key = `conversion:counters:${today}:${eventType}`;
                const count = await redisClient.get(key) || 0;
                metrics[eventType] = parseInt(count);
            }

            return metrics;
        } catch (error) {
            logger.error('Error getting real-time metrics', { error: error.message });
            return {};
        }
    }
}

module.exports = ConversionTracking;
