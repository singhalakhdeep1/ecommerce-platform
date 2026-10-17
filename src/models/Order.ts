import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { money, uuidPk } from './fields';
import type { Address } from './User';

export const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Allowed order lifecycle transitions: pending -> processing -> shipped -> delivered, cancel until shipped. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export class Order extends Model<InferAttributes<Order>, InferCreationAttributes<Order>> {
  declare id: CreationOptional<string>;
  declare orderNumber: CreationOptional<string>;
  declare userId: string;
  declare orderType: CreationOptional<'standard' | 'express' | 'preorder'>;
  declare status: CreationOptional<OrderStatus>;
  declare subtotal: number;
  declare tax: CreationOptional<number>;
  declare shippingCost: CreationOptional<number>;
  declare discount: CreationOptional<number>;
  declare discountCode: CreationOptional<string | null>;
  declare totalAmount: number;
  declare currency: CreationOptional<string>;
  declare paymentMethod: string;
  declare paymentStatus: CreationOptional<PaymentStatus>;
  declare paymentProvider: CreationOptional<string | null>;
  declare stripePaymentIntentId: CreationOptional<string | null>;
  declare paypalOrderId: CreationOptional<string | null>;
  declare shippingAddress: Address;
  declare billingAddress: CreationOptional<Address | null>;
  declare shippingProvider: CreationOptional<string | null>;
  declare shippingService: CreationOptional<string | null>;
  declare notes: CreationOptional<string | null>;
  declare trackingNumber: CreationOptional<string | null>;
  declare labelUrl: CreationOptional<string | null>;
  declare refundedAmount: CreationOptional<number>;
  declare idempotencyKey: CreationOptional<string | null>;
  declare fraudFlag: CreationOptional<boolean>;
  declare fraudScore: CreationOptional<number>;
  declare paidAt: CreationOptional<Date | null>;
  declare shippedAt: CreationOptional<Date | null>;
  declare deliveredAt: CreationOptional<Date | null>;
  declare cancelledAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare items?: OrderItem[];
  declare events?: OrderEvent[];
  declare transactions?: PaymentTransaction[];
}

Order.init(
  {
    id: uuidPk,
    orderNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
    orderType: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'standard' },
    status: { type: DataTypes.ENUM(...ORDER_STATUSES), allowNull: false, defaultValue: 'pending' },
    subtotal: money('subtotal', { min: 0 }),
    tax: money('tax', { defaultValue: 0 }),
    shippingCost: money('shippingCost', { defaultValue: 0 }),
    discount: money('discount', { defaultValue: 0 }),
    discountCode: { type: DataTypes.STRING(50) },
    totalAmount: money('totalAmount', { min: 0 }),
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD' },
    paymentMethod: { type: DataTypes.STRING(32), allowNull: false },
    paymentStatus: { type: DataTypes.ENUM(...PAYMENT_STATUSES), allowNull: false, defaultValue: 'pending' },
    paymentProvider: { type: DataTypes.STRING(32) },
    stripePaymentIntentId: { type: DataTypes.STRING },
    paypalOrderId: { type: DataTypes.STRING },
    shippingAddress: { type: DataTypes.JSONB, allowNull: false },
    billingAddress: { type: DataTypes.JSONB },
    shippingProvider: { type: DataTypes.STRING(32) },
    shippingService: { type: DataTypes.STRING(32) },
    notes: { type: DataTypes.TEXT },
    trackingNumber: { type: DataTypes.STRING(64) },
    labelUrl: { type: DataTypes.STRING(2048) },
    refundedAmount: money('refundedAmount', { defaultValue: 0 }),
    idempotencyKey: { type: DataTypes.STRING(64), unique: true },
    fraudFlag: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fraudScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    paidAt: { type: DataTypes.DATE },
    shippedAt: { type: DataTypes.DATE },
    deliveredAt: { type: DataTypes.DATE },
    cancelledAt: { type: DataTypes.DATE },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'orders' },
);

export class OrderItem extends Model<InferAttributes<OrderItem>, InferCreationAttributes<OrderItem>> {
  declare id: CreationOptional<string>;
  declare orderId: string;
  declare productId: string | null;
  declare variantName: CreationOptional<string>;
  declare quantity: number;
  declare price: number;
  declare total: number;
  /** Name/SKU/image at purchase time, so order history survives later product edits or deletion. */
  declare productSnapshot: { name: string; sku: string; image?: string | null };
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

OrderItem.init(
  {
    id: uuidPk,
    orderId: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'CASCADE' },
    productId: { type: DataTypes.UUID, references: { model: 'products', key: 'id' }, onDelete: 'SET NULL' },
    variantName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
    quantity: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    price: money('price', { min: 0 }),
    total: money('total', { min: 0 }),
    productSnapshot: { type: DataTypes.JSONB, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'order_items' },
);

/** Append-only audit trail of order status changes. */
export class OrderEvent extends Model<InferAttributes<OrderEvent>, InferCreationAttributes<OrderEvent>> {
  declare id: CreationOptional<string>;
  declare orderId: string;
  declare fromStatus: string | null;
  declare toStatus: string;
  declare actorId: CreationOptional<string | null>;
  declare note: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

OrderEvent.init(
  {
    id: uuidPk,
    orderId: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'CASCADE' },
    fromStatus: { type: DataTypes.STRING(32) },
    toStatus: { type: DataTypes.STRING(32), allowNull: false },
    actorId: { type: DataTypes.UUID },
    note: { type: DataTypes.TEXT },
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'order_events', updatedAt: false },
);

/** Money movements per order: charges and refunds, with the platform fee / seller payout split. */
export class PaymentTransaction extends Model<InferAttributes<PaymentTransaction>, InferCreationAttributes<PaymentTransaction>> {
  declare id: CreationOptional<string>;
  declare orderId: string;
  declare provider: string;
  declare providerRef: CreationOptional<string | null>;
  declare type: 'charge' | 'refund';
  declare status: 'succeeded' | 'failed';
  declare amount: number;
  declare platformFee: CreationOptional<number>;
  declare sellerPayout: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
}

PaymentTransaction.init(
  {
    id: uuidPk,
    orderId: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'CASCADE' },
    provider: { type: DataTypes.STRING(32), allowNull: false },
    providerRef: { type: DataTypes.STRING },
    type: { type: DataTypes.ENUM('charge', 'refund'), allowNull: false },
    status: { type: DataTypes.ENUM('succeeded', 'failed'), allowNull: false },
    amount: money('amount'),
    platformFee: money('platformFee', { defaultValue: 0 }),
    sellerPayout: money('sellerPayout', { defaultValue: 0 }),
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'payment_transactions', updatedAt: false },
);
