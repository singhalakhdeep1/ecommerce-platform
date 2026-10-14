import { DataTypes, ModelAttributeColumnOptions } from 'sequelize';

/**
 * DECIMAL columns come back from `pg` as strings. This returns a Number from the getter so JSON
 * responses and arithmetic work, while the database keeps exact decimal storage.
 */
export function money(
  name: string,
  options: { precision?: number; scale?: number; allowNull?: boolean; defaultValue?: number; min?: number } = {},
): ModelAttributeColumnOptions {
  const { precision = 12, scale = 2, allowNull = false, defaultValue, min } = options;
  return {
    type: DataTypes.DECIMAL(precision, scale),
    allowNull,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(min !== undefined ? { validate: { min } } : {}),
    get(this: { getDataValue(key: string): unknown }) {
      const raw = this.getDataValue(name);
      return raw === null || raw === undefined ? raw : Number(raw);
    },
  } as ModelAttributeColumnOptions;
}

export const uuidPk: ModelAttributeColumnOptions = {
  type: DataTypes.UUID,
  defaultValue: DataTypes.UUIDV4,
  primaryKey: true,
};

/** Rounds to cents to avoid floating point drift when summing prices. */
export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
