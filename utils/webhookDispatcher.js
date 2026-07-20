const crypto = require('crypto');
const axios = require('axios');
const { WebhookSubscription } = require('../models');

/**
 * CURRICULUM COVERAGE:
 * #1776-1800: Webhook sending, signature verification
 * #1826-1850: Third-party API integration
 */
class WebhookDispatcher {
    static async dispatch(event, payload, userId) {
        // Find subscriptions for this event
        const subscriptions = await WebhookSubscription.findAll({
            where: { event, userId, isActive: true }
        });

        const promises = subscriptions.map(sub => this.sendWebhook(sub, event, payload));
        await Promise.allSettled(promises);
    }

    static async sendWebhook(subscription, event, payload, attempt = 1) {
        const payloadString = JSON.stringify({
            event,
            timestamp: new Date(),
            data: payload
        });

        // Compute HMAC SHA256 signature
        const signature = crypto
            .createHmac('sha256', subscription.secret)
            .update(payloadString)
            .digest('hex');

        try {
            await axios.post(subscription.targetUrl, payloadString, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                    'User-Agent': 'ECommerce-Webhook-Dispatcher/1.0'
                },
                timeout: 5000 // 5 seconds timeout
            });
            console.log(`✅ Webhook delivered to ${subscription.targetUrl} for event ${event}`);
        } catch (error) {
            console.error(`❌ Webhook delivery failed to ${subscription.targetUrl} (Attempt ${attempt}/3): ${error.message}`);
            
            if (attempt < 3) {
                const delay = Math.pow(2, attempt) * 1000; // Exponential backoff (2s, 4s)
                setTimeout(() => {
                    this.sendWebhook(subscription, event, payload, attempt + 1);
                }, delay);
            }
        }
    }
}

module.exports = WebhookDispatcher;
