const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WebhookSubscription = sequelize.define('WebhookSubscription', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    targetUrl: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            isUrl: true
        }
    },
    event: {
        type: DataTypes.STRING,
        allowNull: false // e.g. 'order.created', 'order.paid'
    },
    secret: {
        type: DataTypes.STRING,
        allowNull: false
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
});

module.exports = WebhookSubscription;
