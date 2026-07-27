const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const marketingRoutes = require('./routes/marketingRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const discountRoutes = require('./routes/discountRoutes');

const errorHandler = require('./middleware/errorHandler');
const { sequelize } = require('./models');

const app = express();

/**
 * CURRICULUM COVERAGE:
 * #751-800: SQL Databases - PostgreSQL connection, Sequelize ORM
 * #801-850: Sequelize - Models, associations, migrations, queries
 * #1001-1010: Express middleware, error handling
 * #1751-1800: Payment Integration - Stripe webhooks
 * #1826-1850: Third-party APIs - Email notifications
 * #476-500: Express production features - logging, API docs
 */

// Security Middleware
app.use(helmet()); // #951-960: Security headers
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined')); // #476-500: Logging

// Rate Limiting - #951-1000: Security best practices
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Swagger API Documentation - #476-500: API documentation
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'E-Commerce API',
            version: '1.0.0',
            description: 'Complete E-Commerce Backend API'
        },
        servers: [{ url: `http://localhost:${process.env.PORT || 5000}` }]
    },
    apis: ['./routes/*.js']
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/discounts', discountRoutes);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        database: sequelize.authenticate() ? 'Connected' : 'Disconnected',
        timestamp: new Date()
    });
});

// Error Handler
app.use(errorHandler);

// Database Connection & Server Start
const PORT = process.env.PORT || 5000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/ecommerce';

// Override database URL if not set
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = DATABASE_URL;
}

sequelize.authenticate()
    .then(() => {
        console.log('✅ PostgreSQL Connected');

        // Sync models - #801-850: Sequelize sync
        return sequelize.sync({ alter: true });
    })
    .then(() => {
        console.log('✅ Database Synchronized');

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📚 API Docs: http://localhost:${PORT}/api-docs`);
        });
    })
    .catch((error) => {
        console.error('❌ Database Connection Error:', error);
        process.exit(1);
    });

module.exports = app;
