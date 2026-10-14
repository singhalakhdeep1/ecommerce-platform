import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { money, uuidPk } from './fields';
import { slugify } from './Category';

export interface ProductVariant {
  name: string;
  price?: number;
  quantity?: number;
  sku?: string;
}

export class Product extends Model<InferAttributes<Product>, InferCreationAttributes<Product>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare slug: CreationOptional<string>;
  declare description: string;
  declare price: number;
  declare comparePrice: CreationOptional<number | null>;
  declare stock: CreationOptional<number>;
  declare sku: string;
  declare barcode: CreationOptional<string | null>;
  declare images: CreationOptional<string[]>;
  declare featured: CreationOptional<boolean>;
  declare published: CreationOptional<boolean>;
  declare rating: CreationOptional<number>;
  declare numReviews: CreationOptional<number>;
  declare specifications: CreationOptional<Record<string, string | number>>;
  declare variants: CreationOptional<ProductVariant[]>;
  declare lowStockThreshold: CreationOptional<number>;
  declare weight: CreationOptional<number | null>;
  declare dimensions: CreationOptional<{ length: number | null; width: number | null; height: number | null }>;
  declare tags: CreationOptional<string[]>;
  declare seoTitle: CreationOptional<string | null>;
  declare seoDescription: CreationOptional<string | null>;
  declare categoryId: CreationOptional<string | null>;
  declare sellerId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Product.init(
  {
    id: uuidPk,
    name: { type: DataTypes.STRING(200), allowNull: false, validate: { len: [2, 200] } },
    slug: { type: DataTypes.STRING(250), allowNull: false, unique: true },
    description: { type: DataTypes.TEXT, allowNull: false },
    price: money('price', { min: 0 }),
    comparePrice: money('comparePrice', { allowNull: true, min: 0 }),
    stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    sku: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    barcode: { type: DataTypes.STRING(64) },
    images: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: false, defaultValue: [] },
    featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    rating: money('rating', { precision: 3, scale: 2, defaultValue: 0 }),
    numReviews: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    specifications: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    variants: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    lowStockThreshold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
    weight: money('weight', { allowNull: true, min: 0 }),
    dimensions: { type: DataTypes.JSONB, allowNull: false, defaultValue: { length: null, width: null, height: null } },
    tags: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: false, defaultValue: [] },
    seoTitle: { type: DataTypes.STRING },
    seoDescription: { type: DataTypes.TEXT },
    categoryId: { type: DataTypes.UUID, references: { model: 'categories', key: 'id' }, onDelete: 'SET NULL' },
    sellerId: { type: DataTypes.UUID, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'products',
    hooks: {
      beforeValidate: (product) => {
        if (product.name && !product.slug) product.slug = slugify(product.name);
      },
    },
  },
);
