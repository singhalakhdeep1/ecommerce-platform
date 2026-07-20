const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const CustomerSegment = require('../models/CustomerSegment');
const auth = require('../middleware/auth');

/**
 * @swagger
 * /api/marketing/campaigns:
 *   get:
 *     summary: Get all marketing campaigns
 *     tags: [Marketing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Campaigns retrieved
 */
router.get('/campaigns', auth, async (req, res) => {
  try {
    const campaigns = await Campaign.findAll({
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({ success: true, campaigns });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/marketing/campaigns:
 *   post:
 *     summary: Create marketing campaign
 *     tags: [Marketing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *               subject:
 *                 type: string
 *               content:
 *                 type: string
 *               segmentId:
 *                 type: integer
 *               scheduledAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Campaign created
 */
router.post('/campaigns', auth, async (req, res) => {
  try {
    const { name, type, subject, content, segmentId, scheduledAt } = req.body;

    const campaign = await Campaign.create({
      name,
      type,
      subject,
      content,
      segmentId,
      scheduledAt,
      status: scheduledAt ? 'scheduled' : 'draft'
    });

    res.status(201).json({ success: true, campaign });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/marketing/campaigns/:id/send:
 *   post:
 *     summary: Send campaign immediately
 *     tags: [Marketing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Campaign sent
 */
router.post('/campaigns/:id/send', auth, async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    campaign.status = 'sent';
    campaign.sentAt = new Date();
    await campaign.save();

    // In production, integrate with email service to send campaign
    // For now, just mark as sent

    res.status(200).json({ success: true, message: 'Campaign sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/marketing/segments:
 *   get:
 *     summary: Get all customer segments
 *     tags: [Marketing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Segments retrieved
 */
router.get('/segments', auth, async (req, res) => {
  try {
    const segments = await CustomerSegment.findAll({
      order: [['name', 'ASC']]
    });

    res.status(200).json({ success: true, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/marketing/segments:
 *   post:
 *     summary: Create customer segment
 *     tags: [Marketing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               criteria:
 *                 type: object
 *     responses:
 *       201:
 *         description: Segment created
 */
router.post('/segments', auth, async (req, res) => {
  try {
    const { name, description, criteria } = req.body;

    const segment = await CustomerSegment.create({
      name,
      description,
      criteria
    });

    res.status(201).json({ success: true, segment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/marketing/abandoned-cart:
 *   post:
 *     summary: Trigger abandoned cart recovery
 *     tags: [Marketing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Abandoned cart emails sent
 */
router.post('/abandoned-cart', auth, async (req, res) => {
  try {
    // In production, query carts abandoned > 1 hour ago
    // Send recovery emails to those customers
    // For now, just acknowledge the request

    res.status(200).json({
      success: true,
      message: 'Abandoned cart recovery triggered'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @swagger
 * /api/marketing/analytics:
 *   get:
 *     summary: Get marketing analytics
 *     tags: [Marketing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Marketing analytics retrieved
 */
router.get('/analytics', auth, async (req, res) => {
  try {
    const campaigns = await Campaign.findAll();
    const totalCampaigns = campaigns.length;
    const sentCampaigns = campaigns.filter(c => c.status === 'sent').length;
    const scheduledCampaigns = campaigns.filter(c => c.status === 'scheduled').length;

    // Calculate open rate, click rate (mock data for now)
    const openRate = sentCampaigns > 0 ? 45.2 : 0;
    const clickRate = sentCampaigns > 0 ? 12.8 : 0;

    res.status(200).json({
      success: true,
      data: {
        totalCampaigns,
        sentCampaigns,
        scheduledCampaigns,
        openRate,
        clickRate
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
