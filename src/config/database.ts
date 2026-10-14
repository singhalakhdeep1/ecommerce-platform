import { Options, Sequelize } from 'sequelize';
import { env } from './env';
import { logger } from '../utils/logger';

export function buildOptions(overrides: Partial<Options> = {}): Options {
  return {
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? (sql) => logger.debug(sql) : false,
    pool: { max: env.db.poolMax, min: 0, acquire: 30_000, idle: 10_000 },
    define: { timestamps: true, underscored: true },
    ...overrides,
  };
}

/** Creates a Sequelize connection from a connection string (used for the primary, replicas and shards). */
export function createSequelize(connectionString: string, overrides: Partial<Options> = {}): Sequelize {
  return new Sequelize(connectionString, buildOptions(overrides));
}

function createPrimary(): Sequelize {
  if (env.db.url) return createSequelize(env.db.url);
  return new Sequelize(
    env.db.name,
    env.db.user,
    env.db.password,
    buildOptions({ host: env.db.host, port: env.db.port }),
  );
}

/** The primary (read/write) connection every model is bound to. */
export const sequelize = createPrimary();
