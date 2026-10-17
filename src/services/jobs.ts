import { logger } from '../utils/logger';
import { StructuredLoggingService } from './logging/structuredLoggingService';
import { getKvStore } from './infra/kvStore';
import { expireUnpaidOrders } from './commerce/orderService';
import { recoverAbandonedCarts, sendDueCampaigns } from './marketing/marketingService';
import { retryDueDeliveries } from './notifications/webhookDispatcher';
import { renewSandboxSubscriptions } from './commerce/subscriptionService';

interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

const JOBS: Job[] = [
  { name: 'webhook-retries', everyMs: 30_000, run: retryDueDeliveries },
  { name: 'expire-unpaid-orders', everyMs: 5 * 60_000, run: expireUnpaidOrders },
  { name: 'scheduled-campaigns', everyMs: 60_000, run: sendDueCampaigns },
  { name: 'abandoned-carts', everyMs: 15 * 60_000, run: recoverAbandonedCarts },
  { name: 'sandbox-subscriptions', everyMs: 60 * 60_000, run: renewSandboxSubscriptions },
];

const timers: NodeJS.Timeout[] = [];

/**
 * In-process scheduler. With several API instances each job takes a short lock in the shared store
 * (Redis), so only one instance runs a given tick. Disable with JOBS_ENABLED=false (e.g. on a
 * read-only replica deployment).
 */
export function startJobs(): void {
  if (process.env.JOBS_ENABLED === 'false') {
    logger.info('Background jobs disabled (JOBS_ENABLED=false)');
    return;
  }
  for (const job of JOBS) {
    const tick = async () => {
      const lockSeconds = Math.max(5, Math.floor(job.everyMs / 1000) - 1);
      if (!(await getKvStore().setIfAbsent(`job:${job.name}`, String(process.pid), lockSeconds))) return;
      await StructuredLoggingService.run({ correlationId: `job-${job.name}-${Date.now()}` }, async () => {
        try {
          await job.run();
        } catch (error) {
          logger.error(`Job ${job.name} failed`, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    };
    const timer = setInterval(() => void tick(), job.everyMs);
    timer.unref();
    timers.push(timer);
  }
  logger.info(`Background jobs started: ${JOBS.map((j) => j.name).join(', ')}`);
}

export function stopJobs(): void {
  while (timers.length) clearInterval(timers.pop()!);
}

export async function runJobNow(name: string): Promise<unknown> {
  const job = JOBS.find((j) => j.name === name);
  if (!job) throw new Error(`Unknown job ${name}`);
  return job.run();
}

export const jobNames = JOBS.map((j) => j.name);
