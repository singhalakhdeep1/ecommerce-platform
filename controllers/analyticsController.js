const { AnalyticsEvent, User, Order } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { Op } = require('sequelize');

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
