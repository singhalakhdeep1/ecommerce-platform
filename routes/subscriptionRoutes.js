const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { protect } = require('../middleware/auth');

router.post('/create', protect, subscriptionController.createSubscription);
router.post('/webhook', express.raw({ type: 'application/json' }), subscriptionController.stripeBillingWebhook);

module.exports = router;
