const logger = require('../utils/logger');

/**
 * CURRICULUM COVERAGE:
 * #1826-1850: Business logic - Shipping calculation
 * #1751-1800: Third-party API integrations
 */

class ShippingProviders {
    static providers = {
        fedex: {
            name: 'FedEx',
            baseRate: 5.99,
            ratePerPound: 0.50,
            ratePerMile: 0.02,
            freeShippingThreshold: 75,
            deliveryTimes: {
                ground: '3-5 business days',
                express: '1-2 business days',
                overnight: 'Next business day'
            }
        },
        ups: {
            name: 'UPS',
            baseRate: 6.99,
            ratePerPound: 0.45,
            ratePerMile: 0.018,
            freeShippingThreshold: 80,
            deliveryTimes: {
                ground: '2-5 business days',
                express: '1-3 business days',
                overnight: 'Next business day'
            }
        },
        usps: {
            name: 'USPS',
            baseRate: 4.99,
            ratePerPound: 0.40,
            ratePerMile: 0.015,
            freeShippingThreshold: 50,
            deliveryTimes: {
                ground: '3-7 business days',
                express: '2-3 business days',
                overnight: '1-2 business days'
            }
        },
        dhl: {
            name: 'DHL',
            baseRate: 7.99,
            ratePerPound: 0.55,
            ratePerMile: 0.022,
            freeShippingThreshold: 100,
            deliveryTimes: {
                ground: '4-7 business days',
                express: '2-3 business days',
                overnight: 'Next business day'
            }
        }
    };

    /**
     * Calculate shipping cost based on provider, weight, and distance
     * @param {string} provider - Shipping provider code
     * @param {object} options - Shipping options
     * @param {number} options.weight - Total weight in pounds
     * @param {number} options.distance - Distance in miles (estimated)
     * @param {number} options.subtotal - Order subtotal
     * @param {string} options.serviceType - Service type (ground, express, overnight)
     * @param {object} options.shippingAddress - Shipping address
     * @returns {object} Shipping calculation result
     */
    static calculateShipping(provider, options = {}) {
        const {
            weight = 1,
            distance = 100,
            subtotal = 0,
            serviceType = 'ground',
            shippingAddress
        } = options;

        const providerConfig = this.providers[provider.toLowerCase()];
        
        if (!providerConfig) {
            logger.error('Invalid shipping provider', { provider });
            throw new Error(`Invalid shipping provider: ${provider}`);
        }

        // Check for free shipping
        if (subtotal >= providerConfig.freeShippingThreshold) {
            return {
                provider: providerConfig.name,
                providerCode: provider.toLowerCase(),
                serviceType,
                cost: 0,
                isFreeShipping: true,
                estimatedDelivery: providerConfig.deliveryTimes[serviceType],
                freeShippingThreshold: providerConfig.freeShippingThreshold
            };
        }

        // Calculate base cost
        let cost = providerConfig.baseRate;

        // Add weight-based cost
        cost += weight * providerConfig.ratePerPound;

        // Add distance-based cost
        cost += distance * providerConfig.ratePerMile;

        // Apply service type multiplier
        const serviceMultipliers = {
            ground: 1.0,
            express: 1.5,
            overnight: 2.5
        };
        cost *= serviceMultipliers[serviceType] || 1.0;

        // International shipping surcharge
        if (shippingAddress && shippingAddress.country !== 'US') {
            cost *= 2.0; // Double for international
        }

        return {
            provider: providerConfig.name,
            providerCode: provider.toLowerCase(),
            serviceType,
            cost: Math.round(cost * 100) / 100,
            isFreeShipping: false,
            estimatedDelivery: providerConfig.deliveryTimes[serviceType],
            freeShippingThreshold: providerConfig.freeShippingThreshold
        };
    }

    /**
     * Get shipping rates from all providers
     * @param {object} options - Shipping options
     * @returns {Array} Array of shipping options
     */
    static getAllRates(options = {}) {
        const rates = [];
        
        for (const providerCode in this.providers) {
            try {
                const rate = this.calculateShipping(providerCode, options);
                rates.push(rate);
            } catch (error) {
                logger.error('Error calculating shipping rate', { providerCode, error: error.message });
            }
        }

        // Sort by cost
        rates.sort((a, b) => a.cost - b.cost);

        return rates;
    }

    /**
     * Get cheapest shipping option
     * @param {object} options - Shipping options
     * @returns {object} Cheapest shipping option
     */
    static getCheapestRate(options = {}) {
        const rates = this.getAllRates(options);
        return rates.length > 0 ? rates[0] : null;
    }

    /**
     * Get fastest shipping option
     * @param {object} options - Shipping options
     * @returns {object} Fastest shipping option
     */
    static getFastestRate(options = {}) {
        const rates = this.getAllRates(options);
        // Overnight is fastest, then express, then ground
        const priorityOrder = ['overnight', 'express', 'ground'];
        
        for (const priority of priorityOrder) {
            const rate = rates.find(r => r.serviceType === priority);
            if (rate) return rate;
        }
        
        return rates.length > 0 ? rates[0] : null;
    }

    /**
     * Validate shipping address
     * @param {object} address - Shipping address
     * @returns {object} Validation result
     */
    static validateAddress(address) {
        const errors = [];

        if (!address.name || address.name.trim().length < 2) {
            errors.push('Name is required');
        }

        if (!address.address || address.address.trim().length < 5) {
            errors.push('Street address is required');
        }

        if (!address.city || address.city.trim().length < 2) {
            errors.push('City is required');
        }

        if (!address.state || address.state.trim().length < 2) {
            errors.push('State/Province is required');
        }

        if (!address.zip || address.zip.trim().length < 3) {
            errors.push('Postal code is required');
        }

        if (!address.country || address.country.trim().length !== 2) {
            errors.push('Country code is required (2-letter ISO code)');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Estimate shipping distance (simplified)
     * @param {object} origin - Origin address
     * @param {object} destination - Destination address
     * @returns {number} Estimated distance in miles
     */
    static estimateDistance(origin, destination) {
        // Simplified distance calculation
        // In production, use Google Maps API or similar
        if (!origin || !destination) return 100;

        // If same state, estimate 50-200 miles
        if (origin.state === destination.state) {
            return Math.floor(Math.random() * 150) + 50;
        }

        // If same country, estimate 200-1000 miles
        if (origin.country === destination.country) {
            return Math.floor(Math.random() * 800) + 200;
        }

        // International, estimate 1000-5000 miles
        return Math.floor(Math.random() * 4000) + 1000;
    }

    /**
     * Generate tracking number
     * @param {string} provider - Provider code
     * @returns {string} Tracking number
     */
    static generateTrackingNumber(provider) {
        const prefixes = {
            fedex: '1Z',
            ups: '1Z',
            usps: '94',
            dhl: 'JD'
        };

        const prefix = prefixes[provider.toLowerCase()] || 'TRK';
        const random = Math.random().toString(36).substring(2, 12).toUpperCase();
        const timestamp = Date.now().toString().slice(-8);

        return `${prefix}${random}${timestamp}`;
    }

    /**
     * Track shipment (mock implementation)
     * @param {string} trackingNumber - Tracking number
     * @returns {object} Tracking information
     */
    static trackShipment(trackingNumber) {
        // In production, integrate with actual carrier APIs
        const statuses = ['Label Created', 'In Transit', 'Out for Delivery', 'Delivered'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

        return {
            trackingNumber,
            status: randomStatus,
            estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            events: [
                {
                    date: new Date().toISOString(),
                    status: randomStatus,
                    location: 'Distribution Center'
                }
            ]
        };
    }
}

module.exports = ShippingProviders;
