import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';

export interface LogContext {
  correlationId: string;
  userId?: string | null;
  orderId?: string | null;
  ipAddress?: string | null;
  method?: string;
  path?: string;
}

type Extra = Record<string, unknown>;

const storage = new AsyncLocalStorage<LogContext>();

/**
 * Structured logging with correlation ids. Each HTTP request runs inside its own async context
 * (see middleware/requestContext), so every log line written while serving it carries the same
 * correlation id, user id and IP without passing them around by hand.
 */
export class StructuredLoggingService {
  static createCorrelationId(): string {
    return randomUUID();
  }

  /** Runs `fn` inside a new context (used once per request / background job). */
  static run<T>(context: LogContext, fn: () => T): T {
    return storage.run(context, fn);
  }

  static current(): LogContext | undefined {
    return storage.getStore();
  }

  /** Merges fields into the active context (e.g. the user id once auth has run). */
  setContext(context: Partial<LogContext>): void {
    const store = storage.getStore();
    if (store) Object.assign(store, context);
  }

  getContext(): LogContext {
    return storage.getStore() ?? { correlationId: 'none' };
  }

  logInformation(message: string, extra: Extra = {}): void {
    logger.info(message, this.createLogEntry(extra));
  }

  logWarning(message: string, extra: Extra = {}): void {
    logger.warn(message, this.createLogEntry(extra));
  }

  logError(message: string, error: unknown, extra: Extra = {}): void {
    const err = error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) };
    logger.error(message, this.createLogEntry({ ...extra, ...err }));
  }

  /** Security / compliance relevant actions (logins, role changes, refunds...). Also written to logs/payments.log. */
  logAuditEvent(eventType: string, description: string, extra: Extra = {}): void {
    logger.audit(description, this.createLogEntry({ ...extra, eventType }));
  }

  logOrderEvent(orderId: string, eventType: string, description: string, extra: Extra = {}): void {
    logger.audit(description, this.createLogEntry({ ...extra, orderId, eventType, category: 'order' }));
  }

  private createLogEntry(extra: Extra): Extra {
    const ctx = this.getContext();
    return {
      correlationId: ctx.correlationId,
      ...(ctx.userId ? { userId: ctx.userId } : {}),
      ...(ctx.ipAddress ? { ipAddress: ctx.ipAddress } : {}),
      ...extra,
    };
  }
}

export const structuredLog = new StructuredLoggingService();
