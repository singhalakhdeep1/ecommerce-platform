const { AnalyticsEvent, User, Order, Product, OrderItem } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * CURRICULUM COVERAGE:
 * #2451-2475: Feature Flags & A/B Testing
 * #640-675: Advanced aggregation reports
 */

// @desc    Track a user behavior event
// @route   POST /api/analytics/track
exports.trackEvent = asyncHandler(async (req, res, next) => {
    const { eventType, eventData } = req.body;

    if (!eventType) {
        return next(new AppError('Event type is required', 400));
    }

    // A/B Group Assignment (simple deterministic hashing based on userId or IP)
    const seed = req.user ? req.user.id.toString() : req.ip;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const abGroup = Math.abs(hash) % 2 === 0 ? 'A' : 'B';

    const event = await AnalyticsEvent.create({
        userId: req.user ? req.user.id : null,
        eventType,
        eventData,
        abGroup
    });

    res.status(201).json({
        success: true,
        data: {
            id: event.id,
            abGroup
        }
    });
});

// @desc    Get purchase funnel analysis report
// @route   GET /api/analytics/funnel
exports.getFunnelReport = asyncHandler(async (req, res, next) => {
    // We analyze 4 steps: view_item -> add_to_cart -> checkout -> purchase
    const steps = ['view_item', 'add_to_cart', 'checkout', 'purchase'];
    const report = {};

    for (const step of steps) {
        // Count distinct users or sessions
        const count = await AnalyticsEvent.count({
            where: { eventType: step },
            distinct: true,
            col: 'userId'
        });
        report[step] = count;
    }

    // Calculate conversion rates
    const rates = {
        view_to_cart: report.view_item ? (report.add_to_cart / report.view_item) * 100 : 0,
        cart_to_checkout: report.add_to_cart ? (report.checkout / report.add_to_cart) * 100 : 0,
        checkout_to_purchase: report.checkout ? (report.purchase / report.checkout) * 100 : 0,
        overall: report.view_item ? (report.purchase / report.view_item) * 100 : 0
    };

    res.status(200).json({
        success: true,
        data: {
            counts: report,
            conversionRates: rates
        }
    });
});

// @desc    Get user retention cohort report (by signup month)
// @route   GET /api/analytics/cohort
exports.getCohortReport = asyncHandler(async (req, res, next) => {
    // Cohorts grouped by user signup month
    const users = await User.findAll({
        attributes: ['id', 'createdAt']
    });

    const cohorts = {};

    // Map signups to month cohorts
    users.forEach(user => {
        const signupMonth = user.createdAt.toISOString().substring(0, 7); // YYYY-MM
        if (!cohorts[signupMonth]) {
            cohorts[signupMonth] = {
                cohortName: signupMonth,
                size: 0,
                retention: {} // Month 1, Month 2 retention count
            };
        }
        cohorts[signupMonth].size += 1;
    });

    // Check purchase events grouped by signup month
    const events = await AnalyticsEvent.findAll({
        attributes: ['userId', 'createdAt'],
        where: { eventType: 'purchase' }
    });

    events.forEach(event => {
        const user = users.find(u => u.id === event.userId);
        if (!user) return;

        const signupMonth = user.createdAt.toISOString().substring(0, 7);
        const eventMonth = event.createdAt.toISOString().substring(0, 7);

        // Calculate diff in months
        const signupDate = new Date(user.createdAt);
        const eventDate = new Date(event.createdAt);
        const diffMonths = (eventDate.getFullYear() - signupDate.getFullYear()) * 12 + (eventDate.getMonth() - signupDate.getMonth());

        if (diffMonths >= 0 && cohorts[signupMonth]) {
            const retentionKey = `Month ${diffMonths}`;
            if (!cohorts[signupMonth].retention[retentionKey]) {
                cohorts[signupMonth].retention[retentionKey] = new Set();
            }
            cohorts[signupMonth].retention[retentionKey].add(event.userId);
        }
    });

    // Transform Sets to size counts
    Object.keys(cohorts).forEach(key => {
        Object.keys(cohorts[key].retention).forEach(retKey => {
            cohorts[key].retention[retKey] = cohorts[key].retention[retKey].size;
        });
    });

    res.status(200).json({
        success: true,
        data: Object.values(cohorts)
    });
});

// @desc    Get inventory reports
// @route   GET /api/analytics/inventory
exports.getInventoryReport = asyncHandler(async (req, res, next) => {
    const { startDate, endDate } = req.query;

    // Get all products with stock information
    const products = await Product.findAll({
        attributes: ['id', 'name', 'sku', 'stock', 'lowStockThreshold', 'price']
    });

    // Low stock products
    const lowStockProducts = products.filter(p => p.stock <= p.lowStockThreshold);
    
    // Out of stock products
    const outOfStockProducts = products.filter(p => p.stock === 0);

    // Total inventory value
    const totalInventoryValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);

    // Get sales data for the period
    const salesData = await OrderItem.findAll({
        include: [{
            model: Order,
            where: {
                status: { [Op.ne]: 'cancelled' },
                ...(startDate && { createdAt: { [Op.gte]: startDate } }),
                ...(endDate && { createdAt: { [Op.lte]: endDate } })
            }
        }]
    });

    // Calculate sales by product
    const salesByProduct = {};
    salesData.forEach(item => {
        if (!salesByProduct[item.productId]) {
            salesByProduct[item.productId] = 0;
        }
        salesByProduct[item.productId] += item.quantity;
    });

    // Calculate turnover rate (simplified)
    const totalSales = Object.values(salesByProduct).reduce((a, b) => a + b, 0);
    const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
    const turnoverRate = totalStock > 0 ? (totalSales / totalStock) * 100 : 0;

    // Top selling products
    const topSellingProducts = Object.entries(salesByProduct)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([productId, quantity]) => {
            const product = products.find(p => p.id === productId);
            return {
                productId,
                name: product?.name || 'Unknown',
                sku: product?.sku || 'Unknown',
                quantitySold: quantity
            };
        });

    // Slow moving products (low sales, high stock)
    const slowMovingProducts = products
        .filter(p => p.stock > 10 && (!salesByProduct[p.id] || salesByProduct[p.id] < 5))
        .map(p => ({
            productId: p.id,
            name: p.name,
            sku: p.sku,
            stock: p.stock,
            sales: salesByProduct[p.id] || 0
        }));

    const report = {
        summary: {
            totalProducts: products.length,
            lowStockCount: lowStockProducts.length,
            outOfStockCount: outOfStockProducts.length,
            totalInventoryValue: parseFloat(totalInventoryValue.toFixed(2)),
            turnoverRate: parseFloat(turnoverRate.toFixed(2))
        },
        lowStockProducts: lowStockProducts.map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            stock: p.stock,
            threshold: p.lowStockThreshold
        })),
        outOfStockProducts: outOfStockProducts.map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku
        })),
        topSellingProducts,
        slowMovingProducts
    };

    logger.info('Inventory report generated', { 
        totalProducts: products.length,
        lowStockCount: lowStockProducts.length 
    });

    res.status(200).json({
        success: true,
        data: report
    });
});

// @desc    Get sales analytics
// @route   GET /api/analytics/sales
exports.getSalesAnalytics = asyncHandler(async (req, res, next) => {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    const whereClause = {
        status: { [Op.ne]: 'cancelled' }
    };

    if (startDate) whereClause.createdAt = { ...whereClause.createdAt, [Op.gte]: startDate };
    if (endDate) whereClause.createdAt = { ...whereClause.createdAt, [Op.lte]: endDate };

    const orders = await Order.findAll({
        where: whereClause,
        attributes: ['totalAmount', 'createdAt', 'status']
    });

    // Calculate total revenue
    const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.totalAmount), 0);

    // Calculate average order value
    const averageOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    // Group by date
    const salesByDate = {};
    orders.forEach(order => {
        const dateKey = groupBy === 'day' 
            ? order.createdAt.toISOString().split('T')[0]
            : order.createdAt.toISOString().substring(0, 7); // month
        
        if (!salesByDate[dateKey]) {
            salesByDate[dateKey] = {
                date: dateKey,
                revenue: 0,
                orders: 0
            };
        }
        salesByDate[dateKey].revenue += parseFloat(order.totalAmount);
        salesByDate[dateKey].orders += 1;
    });

    const salesTrend = Object.values(salesByDate).sort((a, b) => a.date.localeCompare(b.date));

    res.status(200).json({
        success: true,
        data: {
            totalRevenue: parseFloat(totalRevenue.toFixed(2)),
            totalOrders: orders.length,
            averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
            salesTrend
        }
    });
});
