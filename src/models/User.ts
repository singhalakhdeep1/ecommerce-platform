import bcrypt from 'bcryptjs';
import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { env } from '../config/env';
import { sequelize } from '../config/database';
import { uuidPk } from './fields';

export type UserRole = 'customer' | 'admin' | 'seller';

export interface Address {
  name?: string;
  street?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare email: string;
  declare password: string;
  declare role: CreationOptional<UserRole>;
  declare phone: CreationOptional<string | null>;
  declare avatar: CreationOptional<string | null>;
  declare address: CreationOptional<Address | null>;
  declare emailVerified: CreationOptional<boolean>;
  declare isActive: CreationOptional<boolean>;
  declare stripeCustomerId: CreationOptional<string | null>;
  declare tokenVersion: CreationOptional<number>;
  declare lastLoginAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  comparePassword(candidate: string): Promise<boolean> {
    return bcrypt.compare(candidate, this.password);
  }

  /** Public representation: never includes the password hash. */
  toPublic() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      role: this.role,
      phone: this.phone,
      avatar: this.avatar,
      address: this.address,
      emailVerified: this.emailVerified,
      createdAt: this.createdAt,
    };
  }
}

User.init(
  {
    id: uuidPk,
    name: { type: DataTypes.STRING(100), allowNull: false, validate: { len: [2, 100] } },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true, validate: { isEmail: true } },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM('customer', 'admin', 'seller'), allowNull: false, defaultValue: 'customer' },
    phone: { type: DataTypes.STRING(32) },
    avatar: { type: DataTypes.STRING },
    address: { type: DataTypes.JSONB },
    emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    stripeCustomerId: { type: DataTypes.STRING },
    /** Bumped on logout / password change; JWTs carrying an older version are rejected. */
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastLoginAt: { type: DataTypes.DATE },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: 'users',
    hooks: {
      beforeValidate: (user) => {
        if (user.email) user.email = user.email.trim().toLowerCase();
      },
      beforeCreate: async (user) => {
        user.password = await bcrypt.hash(user.password, env.auth.bcryptRounds);
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, env.auth.bcryptRounds);
        }
      },
    },
  },
);
