const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * CURRICULUM COVERAGE:
 * #801-825: Sequelize Models - Schema definition, data types
 * #826-850: Model associations, hooks, validations
 * #640-675: Database design - relationships, indexing
 */

const Product = sequelize.define('Product', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            notEmpty: true,
            len: [3, 100]
        }
    },
    slug: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
            min: 0
        }
    },
    comparePrice: {
        type: DataTypes.DECIMAL(10, 2),
        validate: {
            min: 0
        }
    },
    stock: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    sku: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    images: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: []
    },
    featured: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    published: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    rating: {
        type: DataTypes.DECIMAL(2, 1),
        defaultValue: 0
    },
    numReviews: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    specifications: {
        type: DataTypes.JSONB,
        defaultValue: {}
    }
}, {
    tableName: 'products',
    indexes: [
        { fields: ['name'] },
        { fields: ['slug'] },
        { fields: ['price'] },
        { fields: ['published'] }
    ]
});

// Hooks - #826-850: Model hooks
Product.beforeValidate((product) => {
    if (product.name && !product.slug) {
        product.slug = product.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }
});

module.exports = Product;
