const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Subscription, User } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

/**
 * CURRICULUM COVERAGE:
 * #1751-1800: Stripe recurring billing, subscription management
 * #1801-1825: Webhook billing handlers
 */

// @desc    Create Stripe Subscription
// @route   POST /api/subscriptions/create
exports.createSubscription = asyncHandler(async (req, res, next) => {
    const { priceId } = req.body; // Stripe Price API ID

    if (!priceId) {
        return next(new AppError('Price ID is required', 400));
    }

    // Get user email
    const user = await User.findByPk(req.user.id);

    // Create or get Stripe customer
    let customerId;
    if (user.stripeCustomerId) {
        customerId = user.stripeCustomerId;
    } else {
        const customer = await stripe.customers.create({
            email: user.email,
            metadata: { userId: user.id }
        });
        customerId = customer.id;
        user.stripeCustomerId = customerId;
        await user.save();
    }

    // Create Subscription session
    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
            price: priceId,
            quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/subscription/cancel`,
    });

    res.status(200).json({
        success: true,
        sessionId: session.id,
        checkoutUrl: session.url
    });
});

// @desc    Handle Stripe Billing Webhooks
// @route   POST /api/subscriptions/webhook
exports.stripeBillingWebhook = asyncHandler(async (req, res, next) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_BILLING_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
            const stripeSub = event.data.object;
            const customer = await stripe.customers.retrieve(stripeSub.customer);
            const userId = customer.metadata.userId;

            if (userId) {
                await Subscription.upsert({
                    userId: parseInt(userId),
                    stripeSubscriptionId: stripeSub.id,
                    planId: stripeSub.items.data[0].price.id,
                    status: stripeSub.status,
                    currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
                    currentPeriodEnd: new Date(stripeSub.current_period_end * 1000)
                });
            }
            break;
        }

        case 'customer.subscription.deleted': {
            const stripeSub = event.data.object;
            const dbSub = await Subscription.findOne({
                where: { stripeSubscriptionId: stripeSub.id }
            });

            if (dbSub) {
                dbSub.status = 'canceled';
                await dbSub.save();
            }
            break;
        }

        case 'invoice.payment_failed': {
            const invoice = event.data.object;
            if (invoice.subscription) {
                const dbSub = await Subscription.findOne({
                    where: { stripeSubscriptionId: invoice.subscription }
                });
                if (dbSub) {
                    dbSub.status = 'past_due';
                    await dbSub.save();
                }
            }
            break;
        }

        default:
            console.log(`Unhandled billing event type: ${event.type}`);
    }

    res.json({ received: true });
});
