const { Discount, Order, User } = require('../models');
const { Op } = require('sequelize');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

/**
 * CURRICULUM COVERAGE:
 * #1651-1700: RESTful API Design - Discount CRUD operations
 * #801-850: Sequelize queries with complex conditions
 */

// @desc    Get all discounts (Admin)
// @route   GET /api/discounts
exports.getAllDiscounts = asyncHandler(async (req, res, next) => {
    const { page = 1, limit = 20, active } = req.query;

    const where = {};
    if (active !== undefined) where.isActive = active === 'true';

    const { count, rows: discounts } = await Discount.findAndCountAll({
        where,
        limit: Number(limit),
        offset: (page - 1) * limit,
        order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
        success: true,
        data: {
            discounts,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: count,
                pages: Math.ceil(count / limit)
            }
        }
    });
});

// @desc    Get single discount
// @route   GET /api/discounts/:id
exports.getDiscount = asyncHandler(async (req, res, next) => {
    const discount = await Discount.findByPk(req.params.id);

    if (!discount) {
        return next(new AppError('Discount not found', 404));
    }

    res.status(200).json({
        success: true,
        data: discount
    });
});

// @desc    Create discount (Admin)
// @route   POST /api/discounts
exports.createDiscount = asyncHandler(async (req, res, next) => {
    const discount = await Discount.create(req.body);

    res.status(201).json({
        success: true,
        data: discount
    });
});

// @desc    Update discount (Admin)
// @route   PUT /api/discounts/:id
exports.updateDiscount = asyncHandler(async (req, res, next) => {
    const discount = await Discount.findByPk(req.params.id);

    if (!discount) {
        return next(new AppError('Discount not found', 404));
    }

    await discount.update(req.body);

    res.status(200).json({
        success: true,
        data: discount
    });
});

// @desc    Delete discount (Admin)
// @route   DELETE /api/discounts/:id
exports.deleteDiscount = asyncHandler(async (req, res, next) => {
    const discount = await Discount.findByPk(req.params.id);

    if (!discount) {
        return next(new AppError('Discount not found', 404));
    }

    await discount.destroy();

    res.status(200).json({
        success: true,
        message: 'Discount deleted'
    });
});

// @desc    Validate discount code
// @route   POST /api/discounts/validate
exports.validateDiscount = asyncHandler(async (req, res, next) => {
    const { code, cartTotal, userId, productIds, categoryIds } = req.body;

    const discount = await Discount.findOne({
        where: {
            code: code.toUpperCase(),
            isActive: true
        }
    });

    if (!discount) {
        return next(new AppError('Invalid discount code', 400));
    }

    // Check if discount is within valid date range
    const now = new Date();
    if (now < discount.startDate || now > discount.endDate) {
        return next(new AppError('Discount code has expired or is not yet active', 400));
    }

    // Check minimum purchase requirement
    if (cartTotal < discount.minimumPurchase) {
        return next(new AppError(`Minimum purchase of $${discount.minimumPurchase} required`, 400));
    }

    // Check usage limit
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
        return next(new AppError('Discount code usage limit reached', 400));
    }

    // Check user-specific usage limit
    if (userId) {
        const userOrders = await Order.count({
            where: {
                userId,
                discountCode: code,
                status: { [Op.ne]: 'cancelled' }
            }
        });

        if (userOrders >= discount.userLimit) {
            return next(new AppError('You have reached the usage limit for this discount', 400));
        }
    }

    // Check if discount applies to specific products/categories
    if (discount.applicableProducts.length > 0 || discount.applicableCategories.length > 0) {
        let applicable = false;

        if (discount.applicableProducts.length > 0 && productIds) {
            const hasApplicableProduct = productIds.some(id => 
                discount.applicableProducts.includes(id)
            );
            if (hasApplicableProduct) applicable = true;
        }

        if (discount.applicableCategories.length > 0 && categoryIds) {
            const hasApplicableCategory = categoryIds.some(id => 
                discount.applicableCategories.includes(id)
            );
            if (hasApplicableCategory) applicable = true;
        }

        if (!applicable) {
            return next(new AppError('Discount code does not apply to these items', 400));
        }
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (discount.type === 'percentage') {
        discountAmount = cartTotal * (discount.value / 100);
        if (discount.maxDiscount && discountAmount > discount.maxDiscount) {
            discountAmount = discount.maxDiscount;
        }
    } else if (discount.type === 'fixed') {
        discountAmount = discount.value;
    } else if (discount.type === 'free_shipping') {
        discountAmount = 0; // Will be handled in order calculation
    }

    res.status(200).json({
        success: true,
        data: {
            discount: {
                id: discount.id,
                code: discount.code,
                type: discount.type,
                value: discount.value,
                description: discount.description
            },
            discountAmount: discountAmount.toFixed(2),
            applicable: true
        }
    });
});

// @desc    Apply discount to order
// @route   POST /api/discounts/apply
exports.applyDiscount = asyncHandler(async (req, res, next) => {
    const { code, orderId } = req.body;

    const discount = await Discount.findOne({
        where: {
            code: code.toUpperCase(),
            isActive: true
        }
    });

    if (!discount) {
        return next(new AppError('Invalid discount code', 400));
    }

    const order = await Order.findByPk(orderId);

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (discount.type === 'percentage') {
        discountAmount = order.subtotal * (discount.value / 100);
        if (discount.maxDiscount && discountAmount > discount.maxDiscount) {
            discountAmount = discount.maxDiscount;
        }
    } else if (discount.type === 'fixed') {
        discountAmount = discount.value;
    } else if (discount.type === 'free_shipping') {
        discountAmount = order.shippingCost;
    }

    // Update order
    order.discount = discountAmount;
    order.discountCode = discount.code;
    order.totalAmount = order.subtotal + order.tax + order.shippingCost - discountAmount;
    await order.save();

    // Increment discount usage count
    await discount.increment('usageCount');

    res.status(200).json({
        success: true,
        data: order
    });
});
