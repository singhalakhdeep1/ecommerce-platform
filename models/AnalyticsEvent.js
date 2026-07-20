const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AnalyticsEvent = sequelize.define('AnalyticsEvent', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    eventType: {
        type: DataTypes.STRING,
        allowNull: false // e.g. 'view_item', 'add_to_cart', 'checkout', 'purchase'
    },
    eventData: {
        type: DataTypes.JSONB,
        allowNull: true
    },
    abGroup: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'A' // A/B testing group
    }
}, {
    timestamps: true,
    updatedAt: false // Analytics events are write-only/immutable
});

module.exports = AnalyticsEvent;
