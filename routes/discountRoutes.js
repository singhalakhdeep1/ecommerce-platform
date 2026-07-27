const express = require('express');
const router = express.Router();
const discountController = require('../controllers/discountController');
const auth = require('../middleware/auth');

/**
 * CURRICULUM COVERAGE:
 * #1651-1700: RESTful API Design - Discount routes
 * #951-1000: Security - Protected routes
 */

// Public route - validate discount code
router.post('/validate', discountController.validateDiscount);

// Protected routes
router.use(auth);

// @route   GET /api/discounts
// @desc    Get all discounts (Admin)
router.get('/', discountController.getAllDiscounts);

// @route   GET /api/discounts/:id
// @desc    Get single discount
router.get('/:id', discountController.getDiscount);

// @route   POST /api/discounts
// @desc    Create discount (Admin)
router.post('/', discountController.createDiscount);

// @route   PUT /api/discounts/:id
// @desc    Update discount (Admin)
router.put('/:id', discountController.updateDiscount);

// @route   DELETE /api/discounts/:id
// @desc    Delete discount (Admin)
router.delete('/:id', discountController.deleteDiscount);

// @route   POST /api/discounts/apply
// @desc    Apply discount to order
router.post('/apply', discountController.applyDiscount);

module.exports = router;
