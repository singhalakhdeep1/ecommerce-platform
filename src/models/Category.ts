import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { uuidPk } from './fields';

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export class Category extends Model<InferAttributes<Category>, InferCreationAttributes<Category>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare slug: CreationOptional<string>;
  declare description: CreationOptional<string | null>;
  declare image: CreationOptional<string | null>;
  /** Self reference: categories form a tree (e.g. Electronics > Phones). */
  declare parentId: CreationOptional<string | null>;
  declare sortOrder: CreationOptional<number>;
  declare published: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Category.init(
  {
    id: uuidPk,
    name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    slug: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    description: { type: DataTypes.TEXT },
    image: { type: DataTypes.STRING },
    parentId: { type: DataTypes.UUID, references: { model: 'categories', key: 'id' }, onDelete: 'SET NULL' },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'categories',
    hooks: {
      beforeValidate: (category) => {
        if (category.name && !category.slug) category.slug = slugify(category.name);
      },
    },
  },
);
