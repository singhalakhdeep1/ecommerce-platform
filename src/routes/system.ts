import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import { SagaExecution } from '../models';
import { adminOnly } from '../middleware/auth';
import { liveStats } from '../middleware/requestContext';
import { s, validate } from '../middleware/validate';
import { liveVolume } from '../services/analytics/analyticsService';
import { cache } from '../services/caching/distributedCacheService';
import { CapacityEstimationService } from '../services/capacityEstimation/capacityEstimationService';
import { connectionPool } from '../services/connectionPool/connectionPoolService';
import { allCircuitStates, resilience } from '../services/errorHandling/errorHandlingService';
import { getFraudReport } from '../services/fraud/fraudDetection';
import { indexing } from '../services/indexing/databaseIndexingService';
import { getKvStore } from '../services/infra/kvStore';
import { jobNames, runJobNow } from '../services/jobs';
import { recentEmails } from '../services/notifications/email';
import { readReplicas } from '../services/readReplica/readReplicaService';
import { engineStatus } from '../services/search/searchService';
import { sharding } from '../services/sharding/databaseShardingService';
import { SystemConstraintsAnalysisService } from '../services/systemConstraints/systemConstraintsAnalysisService';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(...adminOnly);

/** Detailed health: database, shared store, replicas, shards, pools, breakers, search engines. */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const started = Date.now();
    const dbOk = await sequelize.authenticate().then(() => true, () => false);
    const dbLatencyMs = Date.now() - started;
    const kv = getKvStore();
    res.json({
      success: true,
      data: {
        status: dbOk ? 'ok' : 'degraded',
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1_048_576),
        database: { ok: dbOk, latencyMs: dbLatencyMs },
        kvStore: { backend: kv.backend, ok: await kv.ping() },
        readReplicas: readReplicas.status(),
        shards: sharding.enabled ? await sharding.getShardHealth() : [],
        connectionPools: connectionPool.getStatistics(),
        circuitBreakers: allCircuitStates(),
        searchEngines: await engineStatus(),
        jobs: process.env.JOBS_ENABLED === 'false' ? [] : jobNames,
        traffic: liveStats(),
      },
    });
  }),
);

router.get(
  '/capacity',
  validate(z.object({ dailyTransactions: z.coerce.number().int().min(0).optional(), productCount: z.coerce.number().int().min(0).optional(), customerCount: z.coerce.number().int().min(0).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const live = await liveVolume();
    const q = req.query as Partial<typeof live>;
    const volume = { dailyTransactions: q.dailyTransactions ?? live.dailyTransactions, productCount: q.productCount ?? live.productCount, customerCount: q.customerCount ?? live.customerCount };
    res.json({ success: true, data: { liveVolume: live, ...new CapacityEstimationService().generateCapacityReport(volume) } });
  }),
);

router.get(
  '/constraints',
  validate(z.object({ targetLatencyMs: z.coerce.number().min(1).default(200), targetTPS: z.coerce.number().min(0).default(50), targetUptime: z.coerce.number().min(90).max(100).default(99.9) }), 'query'),
  (req, res) => {
    const q = req.query as unknown as { targetLatencyMs: number; targetTPS: number; targetUptime: number };
    const stats = liveStats();
    const report = new SystemConstraintsAnalysisService().generateComplianceReport({
      targetLatencyMs: q.targetLatencyMs,
      currentLatencyMs: Math.round(stats.avgLatencyMs * 10) / 10,
      currentP95LatencyMs: stats.p95LatencyMs,
      targetTPS: q.targetTPS,
      currentTPS: Math.round(stats.requestsPerSecond * 100) / 100,
      targetUptime: q.targetUptime,
      currentUptime: Math.round(stats.availabilityPercent * 1000) / 1000,
    });
    res.json({ success: true, data: { measured: stats, ...report } });
  },
);

router.get('/indexes', asyncHandler(async (req, res) => void res.json({ success: true, data: await indexing.listIndexes(typeof req.query.table === 'string' ? req.query.table : undefined) })));
router.get('/indexes/unused', asyncHandler(async (_req, res) => void res.json({ success: true, data: await indexing.unusedIndexes() })));
router.post(
  '/indexes',
  validate(z.object({ tableName: z.string(), indexName: z.string(), columns: z.array(z.string()).min(1).max(8), isUnique: z.boolean().optional(), where: z.string().max(200).optional() })),
  asyncHandler(async (req, res) => {
    await indexing.createIndex(req.body);
    res.status(201).json({ success: true, data: await indexing.listIndexes(req.body.tableName) });
  }),
);
router.delete('/indexes/:name', asyncHandler(async (req, res) => {
  await indexing.dropIndex(req.params.name);
  res.json({ success: true, message: `Index ${req.params.name} dropped` });
}));
router.post('/indexes/rebuild', validate(z.object({ tableName: z.string() })), asyncHandler(async (req, res) => {
  await indexing.rebuildIndexes(req.body.tableName);
  res.json({ success: true, message: `Indexes on ${req.body.tableName} rebuilt` });
}));

router.get(
  '/shards',
  validate(z.object({ sample: z.coerce.number().int().min(0).max(100_000).default(0) }), 'query'),
  asyncHandler(async (req, res) => {
    if (!sharding.enabled) return void res.json({ success: true, data: { enabled: false, shards: [] } });
    const sample = (req.query as unknown as { sample: number }).sample;
    res.json({
      success: true,
      data: {
        enabled: true,
        shards: await sharding.getShardHealth(),
        ...(sample ? { distributionOfRandomKeys: sharding.distribution(Array.from({ length: sample }, () => randomUUID())) } : {}),
      },
    });
  }),
);
router.post('/shards/migrate', asyncHandler(async (_req, res) => {
  if (!sharding.enabled) throw AppError.badRequest('DB_SHARDS is not configured');
  res.json({ success: true, data: { migrated: await sharding.migrateShards() } });
}));

router.get('/replicas', asyncHandler(async (_req, res) => void res.json({ success: true, data: { count: readReplicas.count, replicas: await readReplicas.getReplicaLag() } })));

router.get(
  '/sagas',
  validate(z.object({ status: z.enum(['running', 'completed', 'compensated', 'failed']).optional(), limit: s.limit(200, 50) }), 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { status?: string; limit: number };
    res.json({ success: true, data: await SagaExecution.findAll({ where: q.status ? { status: q.status } : {}, order: [['startedAt', 'DESC']], limit: q.limit }) });
  }),
);

router.get('/circuits', (_req, res) => void res.json({ success: true, data: allCircuitStates() }));
router.post('/circuits/:name/reset', (req, res) => {
  const breaker = resilience(req.params.name);
  breaker.resetCircuitBreaker();
  res.json({ success: true, data: breaker.getCircuitState() });
});

router.post('/cache/flush', asyncHandler(async (req, res) => {
  const pattern = typeof req.body?.pattern === 'string' ? req.body.pattern : '*';
  res.json({ success: true, data: { removed: await cache.invalidatePattern(pattern) } });
}));

router.get('/outbox', (_req, res) => void res.json({ success: true, data: recentEmails() }));

router.post('/jobs/:name/run', asyncHandler(async (req, res) => {
  if (!jobNames.includes(req.params.name)) throw AppError.notFound(`Unknown job; available: ${jobNames.join(', ')}`);
  res.json({ success: true, data: { job: req.params.name, result: await runJobNow(req.params.name) } });
}));

router.get('/fraud/:userId', validate(z.object({ userId: s.uuid }), 'params'), asyncHandler(async (req, res) => void res.json({ success: true, data: await getFraudReport(req.params.userId) })));

export default router;
