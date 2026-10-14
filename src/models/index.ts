import { sequelize } from '../config/database';
import { Cart, CartItem } from './Cart';
import { Category } from './Category';
import { Discount, DiscountRedemption, Review, Subscription, Wishlist } from './Engagement';
import { Order, OrderEvent, OrderItem, PaymentTransaction } from './Order';
import {
  AbAssignment,
  AbExperiment,
  AnalyticsEvent,
  Campaign,
  CustomerSegment,
  ProcessedWebhookEvent,
  SagaExecution,
  WebhookDelivery,
  WebhookSubscription,
} from './Platform';
import { Product } from './Product';
import { User } from './User';

/* Catalog */
Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
Category.hasMany(Category, { foreignKey: 'parentId', as: 'children' });
Category.belongsTo(Category, { foreignKey: 'parentId', as: 'parent' });
Product.belongsTo(User, { foreignKey: 'sellerId', as: 'seller' });

/* Cart */
User.hasOne(Cart, { foreignKey: 'userId', as: 'cart' });
Cart.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Cart.hasMany(CartItem, { foreignKey: 'cartId', as: 'items' });
CartItem.belongsTo(Cart, { foreignKey: 'cartId', as: 'cart' });
Product.hasMany(CartItem, { foreignKey: 'productId', as: 'cartItems' });
CartItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

/* Orders */
User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
Product.hasMany(OrderItem, { foreignKey: 'productId', as: 'orderItems' });
OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Order.hasMany(OrderEvent, { foreignKey: 'orderId', as: 'events' });
OrderEvent.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
Order.hasMany(PaymentTransaction, { foreignKey: 'orderId', as: 'transactions' });
PaymentTransaction.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

/* Engagement */
User.hasMany(Review, { foreignKey: 'userId', as: 'reviews' });
Review.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Product.hasMany(Review, { foreignKey: 'productId', as: 'reviews' });
Review.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
User.hasMany(Wishlist, { foreignKey: 'userId', as: 'wishlistItems' });
Wishlist.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Product.hasMany(Wishlist, { foreignKey: 'productId', as: 'wishlistEntries' });
Wishlist.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Discount.hasMany(DiscountRedemption, { foreignKey: 'discountId', as: 'redemptions' });
DiscountRedemption.belongsTo(Discount, { foreignKey: 'discountId', as: 'discount' });
User.hasMany(Subscription, { foreignKey: 'userId', as: 'subscriptions' });
Subscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });

/* Platform */
User.hasMany(AnalyticsEvent, { foreignKey: 'userId', as: 'analyticsEvents' });
AnalyticsEvent.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(WebhookSubscription, { foreignKey: 'userId', as: 'webhooks' });
WebhookSubscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });
WebhookSubscription.hasMany(WebhookDelivery, { foreignKey: 'subscriptionId', as: 'deliveries' });
WebhookDelivery.belongsTo(WebhookSubscription, { foreignKey: 'subscriptionId', as: 'subscription' });
CustomerSegment.hasMany(Campaign, { foreignKey: 'segmentId', as: 'campaigns' });
Campaign.belongsTo(CustomerSegment, { foreignKey: 'segmentId', as: 'segment' });
AbExperiment.hasMany(AbAssignment, { foreignKey: 'experimentKey', as: 'assignments' });
AbAssignment.belongsTo(AbExperiment, { foreignKey: 'experimentKey', as: 'experiment' });

export {
  sequelize,
  AbAssignment,
  AbExperiment,
  AnalyticsEvent,
  Campaign,
  Cart,
  CartItem,
  Category,
  CustomerSegment,
  Discount,
  DiscountRedemption,
  Order,
  OrderEvent,
  OrderItem,
  PaymentTransaction,
  ProcessedWebhookEvent,
  Product,
  Review,
  SagaExecution,
  Subscription,
  User,
  WebhookDelivery,
  WebhookSubscription,
  Wishlist,
};
