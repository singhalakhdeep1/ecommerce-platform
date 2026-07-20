const { Cart, CartItem, Product } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// @desc    Get user cart
// @route   GET /api/cart
exports.getCart = asyncHandler(async (req, res, next) => {
    let cart = await Cart.findOne({
        where: { userId: req.user.id },
        include: [{
            model: CartItem,
            as: 'items',
            include: ['product']
        }]
    });

    if (!cart) {
        cart = await Cart.create({ userId: req.user.id });
    }

    res.status(200).json({
        success: true,
        data: cart
    });
});

// @desc    Add item to cart
// @route   POST /api/cart/items
exports.addToCart = asyncHandler(async (req, res, next) => {
    const { productId, quantity = 1 } = req.body;

    const product = await Product.findByPk(productId);
    if (!product) {
        return next(new AppError('Product not found', 404));
    }

    if (product.stock < quantity) {
        return next(new AppError('Insufficient stock', 400));
    }

    let cart = await Cart.findOne({ where: { userId: req.user.id } });
    if (!cart) {
        cart = await Cart.create({ userId: req.user.id });
    }

    // Check if item already in cart
    let cartItem = await CartItem.findOne({
        where: { cartId: cart.id, productId }
    });

    if (cartItem) {
        cartItem.quantity += quantity;
        await cartItem.save();
    } else {
        cartItem = await CartItem.create({
            cartId: cart.id,
            productId,
            quantity,
            price: product.price
        });
    }

    // Update cart total
    const items = await CartItem.findAll({ where: { cartId: cart.id } });
    cart.totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    await cart.save();

    // Fetch updated cart
    cart = await Cart.findByPk(cart.id, {
        include: [{
            model: CartItem,
            as: 'items',
            include: ['product']
        }]
    });

    res.status(200).json({
        success: true,
        data: cart
    });
});

// @desc    Update cart item quantity
// @route   PUT /api/cart/items/:itemId
exports.updateCartItem = asyncHandler(async (req, res, next) => {
    const { quantity } = req.body;

    const cartItem = await CartItem.findByPk(req.params.itemId, {
        include: ['product']
    });

    if (!cartItem) {
        return next(new AppError('Cart item not found', 404));
    }

    if (cartItem.product.stock < quantity) {
        return next(new AppError('Insufficient stock', 400));
    }

    cartItem.quantity = quantity;
    await cartItem.save();

    // Update cart total
    const cart = await Cart.findByPk(cartItem.cartId, {
        include: [{
            model: CartItem,
            as: 'items',
            include: ['product']
        }]
    });

    cart.totalAmount = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    await cart.save();

    res.status(200).json({
        success: true,
        data: cart
    });
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/items/:itemId
exports.removeFromCart = asyncHandler(async (req, res, next) => {
    const cartItem = await CartItem.findByPk(req.params.itemId);

    if (!cartItem) {
        return next(new AppError('Cart item not found', 404));
    }

    const cartId = cartItem.cartId;
    await cartItem.destroy();

    // Update cart total
    const cart = await Cart.findByPk(cartId, {
        include: [{
            model: CartItem,
            as: 'items',
            include: ['product']
        }]
    });

    cart.totalAmount = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    await cart.save();

    res.status(200).json({
        success: true,
        data: cart
    });
});

// @desc    Clear cart
// @route   DELETE /api/cart
exports.clearCart = asyncHandler(async (req, res, next) => {
    const cart = await Cart.findOne({ where: { userId: req.user.id } });

    if (cart) {
        await CartItem.destroy({ where: { cartId: cart.id } });
        cart.totalAmount = 0;
        await cart.save();
    }

    res.status(200).json({
        success: true,
        message: 'Cart cleared'
    });
});
