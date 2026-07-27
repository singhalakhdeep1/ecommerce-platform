const { Wishlist, Product } = require('../models');
const { Op } = require('sequelize');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

/**
 * CURRICULUM COVERAGE:
 * #1651-1700: RESTful API Design - Wishlist CRUD operations
 * #801-850: Sequelize queries with associations
 */

// @desc    Get user's wishlist
// @route   GET /api/wishlist
exports.getWishlist = asyncHandler(async (req, res, next) => {
    const wishlist = await Wishlist.findAll({
        where: { userId: req.user.id },
        include: [{
            model: Product,
            as: 'product',
            attributes: ['id', 'name', 'price', 'images', 'stock', 'slug']
        }],
        order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
        success: true,
        data: wishlist
    });
});

// @desc    Add item to wishlist
// @route   POST /api/wishlist
exports.addToWishlist = asyncHandler(async (req, res, next) => {
    const { productId, notes, priority } = req.body;

    // Check if product exists
    const product = await Product.findByPk(productId);
    if (!product) {
        return next(new AppError('Product not found', 404));
    }

    // Check if already in wishlist
    const existingItem = await Wishlist.findOne({
        where: { userId: req.user.id, productId }
    });

    if (existingItem) {
        return next(new AppError('Product already in wishlist', 400));
    }

    const wishlistItem = await Wishlist.create({
        userId: req.user.id,
        productId,
        notes,
        priority: priority || 'medium'
    });

    const completeItem = await Wishlist.findByPk(wishlistItem.id, {
        include: [{
            model: Product,
            as: 'product',
            attributes: ['id', 'name', 'price', 'images', 'stock', 'slug']
        }]
    });

    res.status(201).json({
        success: true,
        data: completeItem
    });
});

// @desc    Update wishlist item
// @route   PUT /api/wishlist/:id
exports.updateWishlistItem = asyncHandler(async (req, res, next) => {
    const { notes, priority } = req.body;

    const wishlistItem = await Wishlist.findOne({
        where: { id: req.params.id, userId: req.user.id }
    });

    if (!wishlistItem) {
        return next(new AppError('Wishlist item not found', 404));
    }

    if (notes !== undefined) wishlistItem.notes = notes;
    if (priority !== undefined) wishlistItem.priority = priority;

    await wishlistItem.save();

    const updatedItem = await Wishlist.findByPk(wishlistItem.id, {
        include: [{
            model: Product,
            as: 'product',
            attributes: ['id', 'name', 'price', 'images', 'stock', 'slug']
        }]
    });

    res.status(200).json({
        success: true,
        data: updatedItem
    });
});

// @desc    Remove item from wishlist
// @route   DELETE /api/wishlist/:id
exports.removeFromWishlist = asyncHandler(async (req, res, next) => {
    const wishlistItem = await Wishlist.findOne({
        where: { id: req.params.id, userId: req.user.id }
    });

    if (!wishlistItem) {
        return next(new AppError('Wishlist item not found', 404));
    }

    await wishlistItem.destroy();

    res.status(200).json({
        success: true,
        message: 'Item removed from wishlist'
    });
});

// @desc    Clear wishlist
// @route   DELETE /api/wishlist
exports.clearWishlist = asyncHandler(async (req, res, next) => {
    await Wishlist.destroy({
        where: { userId: req.user.id }
    });

    res.status(200).json({
        success: true,
        message: 'Wishlist cleared'
    });
});

// @desc    Move item from wishlist to cart
// @route   POST /api/wishlist/:id/move-to-cart
exports.moveToCart = asyncHandler(async (req, res, next) => {
    const wishlistItem = await Wishlist.findOne({
        where: { id: req.params.id, userId: req.user.id },
        include: [{ model: Product, as: 'product' }]
    });

    if (!wishlistItem) {
        return next(new AppError('Wishlist item not found', 404));
    }

    // Check stock
    if (wishlistItem.product.stock < 1) {
        return next(new AppError('Product is out of stock', 400));
    }

    // Add to cart (assuming cart controller exists)
    const { CartItem } = require('../models');
    const { Cart } = require('../models');

    let cart = await Cart.findOne({ where: { userId: req.user.id } });
    if (!cart) {
        cart = await Cart.create({ userId: req.user.id, totalAmount: 0 });
    }

    const existingCartItem = await CartItem.findOne({
        where: { cartId: cart.id, productId: wishlistItem.productId }
    });

    if (existingCartItem) {
        existingCartItem.quantity += 1;
        await existingCartItem.save();
    } else {
        await CartItem.create({
            cartId: cart.id,
            productId: wishlistItem.productId,
            quantity: 1,
            price: wishlistItem.product.price
        });
    }

    // Remove from wishlist
    await wishlistItem.destroy();

    res.status(200).json({
        success: true,
        message: 'Item moved to cart'
    });
});
