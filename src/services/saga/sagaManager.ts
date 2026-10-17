import { randomUUID } from 'crypto';
import { SagaExecution } from '../../models';
import { logger } from '../../utils/logger';

export interface SagaStep<C> {
  name: string;
  execute: (context: C) => Promise<void>;
  /** Undo for a step that completed, run in reverse order when a later step fails. */
  compensate?: (context: C) => Promise<void>;
}

export interface SagaDefinition<C> {
  name: string;
  steps: SagaStep<C>[];
}

export interface SagaResult<C> {
  executionId: string;
  status: 'completed' | 'compensated' | 'failed';
  context: C;
  error?: unknown;
}

/**
 * Orchestrated saga: runs steps in order; when one fails, completed steps are compensated in reverse.
 * Every run is persisted in saga_executions (steps done, compensations, failing step, error) so
 * operators can see what happened (GET /api/system/sagas). Used by checkout (order -> payment) and
 * by refunds (provider refund -> stock restock -> discount rollback).
 */
export class SagaManager {
  async execute<C>(definition: SagaDefinition<C>, context: C): Promise<SagaResult<C>> {
    const executionId = randomUUID();
    const completed: SagaStep<C>[] = [];
    const record = await SagaExecution.create({ id: executionId, sagaName: definition.name, status: 'running', startedAt: new Date() }).catch((error) => {
      logger.warn('Could not persist saga execution', { error: error instanceof Error ? error.message : String(error) });
      return null;
    });

    for (const step of definition.steps) {
      try {
        await step.execute(context);
        completed.push(step);
        await record?.update({ completedSteps: completed.map((s) => s.name) }).catch(() => undefined);
      } catch (error) {
        logger.warn(`Saga ${definition.name} failed at ${step.name}`, { executionId, error: error instanceof Error ? error.message : String(error) });
        const compensated = await this.compensateSteps(completed, context, definition.name, executionId);
        const allCompensated = compensated.length === completed.filter((s) => s.compensate).length;
        await record
          ?.update({
            status: allCompensated ? 'compensated' : 'failed',
            failedStep: step.name,
            compensatedSteps: compensated,
            error: error instanceof Error ? error.message : String(error),
            finishedAt: new Date(),
          })
          .catch(() => undefined);
        return { executionId, status: allCompensated ? 'compensated' : 'failed', context, error };
      }
    }

    await record?.update({ status: 'completed', finishedAt: new Date() }).catch(() => undefined);
    return { executionId, status: 'completed', context };
  }

  async getExecution(executionId: string) {
    return SagaExecution.findByPk(executionId);
  }

  private async compensateSteps<C>(steps: SagaStep<C>[], context: C, sagaName: string, executionId: string): Promise<string[]> {
    const done: string[] = [];
    for (const step of [...steps].reverse()) {
      if (!step.compensate) continue;
      try {
        await step.compensate(context);
        done.push(step.name);
      } catch (error) {
        // A failed compensation needs a human: it is logged at error level and the saga is marked failed.
        logger.error(`Saga ${sagaName}: compensation of ${step.name} failed`, { executionId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return done;
  }
}

export const sagaManager = new SagaManager();
