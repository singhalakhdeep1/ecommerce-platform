const { Order, OrderItem, Product, Cart, CartItem } = require('../models');
const { sequelize } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

/**
 * CURRICULUM COVERAGE:
 * #781-800: Database transactions - ACID properties
 * #640-675: Complex queries with joins and aggregations
 */

// @desc    Create order from cart
// @route   POST /api/orders
exports.createOrder = asyncHandler(async (req, res, next) => {
    const { shippingAddress, billingAddress, paymentMethod } = req.body;

    // Get user's cart
    const cart = await Cart.findOne({
        where: { userId: req.user.id },
        include: [{
            model: CartItem,
            as: 'items',
            include: ['product']
        }]
    });

    if (!cart || cart.items.length === 0) {
        return next(new AppError('Cart is empty', 400));
    }

    // Start transaction - #781-800: Sequelize transactions
    const transaction = await sequelize.transaction();

    try {
        // Calculate totals
        let subtotal = 0;
        const orderItems = [];

        for (const item of cart.items) {
            // Check stock availability
            if (item.product.stock < item.quantity) {
                throw new AppError(`Insufficient stock for ${item.product.name}`, 400);
            }

            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;

            orderItems.push({
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
                total: itemTotal,
                productSnapshot: {
                    name: item.product.name,
                    image: item.product.images[0],
                    sku: item.product.sku
                }
            });

            // Reduce product stock
            await item.product.decrement('stock', {
                by: item.quantity,
                transaction
            });
        }

        const tax = subtotal * 0.1; // 10% tax
        const shippingCost = subtotal > 50 ? 0 : 5.99;
        const totalAmount = subtotal + tax + shippingCost;

        // Create order
        const order = await Order.create({
            userId: req.user.id,
            subtotal,
            tax,
            shippingCost,
            totalAmount,
            paymentMethod,
            shippingAddress,
            billingAddress: billingAddress || shippingAddress
        }, { transaction });

        // Create order items
        for (const item of orderItems) {
            await OrderItem.create({
                ...item,
                orderId: order.id
            }, { transaction });
        }

        // Clear cart
        await CartItem.destroy({
            where: { cartId: cart.id },
            transaction
        });

        await cart.update({ totalAmount: 0 }, { transaction });

        // Commit transaction
        await transaction.commit();

        // Fetch complete order
        const completeOrder = await Order.findByPk(order.id, {
            include: ['items', 'user']
        });

        res.status(201).json({
            success: true,
            data: completeOrder
        });

    } catch (error) {
        // Rollback transaction
        await transaction.rollback();
        throw error;
    }
});

// @desc    Get user orders
// @route   GET /api/orders
exports.getUserOrders = asyncHandler(async (req, res, next) => {
    const orders = await Order.findAll({
        where: { userId: req.user.id },
        include: [{
            model: OrderItem,
            as: 'items',
            include: ['product']
        }],
        order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
        success: true,
        data: orders
    });
});

// @desc    Get single order
// @route   GET /api/orders/:id
exports.getOrder = asyncHandler(async (req, res, next) => {
    const order = await Order.findOne({
        where: {
            id: req.params.id,
            userId: req.user.id
        },
        include: ['items', 'user']
    });

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    res.status(200).json({
        success: true,
        data: order
    });
});

// @desc    Update order status (Admin)
// @route   PATCH /api/orders/:id/status
exports.updateOrderStatus = asyncHandler(async (req, res, next) => {
    const { status, trackingNumber } = req.body;

    const order = await Order.findByPk(req.params.id);

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    order.status = status;
    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (status === 'shipped') order.shippedAt = new Date();
    if (status === 'delivered') order.deliveredAt = new Date();

    await order.save();

    res.status(200).json({
        success: true,
        data: order
    });
});
