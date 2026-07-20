const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

router.post('/create-intent', protect, paymentController.createPaymentIntent);
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.stripeWebhook);
router.post('/refund/:orderId', protect, paymentController.refundPayment);

// PayPal payment routes - #1751-1800: PayPal integrations
router.post('/paypal/create', protect, paymentController.createPaypalOrder);
router.post('/paypal/capture', protect, paymentController.capturePaypalOrder);

module.exports = router;
