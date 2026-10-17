import { sequelize } from '../config/database';
import { logger } from '../utils/logger';
import { seedAll } from './seeders';
import { umzug } from './umzug';
import { sharding } from '../services/sharding/databaseShardingService';
import { connectionPool } from '../services/connectionPool/connectionPoolService';

/** `npm run migrate` / `migrate:down` / `migrate:status` / `seed` */
async function main(): Promise<void> {
  const command = process.argv[2] ?? 'up';
  await sequelize.authenticate();

  switch (command) {
    case 'up': {
      const applied = await umzug.up();
      logger.info(applied.length ? `Applied: ${applied.map((m) => m.name).join(', ')}` : 'Database is up to date');
      break;
    }
    case 'down': {
      const reverted = await umzug.down();
      logger.info(reverted.length ? `Reverted: ${reverted.map((m) => m.name).join(', ')}` : 'Nothing to revert');
      break;
    }
    case 'status': {
      const [executed, pending] = await Promise.all([umzug.executed(), umzug.pending()]);
      console.log(JSON.stringify({ executed: executed.map((m) => m.name), pending: pending.map((m) => m.name) }, null, 2));
      break;
    }
    case 'seed':
      await seedAll();
      break;
    case 'shards': {
      if (!sharding.enabled) throw new Error('DB_SHARDS is not configured');
      logger.info(`Shards migrated: ${(await sharding.migrateShards()).join(', ')}`);
      break;
    }
    default:
      throw new Error(`Unknown command "${command}" (use up | down | status | seed | shards)`);
  }
}

main()
  .then(() => Promise.all([sequelize.close(), connectionPool.clearAllConnections()]))
  .catch(async (error) => {
    logger.error('Database command failed', { message: error instanceof Error ? error.message : String(error) });
    await sequelize.close().catch(() => undefined);
    process.exit(1);
  });
