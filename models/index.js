const sequelize = require('../config/database');
const User = require('./User');
const Product = require('./Product');
const Category = require('./Category');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const Cart = require('./Cart');
const CartItem = require('./CartItem');
const Review = require('./Review');
const AnalyticsEvent = require('./AnalyticsEvent');
const WebhookSubscription = require('./WebhookSubscription');
const Subscription = require('./Subscription');
const Campaign = require('./Campaign');
const CustomerSegment = require('./CustomerSegment');
const Wishlist = require('./Wishlist');
const Discount = require('./Discount');

/**
 * CURRICULUM COVERAGE:
 * #826-850: Sequelize Associations - hasMany, belongsTo, belongsToMany
 * #640-660: Database relationships design
 */

// User - Order (One-to-Many)
User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Order - OrderItem (One-to-Many)
Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId' });

// Product - OrderItem (One-to-Many)
Product.hasMany(OrderItem, { foreignKey: 'productId' });
OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// Category - Product (One-to-Many)
Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

// User - Cart (One-to-One)
User.hasOne(Cart, { foreignKey: 'userId', as: 'cart' });
Cart.belongsTo(User, { foreignKey: 'userId' });

// Cart - CartItem (One-to-Many)
Cart.hasMany(CartItem, { foreignKey: 'cartId', as: 'items' });
CartItem.belongsTo(Cart, { foreignKey: 'cartId' });

// Product - CartItem (One-to-Many)
Product.hasMany(CartItem, { foreignKey: 'productId' });
CartItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

// User - Review (One-to-Many)
User.hasMany(Review, { foreignKey: 'userId', as: 'reviews' });
Review.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Product - Review (One-to-Many)
Product.hasMany(Review, { foreignKey: 'productId', as: 'reviews' });
Review.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
// User - AnalyticsEvent (One-to-Many)
User.hasMany(AnalyticsEvent, { foreignKey: 'userId', as: 'analyticsEvents' });
AnalyticsEvent.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User - WebhookSubscription (One-to-Many)
User.hasMany(WebhookSubscription, { foreignKey: 'userId', as: 'webhooks' });
WebhookSubscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User - Subscription (One-to-Many)
User.hasMany(Subscription, { foreignKey: 'userId', as: 'subscriptions' });
Subscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// CustomerSegment - Campaign (One-to-Many)
CustomerSegment.hasMany(Campaign, { foreignKey: 'segmentId', as: 'campaigns' });
Campaign.belongsTo(CustomerSegment, { foreignKey: 'segmentId', as: 'segment' });

// User - Wishlist (One-to-Many)
User.hasMany(Wishlist, { foreignKey: 'userId', as: 'wishlistItems' });
Wishlist.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Product - Wishlist (One-to-Many)
Product.hasMany(Wishlist, { foreignKey: 'productId', as: 'wishlistEntries' });
Wishlist.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

module.exports = {
    sequelize,
    User,
    Product,
    Category,
    Order,
    OrderItem,
    Cart,
    CartItem,
    Review,
    AnalyticsEvent,
    WebhookSubscription,
    Subscription,
    Campaign,
    CustomerSegment,
    Wishlist,
    Discount
};
