import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { money, uuidPk } from './fields';

/** A cart belongs to a user, or to an anonymous visitor identified by `sessionToken` (guest cart). */
export class Cart extends Model<InferAttributes<Cart>, InferCreationAttributes<Cart>> {
  declare id: CreationOptional<string>;
  declare userId: CreationOptional<string | null>;
  declare sessionToken: CreationOptional<string | null>;
  declare totalAmount: CreationOptional<number>;
  declare lastActivityAt: CreationOptional<Date>;
  declare reminderSentAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Cart.init(
  {
    id: uuidPk,
    userId: { type: DataTypes.UUID, unique: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    sessionToken: { type: DataTypes.STRING(64), unique: true },
    totalAmount: money('totalAmount', { defaultValue: 0 }),
    lastActivityAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    reminderSentAt: { type: DataTypes.DATE },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'carts' },
);

export class CartItem extends Model<InferAttributes<CartItem>, InferCreationAttributes<CartItem>> {
  declare id: CreationOptional<string>;
  declare cartId: string;
  declare productId: string;
  /** '' when the product has no variants (kept non-null so the unique index also covers plain products). */
  declare variantName: CreationOptional<string>;
  declare quantity: number;
  declare price: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CartItem.init(
  {
    id: uuidPk,
    cartId: { type: DataTypes.UUID, allowNull: false, references: { model: 'carts', key: 'id' }, onDelete: 'CASCADE' },
    productId: { type: DataTypes.UUID, allowNull: false, references: { model: 'products', key: 'id' }, onDelete: 'CASCADE' },
    variantName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1 } },
    price: money('price', { min: 0 }),
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'cart_items' },
);
