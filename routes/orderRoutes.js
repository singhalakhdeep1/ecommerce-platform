const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', orderController.getUserOrders);
router.post('/', orderController.createOrder);
router.get('/:id', orderController.getOrder);

// Admin routes
router.patch('/:id/status', authorize('admin'), orderController.updateOrderStatus);

module.exports = router;
