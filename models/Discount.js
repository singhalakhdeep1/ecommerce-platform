const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * CURRICULUM COVERAGE:
 * #801-825: Sequelize Models - Discount/Coupon model
 * #640-675: Database relationships
 */

const Discount = sequelize.define('Discount', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
            notEmpty: true,
            len: [3, 50]
        }
    },
    type: {
        type: DataTypes.ENUM('percentage', 'fixed', 'free_shipping'),
        allowNull: false
    },
    value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
            min: 0
        }
    },
    description: {
        type: DataTypes.TEXT
    },
    minimumPurchase: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    maxDiscount: {
        type: DataTypes.DECIMAL(10, 2),
        validate: {
            min: 0
        }
    },
    usageLimit: {
        type: DataTypes.INTEGER,
        defaultValue: null,
        validate: {
            min: 1
        }
    },
    usageCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    userLimit: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        validate: {
            min: 1
        }
    },
    applicableProducts: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: []
    },
    applicableCategories: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: []
    },
    startDate: {
        type: DataTypes.DATE,
        allowNull: false
    },
    endDate: {
        type: DataTypes.DATE,
        allowNull: false
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'discounts',
    indexes: [
        { fields: ['code'] },
        { fields: ['isActive'] },
        { fields: ['startDate', 'endDate'] }
    ],
    timestamps: true
});

module.exports = Discount;
