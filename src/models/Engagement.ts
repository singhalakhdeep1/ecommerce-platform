import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { money, uuidPk } from './fields';

/* ---------- Review ---------- */

export class Review extends Model<InferAttributes<Review>, InferCreationAttributes<Review>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare productId: string;
  declare rating: number;
  declare title: string;
  declare comment: string;
  /** True when the reviewer has a paid, non-cancelled order containing the product. */
  declare verified: CreationOptional<boolean>;
  declare helpful: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Review.init(
  {
    id: uuidPk,
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    productId: { type: DataTypes.UUID, allowNull: false, references: { model: 'products', key: 'id' }, onDelete: 'CASCADE' },
    rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
    title: { type: DataTypes.STRING(150), allowNull: false },
    comment: { type: DataTypes.TEXT, allowNull: false },
    verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    helpful: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'reviews' },
);

/* ---------- Wishlist ---------- */

export class Wishlist extends Model<InferAttributes<Wishlist>, InferCreationAttributes<Wishlist>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare productId: string;
  declare notes: CreationOptional<string | null>;
  declare priority: CreationOptional<'low' | 'medium' | 'high'>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Wishlist.init(
  {
    id: uuidPk,
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    productId: { type: DataTypes.UUID, allowNull: false, references: { model: 'products', key: 'id' }, onDelete: 'CASCADE' },
    notes: { type: DataTypes.TEXT },
    priority: { type: DataTypes.ENUM('low', 'medium', 'high'), allowNull: false, defaultValue: 'medium' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'wishlists' },
);

/* ---------- Discounts ---------- */

export type DiscountType = 'percentage' | 'fixed' | 'free_shipping';

export class Discount extends Model<InferAttributes<Discount>, InferCreationAttributes<Discount>> {
  declare id: CreationOptional<string>;
  declare code: string;
  declare type: DiscountType;
  declare value: number;
  declare description: CreationOptional<string | null>;
  declare minimumPurchase: CreationOptional<number>;
  declare maxDiscount: CreationOptional<number | null>;
  declare usageLimit: CreationOptional<number | null>;
  declare usageCount: CreationOptional<number>;
  declare userLimit: CreationOptional<number>;
  declare applicableProducts: CreationOptional<string[]>;
  declare applicableCategories: CreationOptional<string[]>;
  declare startDate: Date;
  declare endDate: Date;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Discount.init(
  {
    id: uuidPk,
    code: { type: DataTypes.STRING(50), allowNull: false, unique: true, validate: { len: [3, 50] } },
    type: { type: DataTypes.ENUM('percentage', 'fixed', 'free_shipping'), allowNull: false },
    value: money('value', { min: 0 }),
    description: { type: DataTypes.TEXT },
    minimumPurchase: money('minimumPurchase', { defaultValue: 0, min: 0 }),
    maxDiscount: money('maxDiscount', { allowNull: true, min: 0 }),
    usageLimit: { type: DataTypes.INTEGER, validate: { min: 1 } },
    usageCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    userLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1 } },
    applicableProducts: { type: DataTypes.ARRAY(DataTypes.UUID), allowNull: false, defaultValue: [] },
    applicableCategories: { type: DataTypes.ARRAY(DataTypes.UUID), allowNull: false, defaultValue: [] },
    startDate: { type: DataTypes.DATE, allowNull: false },
    endDate: { type: DataTypes.DATE, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'discounts',
    hooks: {
      beforeValidate: (discount) => {
        if (discount.code) discount.code = discount.code.trim().toUpperCase();
      },
    },
  },
);

/** One row per order that used a code; powers the per-user limit and is rolled back if the order is cancelled. */
export class DiscountRedemption extends Model<InferAttributes<DiscountRedemption>, InferCreationAttributes<DiscountRedemption>> {
  declare id: CreationOptional<string>;
  declare discountId: string;
  declare userId: string;
  declare orderId: string;
  declare amount: number;
  declare createdAt: CreationOptional<Date>;
}

DiscountRedemption.init(
  {
    id: uuidPk,
    discountId: { type: DataTypes.UUID, allowNull: false, references: { model: 'discounts', key: 'id' }, onDelete: 'CASCADE' },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    orderId: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'CASCADE' },
    amount: money('amount', { defaultValue: 0 }),
    createdAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'discount_redemptions', updatedAt: false },
);

/* ---------- Subscriptions (Stripe billing) ---------- */

export class Subscription extends Model<InferAttributes<Subscription>, InferCreationAttributes<Subscription>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare stripeSubscriptionId: CreationOptional<string | null>;
  declare planId: string;
  declare status: CreationOptional<string>;
  declare cancelAtPeriodEnd: CreationOptional<boolean>;
  declare currentPeriodStart: Date;
  declare currentPeriodEnd: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Subscription.init(
  {
    id: uuidPk,
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    stripeSubscriptionId: { type: DataTypes.STRING, unique: true },
    planId: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'pending' },
    cancelAtPeriodEnd: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    currentPeriodStart: { type: DataTypes.DATE, allowNull: false },
    currentPeriodEnd: { type: DataTypes.DATE, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'subscriptions' },
);
