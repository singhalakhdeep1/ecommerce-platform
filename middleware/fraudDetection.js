const logger = require('../utils/logger');
const { Order, User } = require('../models');
const redisClient = require('../config/redis');

/**
 * CURRICULUM COVERAGE:
 * #951-1000: Security - Fraud detection patterns
 * #676-700: Caching - Redis for fraud detection
 */

const FRAUD_RULES = {
    MAX_ORDERS_PER_HOUR: 5,
    MAX_ORDERS_PER_DAY: 15,
    MAX_AMOUNT_PER_HOUR: 5000,
    MAX_FAILED_PAYMENTS: 3,
    SUSPICIOUS_COUNTRIES: ['XX', 'ZZ'], // Add suspicious country codes
    VELOCITY_CHECK_WINDOW: 3600 // 1 hour in seconds
};

class FraudDetection {
    static async checkOrderFraud(req, res, next) {
        try {
            const userId = req.user?.id;
            const ipAddress = req.ip;
            const userAgent = req.headers['user-agent'];
            const { totalAmount, shippingAddress } = req.body;

            // Skip fraud check for admin users
            if (req.user?.role === 'admin') {
                return next();
            }

            const fraudScore = 0;
            const fraudReasons = [];

            // 1. Velocity check - Too many orders in short time
            const recentOrdersKey = `fraud:orders:${userId}:${ipAddress}`;
            const recentOrders = await redisClient.get(recentOrdersKey) || 0;

            if (recentOrders >= FRAUD_RULES.MAX_ORDERS_PER_HOUR) {
                fraudScore += 30;
                fraudReasons.push('Too many orders in short time');
                logger.security('Velocity check failed', { userId, ipAddress, recentOrders });
            }

            // 2. Amount check - Unusually large order
            if (totalAmount > FRAUD_RULES.MAX_AMOUNT_PER_HOUR) {
                fraudScore += 25;
                fraudReasons.push('Unusually large order amount');
                logger.security('Large order amount detected', { userId, totalAmount });
            }

            // 3. Failed payment check
            const failedPaymentsKey = `fraud:failed:${userId}`;
            const failedPayments = await redisClient.get(failedPaymentsKey) || 0;

            if (failedPayments >= FRAUD_RULES.MAX_FAILED_PAYMENTS) {
                fraudScore += 40;
                fraudReasons.push('Too many failed payment attempts');
                logger.security('Failed payment limit exceeded', { userId, failedPayments });
            }

            // 4. Geographic check - Suspicious location
            if (shippingAddress?.country && FRAUD_RULES.SUSPICIOUS_COUNTRIES.includes(shippingAddress.country)) {
                fraudScore += 35;
                fraudReasons.push('Order from suspicious location');
                logger.security('Suspicious country detected', { userId, country: shippingAddress.country });
            }

            // 5. Device fingerprint check
            const deviceKey = `fraud:device:${userAgent}`;
            const deviceOrders = await redisClient.get(deviceKey) || 0;

            if (deviceOrders > FRAUD_RULES.MAX_ORDERS_PER_DAY) {
                fraudScore += 20;
                fraudReasons.push('Too many orders from same device');
                logger.security('Device velocity check failed', { userAgent, deviceOrders });
            }

            // 6. New user with large order
            if (userId) {
                const user = await User.findByPk(userId);
                const userAge = Date.now() - new Date(user.createdAt).getTime();
                const daysSinceCreation = userAge / (1000 * 60 * 60 * 24);

                if (daysSinceCreation < 1 && totalAmount > 500) {
                    fraudScore += 15;
                    fraudReasons.push('New user with large order');
                    logger.security('New user large order', { userId, daysSinceCreation, totalAmount });
                }
            }

            // Determine action based on fraud score
            if (fraudScore >= 70) {
                // Block the order
                logger.warn('Order blocked due to high fraud score', { 
                    userId, 
                    ipAddress, 
                    fraudScore, 
                    reasons: fraudReasons 
                });
                return res.status(403).json({
                    success: false,
                    message: 'Order blocked due to security concerns',
                    fraudScore,
                    reasons: fraudReasons
                });
            } else if (fraudScore >= 40) {
                // Flag for manual review
                logger.warn('Order flagged for manual review', { 
                    userId, 
                    ipAddress, 
                    fraudScore, 
                    reasons: fraudReasons 
                });
                req.fraudFlag = true;
                req.fraudScore = fraudScore;
                req.fraudReasons = fraudReasons;
            }

            // Update counters
            await redisClient.set(recentOrdersKey, recentOrders + 1, FRAUD_RULES.VELOCITY_CHECK_WINDOW);
            await redisClient.set(deviceKey, deviceOrders + 1, FRAUD_RULES.VELOCITY_CHECK_WINDOW);

            next();

        } catch (error) {
            logger.error('Fraud detection error', { error: error.message });
            // Allow order to proceed if fraud detection fails
            next();
        }
    }

    static async recordFailedPayment(userId, ipAddress) {
        try {
            const failedPaymentsKey = `fraud:failed:${userId}`;
            const failedPayments = await redisClient.get(failedPaymentsKey) || 0;
            await redisClient.set(failedPaymentsKey, failedPayments + 1, 86400); // 24 hours
            logger.security('Failed payment recorded', { userId, ipAddress, count: failedPayments + 1 });
        } catch (error) {
            logger.error('Error recording failed payment', { error: error.message });
        }
    }

    static async clearFailedPayments(userId) {
        try {
            const failedPaymentsKey = `fraud:failed:${userId}`;
            await redisClient.del(failedPaymentsKey);
            logger.info('Failed payments cleared', { userId });
        } catch (error) {
            logger.error('Error clearing failed payments', { error: error.message });
        }
    }

    static async getFraudReport(userId) {
        try {
            const recentOrdersKey = `fraud:orders:${userId}`;
            const failedPaymentsKey = `fraud:failed:${userId}`;

            const recentOrders = await redisClient.get(recentOrdersKey) || 0;
            const failedPayments = await redisClient.get(failedPaymentsKey) || 0;

            return {
                recentOrders,
                failedPayments,
                riskLevel: failedPayments >= 3 ? 'high' : recentOrders >= 3 ? 'medium' : 'low'
            };
        } catch (error) {
            logger.error('Error getting fraud report', { error: error.message });
            return null;
        }
    }
}

module.exports = FraudDetection;
