const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const logger = require('../utils/logger');
const sendEmail = require('../utils/sendEmail');

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
    },
    variants: {
        type: DataTypes.JSONB,
        defaultValue: []
    },
    lowStockThreshold: {
        type: DataTypes.INTEGER,
        defaultValue: 10
    },
    barcode: {
        type: DataTypes.STRING
    },
    weight: {
        type: DataTypes.DECIMAL(10, 2),
        validate: {
            min: 0
        }
    },
    dimensions: {
        type: DataTypes.JSONB,
        defaultValue: {
            length: null,
            width: null,
            height: null
        }
    },
    tags: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: []
    },
    seoTitle: {
        type: DataTypes.STRING
    },
    seoDescription: {
        type: DataTypes.TEXT
    }
}, {
    tableName: 'products',
    indexes: [
        { fields: ['name'] },
        { fields: ['slug'] },
        { fields: ['price'] },
        { fields: ['published'] },
        { fields: ['featured'] },
        { fields: ['stock'] }
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

// Low stock alert hook
Product.afterUpdate(async (product) => {
    if (product.changed('stock') && product.stock <= product.lowStockThreshold) {
        logger.warn(`Low stock alert for product: ${product.name}`, {
            productId: product.id,
            currentStock: product.stock,
            threshold: product.lowStockThreshold
        });

        // Send email alert to admin
        try {
            await sendEmail({
                email: process.env.ADMIN_EMAIL || 'admin@ecommerce.com',
                subject: `⚠️ Low Stock Alert: ${product.name}`,
                message: `
                    Product ${product.name} is running low on stock.
                    
                    Current Stock: ${product.stock}
                    Threshold: ${product.lowStockThreshold}
                    SKU: ${product.sku}
                    
                    Please restock soon.
                `
            });
        } catch (error) {
            logger.error('Failed to send low stock alert email', { error: error.message });
        }
    }
});

module.exports = Product;
