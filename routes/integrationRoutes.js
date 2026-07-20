const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');

/**
 * @swagger
 * /api/integrations/webhook:
 *   post:
 *     summary: Generic webhook endpoint for e-commerce events
 *     tags: [Integrations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed
 */
router.post('/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;

    console.log(`Webhook received: ${event}`, data);

    switch (event) {
      case 'order.created':
        await handleOrderCreated(data);
        break;
      case 'order.paid':
        await handleOrderPaid(data);
        break;
      case 'product.created':
        await handleProductCreated(data);
        break;
      default:
        console.log('Unknown event type');
    }

    res.status(200).json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/integrations/shippo:
 *   post:
 *     summary: Create shipment label via Shippo
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Shipment label created
 */
router.post('/shippo', auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    const shippoToken = process.env.SHIPPO_API_TOKEN;

    if (!shippoToken) {
      return res.status(400).json({ success: false, error: 'Shippo token not configured' });
    }

    // In production, integrate with Shippo API
    // For now, return mock response
    res.status(200).json({
      success: true,
      message: 'Shipment label created',
      trackingNumber: 'SHIPPO123456789',
      labelUrl: 'https://shippo.com/label/123'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/integrations/mailchimp:
 *   post:
 *     summary: Subscribe customer to Mailchimp list
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               listId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Subscribed to Mailchimp
 */
router.post('/mailchimp', auth, async (req, res) => {
  try {
    const { email, listId } = req.body;
    const mailchimpApiKey = process.env.MAILCHIMP_API_KEY;
    const mailchimpDataCenter = process.env.MAILCHIMP_DATA_CENTER || 'us1';

    if (!mailchimpApiKey) {
      return res.status(400).json({ success: false, error: 'Mailchimp API key not configured' });
    }

    const response = await axios.post(
      `https://${mailchimpDataCenter}.api.mailchimp.com/3.0/lists/${listId}/members`,
      {
        email_address: email,
        status: 'subscribed'
      },
      {
        headers: {
          'Authorization': `apikey ${mailchimpApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/integrations/klaviyo:
 *   post:
 *     summary: Track event in Klaviyo
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               eventName:
 *                 type: string
 *               properties:
 *                 type: object
 *     responses:
 *       200:
 *         description: Event tracked in Klaviyo
 */
router.post('/klaviyo', auth, async (req, res) => {
  try {
    const { email, eventName, properties } = req.body;
    const klaviyoApiKey = process.env.KLAVIYO_API_KEY;

    if (!klaviyoApiKey) {
      return res.status(400).json({ success: false, error: 'Klaviyo API key not configured' });
    }

    const response = await axios.post(
      'https://a.klaviyo.com/api/events/',
      {
        data: {
          type: 'event',
          attributes: {
            metric: { data: { type: 'metric', id: eventName } },
            profile: { data: { type: 'profile', attributes: { email } } },
            properties: properties || {},
            time: new Date().toISOString()
        }}
      },
      {
        headers: {
          'Authorization': `Klaviyo-API-Key ${klaviyoApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/integrations/status:
 *   get:
 *     summary: Get integration status
 *     tags: [Integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Integration status
 */
router.get('/status', auth, async (req, res) => {
  try {
    const integrations = {
      stripe: {
        configured: !!process.env.STRIPE_SECRET_KEY,
        status: process.env.STRIPE_SECRET_KEY ? 'active' : 'not configured'
      },
      paypal: {
        configured: !!process.env.PAYPAL_CLIENT_ID,
        status: process.env.PAYPAL_CLIENT_ID ? 'active' : 'not configured'
      },
      shippo: {
        configured: !!process.env.SHIPPO_API_TOKEN,
        status: process.env.SHIPPO_API_TOKEN ? 'active' : 'not configured'
      },
      mailchimp: {
        configured: !!process.env.MAILCHIMP_API_KEY,
        status: process.env.MAILCHIMP_API_KEY ? 'active' : 'not configured'
      },
      klaviyo: {
        configured: !!process.env.KLAVIYO_API_KEY,
        status: process.env.KLAVIYO_API_KEY ? 'active' : 'not configured'
      }
    };

    res.status(200).json({ success: true, integrations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook handlers
async function handleOrderCreated(data) {
  console.log('Order created webhook:', data.orderId);
}

async function handleOrderPaid(data) {
  console.log('Order paid webhook:', data.orderId);
}

async function handleProductCreated(data) {
  console.log('Product created webhook:', data.productId);
}

module.exports = router;
