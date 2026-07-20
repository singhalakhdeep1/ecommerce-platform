const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Subscription = sequelize.define('Subscription', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    stripeSubscriptionId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    planId: {
        type: DataTypes.STRING,
        allowNull: false // e.g. 'premium-monthly', 'basic-yearly'
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending' // e.g. 'active', 'canceled', 'past_due'
    },
    currentPeriodStart: {
        type: DataTypes.DATE,
        allowNull: false
    },
    currentPeriodEnd: {
        type: DataTypes.DATE,
        allowNull: false
    }
});

module.exports = Subscription;
