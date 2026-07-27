const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlistController');
const auth = require('../middleware/auth');

/**
 * CURRICULUM COVERAGE:
 * #1651-1700: RESTful API Design - Wishlist routes
 * #951-1000: Security - Protected routes
 */

// All wishlist routes require authentication
router.use(auth);

// @route   GET /api/wishlist
// @desc    Get user's wishlist
router.get('/', wishlistController.getWishlist);

// @route   POST /api/wishlist
// @desc    Add item to wishlist
router.post('/', wishlistController.addToWishlist);

// @route   PUT /api/wishlist/:id
// @desc    Update wishlist item
router.put('/:id', wishlistController.updateWishlistItem);

// @route   DELETE /api/wishlist/:id
// @desc    Remove item from wishlist
router.delete('/:id', wishlistController.removeFromWishlist);

// @route   DELETE /api/wishlist
// @desc    Clear wishlist
router.delete('/', wishlistController.clearWishlist);

// @route   POST /api/wishlist/:id/move-to-cart
// @desc    Move item from wishlist to cart
router.post('/:id/move-to-cart', wishlistController.moveToCart);

module.exports = router;
