const { Product, Category, Review } = require('../models');
const { Op } = require('sequelize');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

/**
 * CURRICULUM COVERAGE:
 * #801-850: Sequelize queries - findAll, findOne, create, update, destroy
 * #1651-1700: RESTful API Design - CRUD operations
 * #1701-1750: Pagination, filtering, sorting
 * #640-675: Complex queries with associations
 */

// @desc    Get all products with filtering, sorting, pagination
// @route   GET /api/products
exports.getAllProducts = asyncHandler(async (req, res, next) => {
    const {
        page = 1,
        limit = 12,
        category,
        minPrice,
        maxPrice,
        search,
        sortBy = 'createdAt',
        order = 'DESC',
        featured
    } = req.query;

    // Build query - #801-825: Sequelize where clause
    const where = { published: true };

    if (category) where.categoryId = category;
    if (featured) where.featured = featured === 'true';
    if (minPrice || maxPrice) {
        where.price = {};
        if (minPrice) where.price[Op.gte] = minPrice;
        if (maxPrice) where.price[Op.lte] = maxPrice;
    }
    if (search) {
        where[Op.or] = [
            { name: { [Op.iLike]: `%${search}%` } },
            { description: { [Op.iLike]: `%${search}%` } }
        ];
    }

    const offset = (page - 1) * limit;

    // Execute query with associations - #826-850: Include associations
    const { count, rows: products } = await Product.findAndCountAll({
        where,
        include: [
            {
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug']
            }
        ],
        limit: Number(limit),
        offset,
        order: [[sortBy, order]]
    });

    res.status(200).json({
        success: true,
        data: {
            products,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: count,
                pages: Math.ceil(count / limit)
            }
        }
    });
});

// @desc    Get single product
// @route   GET /api/products/:id
exports.getProduct = asyncHandler(async (req, res, next) => {
    const product = await Product.findByPk(req.params.id, {
        include: [
            { model: Category, as: 'category' },
            {
                model: Review,
                as: 'reviews',
                include: [{ model: require('./User'), as: 'user', attributes: ['name', 'avatar'] }]
            }
        ]
    });

    if (!product) {
        return next(new AppError('Product not found', 404));
    }

    res.status(200).json({
        success: true,
        data: product
    });
});

// @desc    Create product (Admin only)
// @route   POST /api/products
exports.createProduct = asyncHandler(async (req, res, next) => {
    const product = await Product.create(req.body);

    res.status(201).json({
        success: true,
        data: product
    });
});

// @desc    Update product
// @route   PUT /api/products/:id
exports.updateProduct = asyncHandler(async (req, res, next) => {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
        return next(new AppError('Product not found', 404));
    }

    await product.update(req.body);

    res.status(200).json({
        success: true,
        data: product
    });
});

// @desc    Delete product
// @route   DELETE /api/products/:id
exports.deleteProduct = asyncHandler(async (req, res, next) => {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
        return next(new AppError('Product not found', 404));
    }

    await product.destroy();

    res.status(200).json({
        success: true,
        message: 'Product deleted'
    });
});

// @desc    Update inventory
// @route   PATCH /api/products/:id/inventory
exports.updateInventory = asyncHandler(async (req, res, next) => {
    const { stock } = req.body;
    const product = await Product.findByPk(req.params.id);

    if (!product) {
        return next(new AppError('Product not found', 404));
    }

    product.stock = stock;
    await product.save();

    res.status(200).json({
        success: true,
        data: product
    });
});
