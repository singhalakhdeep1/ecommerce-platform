const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * CURRICULUM COVERAGE:
 * #640-660: Database relationships - One-to-Many
 * #661-675: Complex queries, aggregations
 */

const Order = sequelize.define('Order', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    orderNumber: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled'),
        defaultValue: 'pending'
    },
    totalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    subtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    tax: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    shippingCost: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    discount: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    paymentMethod: {
        type: DataTypes.STRING,
        allowNull: false
    },
    paymentStatus: {
        type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
        defaultValue: 'pending'
    },
    stripePaymentIntentId: {
        type: DataTypes.STRING
    },
    shippingAddress: {
        type: DataTypes.JSONB,
        allowNull: false
    },
    billingAddress: {
        type: DataTypes.JSONB
    },
    notes: {
        type: DataTypes.TEXT
    },
    trackingNumber: {
        type: DataTypes.STRING
    },
    shippedAt: {
        type: DataTypes.DATE
    },
    deliveredAt: {
        type: DataTypes.DATE
    }
}, {
    tableName: 'orders',
    hooks: {
        beforeCreate: (order) => {
            order.orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        }
    }
});

module.exports = Order;
