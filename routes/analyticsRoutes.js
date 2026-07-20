const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

router.post('/track', protect, analyticsController.trackEvent);
router.get('/funnel', protect, analyticsController.getFunnelReport);
router.get('/cohort', protect, analyticsController.getCohortReport);

module.exports = router;
