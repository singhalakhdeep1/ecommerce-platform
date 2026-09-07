const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paypal = require('@paypal/checkout-server-sdk');
const { Order, OrderItem, Product } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const sendEmail = require('../utils/sendEmail');

// PayPal Environment & Client Initialization - #1751-1800: PayPal API
// Fail loudly if credentials are absent — never fall back to dummy strings.
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
    throw new Error(
        'PayPal credentials are not configured. ' +
        'Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables.'
    );
}
const environment = process.env.NODE_ENV === 'production'
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret);
const paypalClient = new paypal.core.PayPalHttpClient(environment);

/**
 * CURRICULUM COVERAGE:
 * #1751-1800: Stripe Payment Integration - Payment intents, webhooks
 * #1801-1825: Webhook handling, payment verification
 * #1826-1850: Email notifications after payment
 */

// @desc    Create payment intent
// @route   POST /api/payments/create-intent
exports.createPaymentIntent = asyncHandler(async (req, res, next) => {
    const { orderId } = req.body;

    const order = await Order.findOne({
        where: { id: orderId, userId: req.user.id }
    });

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    // Create Stripe payment intent - #1751-1775: Stripe API
    const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(order.totalAmount * 100), // Convert to cents
        currency: 'usd',
        metadata: {
            orderId: order.id,
            userId: req.user.id
        },
        automatic_payment_methods: {
            enabled: true
        }
    });

    // Save payment intent ID
    order.stripePaymentIntentId = paymentIntent.id;
    await order.save();

    res.status(200).json({
        success: true,
        data: {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        }
    });
});

// @desc    Stripe webhook handler
// @route   POST /api/payments/webhook
exports.stripeWebhook = asyncHandler(async (req, res, next) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // Verify webhook signature - #1776-1800: Webhook security
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle event - #1801-1825: Webhook event handling
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;

            // Update order status
            const order = await Order.findOne({
                where: { stripePaymentIntentId: paymentIntent.id },
                include: ['user', 'items']
            });

            if (order) {
                order.paymentStatus = 'paid';
                order.status = 'processing';
                await order.save();

                // Simulate Split Payments - Calculate platform fee (10%) and seller payout (90%) - #1751-1800: Split payments
                const platformFee = order.totalAmount * 0.1;
                const sellerPayout = order.totalAmount * 0.9;

                // Send confirmation email - #1826-1850: Email notifications
                await sendEmail({
                    email: order.user.email,
                    subject: 'Order Confirmation',
                    message: `Your order ${order.orderNumber} has been confirmed!`
                });

                console.log(`✅ Payment succeeded for order ${order.orderNumber}`);
                console.log(`💵 Split Payment processed: Platform Fee = $${platformFee.toFixed(2)}, Seller Payout = $${sellerPayout.toFixed(2)}`);

                // Dispatch Outgoing Webhook - Category 22 Integrations
                const WebhookDispatcher = require('../utils/webhookDispatcher');
                await WebhookDispatcher.dispatch('order.paid', {
                    orderNumber: order.orderNumber,
                    totalAmount: order.totalAmount,
                    platformFee,
                    sellerPayout,
                    paymentMethod: 'stripe'
                }, order.userId);
            }
            break;

        case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;

            const failedOrder = await Order.findOne({
                where: { stripePaymentIntentId: failedPayment.id }
            });

            if (failedOrder) {
                failedOrder.paymentStatus = 'failed';
                await failedOrder.save();
            }
            break;

        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
});

// @desc    Refund payment
// @route   POST /api/payments/refund/:orderId
exports.refundPayment = asyncHandler(async (req, res, next) => {
    const order = await Order.findByPk(req.params.orderId);

    if (!order || !order.stripePaymentIntentId) {
        return next(new AppError('Order not found or no payment to refund', 404));
    }

    // Create refund
    const refund = await stripe.refunds.create({
        payment_intent: order.stripePaymentIntentId
    });

    order.paymentStatus = 'refunded';
    order.status = 'cancelled';
    await order.save();

    res.status(200).json({
        success: true,
        message: 'Refund processed',
        data: refund
    });
});

// @desc    Create PayPal Order
// @route   POST /api/payments/paypal/create
exports.createPaypalOrder = asyncHandler(async (req, res, next) => {
    const { orderId } = req.body;

    const order = await Order.findOne({
        where: { id: orderId, userId: req.user.id }
    });

    if (!order) {
        return next(new AppError('Order not found', 404));
    }

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
            amount: {
                currency_code: 'USD',
                value: order.totalAmount.toString()
            },
            custom_id: order.id
        }]
    });

    try {
        const response = await paypalClient.execute(request);
        order.stripePaymentIntentId = response.result.id; // Store in shared payment ID field
        await order.save();

        res.status(200).json({
            success: true,
            orderId: response.result.id,
            links: response.result.links
        });
    } catch (err) {
        return next(new AppError(`PayPal Error: ${err.message}`, 500));
    }
});

// @desc    Capture PayPal Order
// @route   POST /api/payments/paypal/capture
exports.capturePaypalOrder = asyncHandler(async (req, res, next) => {
    const { paypalOrderId } = req.body;

    if (!paypalOrderId) {
        return next(new AppError('PayPal Order ID is required', 400));
    }

    const request = new paypal.orders.OrdersCaptureRequest(paypalOrderId);
    request.requestBody({});

    try {
        const response = await paypalClient.execute(request);
        const orderId = response.result.purchase_units[0].custom_id;
        
        const order = await Order.findOne({
            where: { id: orderId },
            include: ['user']
        });

        if (order) {
            order.paymentStatus = 'paid';
            order.status = 'processing';
            await order.save();

            // Simulate Split Payments - Calculate platform fee (10%) and seller payout (90%) - #1751-1800: Split payments
            const platformFee = order.totalAmount * 0.1;
            const sellerPayout = order.totalAmount * 0.9;
            console.log(`💵 Split Payment processed via PayPal: Platform Fee = $${platformFee.toFixed(2)}, Seller Payout = $${sellerPayout.toFixed(2)}`);

            // Send confirmation email
            await sendEmail({
                email: order.user.email,
                subject: 'Order Confirmation (PayPal)',
                message: `Your order ${order.orderNumber} has been paid via PayPal!`
            });

            // Dispatch Outgoing Webhook - Category 22 Integrations
            const WebhookDispatcher = require('../utils/webhookDispatcher');
            await WebhookDispatcher.dispatch('order.paid', {
                orderNumber: order.orderNumber,
                totalAmount: order.totalAmount,
                platformFee,
                sellerPayout,
                paymentMethod: 'paypal'
            }, order.userId);
        }

        res.status(200).json({
            success: true,
            status: response.result.status,
            data: response.result
        });
    } catch (err) {
        return next(new AppError(`PayPal Capture Error: ${err.message}`, 500));
    }
});
