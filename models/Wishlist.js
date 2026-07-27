const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * CURRICULUM COVERAGE:
 * #801-825: Sequelize Models - Wishlist model
 * #640-675: Database relationships - Many-to-Many
 */

const Wishlist = sequelize.define('Wishlist', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    productId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'Products',
            key: 'id'
        }
    },
    notes: {
        type: DataTypes.TEXT
    },
    priority: {
        type: DataTypes.ENUM('low', 'medium', 'high'),
        defaultValue: 'medium'
    }
}, {
    tableName: 'wishlists',
    indexes: [
        { fields: ['userId'] },
        { fields: ['productId'] },
        { unique: true, fields: ['userId', 'productId'] }
    ],
    timestamps: true
});

module.exports = Wishlist;
