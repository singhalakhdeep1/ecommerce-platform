const redisClient = require('../config/redis');
const logger = require('../utils/logger');

/**
 * CURRICULUM COVERAGE:
 * #676-700: Caching - Redis for A/B testing
 * #1826-1850: Business logic - A/B testing system
 */

class ABTesting {
    /**
     * Assign user to a variant for an experiment
     * @param {string} userId - User ID
     * @param {string} experimentId - Experiment ID
     * @param {Array} variants - Array of variant options (e.g., ['A', 'B'])
     * @returns {string} Assigned variant
     */
    static async assignVariant(userId, experimentId, variants = ['A', 'B']) {
        try {
            const cacheKey = `abtest:${experimentId}:${userId}`;
            
            // Check if user already assigned
            const existingVariant = await redisClient.get(cacheKey);
            if (existingVariant) {
                return existingVariant;
            }

            // Assign new variant using consistent hashing
            const hash = this.hashUserId(userId, experimentId);
            const variantIndex = hash % variants.length;
            const variant = variants[variantIndex];

            // Store assignment (30 days TTL)
            await redisClient.set(cacheKey, variant, 30 * 24 * 3600);

            // Track assignment
            await this.trackAssignment(experimentId, variant);

            logger.info('A/B test variant assigned', { userId, experimentId, variant });

            return variant;
        } catch (error) {
            logger.error('Error assigning A/B test variant', { error: error.message });
            return variants[0]; // Return default variant on error
        }
    }

    /**
     * Hash user ID and experiment ID for consistent assignment
     * @param {string} userId - User ID
     * @param {string} experimentId - Experiment ID
     * @returns {number} Hash value
     */
    static hashUserId(userId, experimentId) {
        const combined = `${userId}-${experimentId}`;
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Track experiment assignment
     * @param {string} experimentId - Experiment ID
     * @param {string} variant - Variant assigned
     */
    static async trackAssignment(experimentId, variant) {
        try {
            const key = `abtest:stats:${experimentId}:${variant}:assignments`;
            const current = await redisClient.get(key) || 0;
            await redisClient.set(key, parseInt(current) + 1, 30 * 24 * 3600);
        } catch (error) {
            logger.error('Error tracking A/B test assignment', { error: error.message });
        }
    }

    /**
     * Track conversion for a variant
     * @param {string} experimentId - Experiment ID
     * @param {string} variant - Variant
     * @param {string} conversionType - Type of conversion (e.g., 'purchase', 'signup')
     */
    static async trackConversion(experimentId, variant, conversionType = 'default') {
        try {
            const key = `abtest:stats:${experimentId}:${variant}:conversions:${conversionType}`;
            const current = await redisClient.get(key) || 0;
            await redisClient.set(key, parseInt(current) + 1, 30 * 24 * 3600);
            
            logger.info('A/B test conversion tracked', { experimentId, variant, conversionType });
        } catch (error) {
            logger.error('Error tracking A/B test conversion', { error: error.message });
        }
    }

    /**
     * Get experiment statistics
     * @param {string} experimentId - Experiment ID
     * @param {Array} variants - Array of variants
     * @returns {object} Experiment statistics
     */
    static async getExperimentStats(experimentId, variants = ['A', 'B']) {
        try {
            const stats = {};

            for (const variant of variants) {
                const assignmentsKey = `abtest:stats:${experimentId}:${variant}:assignments`;
                const conversionsKey = `abtest:stats:${experimentId}:${variant}:conversions:default`;

                const assignments = await redisClient.get(assignmentsKey) || 0;
                const conversions = await redisClient.get(conversionsKey) || 0;

                const conversionRate = assignments > 0 ? (conversions / assignments) * 100 : 0;

                stats[variant] = {
                    assignments: parseInt(assignments),
                    conversions: parseInt(conversions),
                    conversionRate: parseFloat(conversionRate.toFixed(2))
                };
            }

            return stats;
        } catch (error) {
            logger.error('Error getting A/B test stats', { error: error.message });
            return {};
        }
    }

    /**
     * Get user's variant for an experiment
     * @param {string} userId - User ID
     * @param {string} experimentId - Experiment ID
     * @returns {string|null} User's variant or null if not assigned
     */
    static async getUserVariant(userId, experimentId) {
        try {
            const cacheKey = `abtest:${experimentId}:${userId}`;
            return await redisClient.get(cacheKey);
        } catch (error) {
            logger.error('Error getting user variant', { error: error.message });
            return null;
        }
    }

    /**
     * Create a new experiment
     * @param {string} experimentId - Experiment ID
     * @param {object} config - Experiment configuration
     * @param {Array} config.variants - Array of variants
     * @param {string} config.name - Experiment name
     * @param {string} config.description - Experiment description
     * @param {boolean} config.active - Whether experiment is active
     */
    static async createExperiment(experimentId, config) {
        try {
            const key = `abtest:config:${experimentId}`;
            await redisClient.set(key, JSON.stringify(config), 90 * 24 * 3600); // 90 days TTL
            
            logger.info('A/B test experiment created', { experimentId, config });
        } catch (error) {
            logger.error('Error creating A/B test experiment', { error: error.message });
        }
    }

    /**
     * Get experiment configuration
     * @param {string} experimentId - Experiment ID
     * @returns {object|null} Experiment配置 or null
     */
    static async getExperimentConfig(experimentId) {
        try {
            const key = `abtest:config:${experimentId}`;
            const config = await redisClient.get(key);
            return config ? JSON.parse(config) : null;
        } catch (error) {
            logger.error('Error getting experiment config', { error: error.message });
            return null;
        }
    }

    /**
     * Activate/deactivate an experiment
     * @param {string} experimentId - Experiment ID
     * @param {boolean} active - Active status
     */
    static async setExperimentActive(experimentId, active) {
        try {
            const config = await this.getExperimentConfig(experimentId);
            if (config) {
                config.active = active;
                await this.createExperiment(experimentId, config);
                logger.info('A/B test experiment status updated', { experimentId, active });
            }
        } catch (error) {
            logger.error('Error updating experiment status', { error: error.message });
        }
    }

    /**
     * Reset experiment statistics
     * @param {string} experimentId - Experiment ID
     * @param {Array} variants - Array of variants
     */
    static async resetExperimentStats(experimentId, variants = ['A', 'B']) {
        try {
            for (const variant of variants) {
                await redisClient.del(`abtest:stats:${experimentId}:${variant}:assignments`);
                await redisClient.del(`abtest:stats:${experimentId}:${variant}:conversions:default`);
            }
            
            logger.info('A/B test experiment stats reset', { experimentId });
        } catch (error) {
            logger.error('Error resetting experiment stats', { error: error.message });
        }
    }

    /**
     * Calculate statistical significance (simplified chi-square test)
     * @param {object} stats - Experiment statistics
     * @returns {object} Statistical analysis results
     */
    static calculateSignificance(stats) {
        const variants = Object.keys(stats);
        if (variants.length < 2) {
            return { significant: false, pValue: 1, message: 'Need at least 2 variants' };
        }

        const [control, treatment] = variants;
        const controlStats = stats[control];
        const treatmentStats = stats[treatment];

        if (controlStats.assignments < 30 || treatmentStats.assignments < 30) {
            return { significant: false, pValue: 1, message: 'Sample size too small' };
        }

        // Simplified conversion rate comparison
        const controlRate = controlStats.conversionRate;
        const treatmentRate = treatmentStats.conversionRate;
        const lift = ((treatmentRate - controlRate) / controlRate) * 100;

        // Simplified significance check (in production, use proper statistical test)
        const isSignificant = Math.abs(lift) > 10 && 
                              controlStats.assignments > 100 && 
                              treatmentStats.assignments > 100;

        return {
            significant: isSignificant,
            lift: parseFloat(lift.toFixed(2)),
            controlRate,
            treatmentRate,
            message: isSignificant ? 'Result is statistically significant' : 'Result not statistically significant'
        };
    }

    /**
     * Get all active experiments
     * @returns {Array} Array of active experiment IDs
     */
    static async getActiveExperiments() {
        // This would require Redis scan in production
        // For now, return a predefined list
        return [
            'checkout_button_color',
            'product_page_layout',
            'price_display_format'
        ];
    }
}

module.exports = ABTesting;
