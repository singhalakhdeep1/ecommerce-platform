import { Server } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { sequelize } from './config/database';
import { umzug } from './db/umzug';
import { closeKvStore, getKvStore } from './services/infra/kvStore';
import { connectionPool } from './services/connectionPool/connectionPoolService';
import { readReplicas } from './services/readReplica/readReplicaService';
import { startJobs, stopJobs } from './services/jobs';
import { logger } from './utils/logger';

async function start(): Promise<Server> {
  await sequelize.authenticate();
  logger.info('PostgreSQL connected');

  // Schema changes are applied by `npm run migrate` (or here when DB_AUTO_MIGRATE=true, e.g. in compose).
  if (process.env.DB_AUTO_MIGRATE === 'true') {
    const applied = await umzug.up();
    if (applied.length) logger.info(`Migrations applied: ${applied.map((m) => m.name).join(', ')}`);
  } else {
    const pending = await umzug.pending();
    if (pending.length) logger.warn(`Pending migrations: ${pending.map((m) => m.name).join(', ')}. Run "npm run migrate".`);
  }

  const kv = getKvStore();
  logger.info(`Shared store: ${kv.backend}${kv.backend === 'memory' ? ' (single instance only; set REDIS_URL to scale out)' : ''}`);
  readReplicas.startHealthChecks();
  startJobs();

  const server = createApp().listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port} (docs: /api-docs, GraphQL: /graphql, tRPC: /trpc)`);
  });
  server.keepAliveTimeout = 65_000;
  return server;
}

let shuttingDown = false;
async function shutdown(server: Server | null, signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  stopJobs();
  readReplicas.stopHealthChecks();
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await Promise.allSettled([sequelize.close(), connectionPool.clearAllConnections(), closeKvStore()]);
  process.exit(0);
}

start()
  .then((server) => {
    process.on('SIGTERM', () => void shutdown(server, 'SIGTERM'));
    process.on('SIGINT', () => void shutdown(server, 'SIGINT'));
  })
  .catch((error) => {
    logger.error('Failed to start', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });

process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', { reason: reason instanceof Error ? reason.stack : String(reason) }));
