import path from 'path';
import { QueryInterface } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { sequelize } from '../config/database';
import { logger } from '../utils/logger';

type MigrationModule = {
  up(queryInterface: QueryInterface): Promise<void>;
  down(queryInterface: QueryInterface): Promise<void>;
};

/**
 * Migration runner (umzug). Works from TypeScript sources (`tsx`) and from the compiled output:
 * the glob picks up `.ts` in src/ and `.js` in dist/ because only one of the two exists in each tree.
 */
export const umzug = new Umzug<QueryInterface>({
  migrations: {
    glob: ['migrations/*.{ts,js}', { cwd: __dirname }],
    resolve: ({ name, path: filepath, context }) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const migration = require(filepath as string) as MigrationModule;
      return {
        name: path.basename(name, path.extname(name)),
        up: async () => migration.up(context),
        down: async () => migration.down(context),
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: 'schema_migrations' }),
  logger: {
    info: (event) => logger.info('migration', event as Record<string, unknown>),
    warn: (event) => logger.warn('migration', event as Record<string, unknown>),
    error: (event) => logger.error('migration', event as Record<string, unknown>),
    debug: () => undefined,
  },
});

export async function migrateUp(): Promise<string[]> {
  const applied = await umzug.up();
  return applied.map((m) => m.name);
}

export async function migrateDown(): Promise<string[]> {
  const reverted = await umzug.down();
  return reverted.map((m) => m.name);
}
