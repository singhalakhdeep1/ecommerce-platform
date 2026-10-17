import { logger } from '../../utils/logger';
import { metrics } from '../metrics';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface ResilienceOptions {
  name: string;
  retryCount?: number;
  /** Consecutive failures that open the circuit. */
  exceptionsAllowedBeforeBreaking?: number;
  /** How long the circuit stays open before a trial call (ms). */
  breakDuration?: number;
  timeoutDuration?: number;
  /** Return false for errors that must not be retried (e.g. 4xx from the provider). */
  isRetryable?: (error: unknown) => boolean;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`${name} is temporarily unavailable (circuit open)`);
  }
}

export class TimeoutError extends Error {
  constructor(name: string, ms: number) {
    super(`${name} timed out after ${ms}ms`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry with exponential backoff + jitter, a circuit breaker and a timeout, composed for calls to
 * external services (Stripe, PayPal, Shippo, Mailchimp, Klaviyo, search engines, outgoing webhooks).
 * One instance per dependency, so a failing provider does not trip the breaker of another.
 */
export class ErrorHandlingService {
  readonly name: string;
  private readonly retryCount: number;
  private readonly threshold: number;
  private readonly breakDuration: number;
  private readonly timeoutDuration: number;
  private readonly isRetryable: (error: unknown) => boolean;
  private circuitState: CircuitState = 'closed';
  private failureCount = 0;
  private circuitOpenedAt = 0;

  constructor(options: ResilienceOptions) {
    this.name = options.name;
    this.retryCount = options.retryCount ?? Number(process.env.ERROR_HANDLING_RETRY_COUNT ?? 2);
    this.threshold = options.exceptionsAllowedBeforeBreaking ?? Number(process.env.ERROR_HANDLING_EXCEPTIONS_BEFORE_BREAKING ?? 5);
    this.breakDuration = options.breakDuration ?? Number(process.env.ERROR_HANDLING_BREAK_DURATION ?? 30_000);
    this.timeoutDuration = options.timeoutDuration ?? Number(process.env.ERROR_HANDLING_TIMEOUT ?? 15_000);
    this.isRetryable = options.isRetryable ?? (() => true);
  }

  async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt === this.retryCount || !this.isRetryable(error) || error instanceof CircuitOpenError) break;
        const delay = Math.min(200 * 2 ** attempt, 5_000) + Math.floor(Math.random() * 100);
        logger.warn(`${this.name}: attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
          error: error instanceof Error ? error.message : String(error),
        });
        await sleep(delay);
      }
    }
    throw lastError;
  }

  async executeWithCircuitBreaker<T>(operation: () => Promise<T>): Promise<T> {
    this.checkCircuitState();
    if (this.circuitState === 'open') throw new CircuitOpenError(this.name);
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      // Client errors (bad card, validation) say nothing about the provider's health.
      if (this.isRetryable(error)) this.onFailure();
      throw error;
    }
  }

  async executeWithTimeout<T>(operation: () => Promise<T>, ms = this.timeoutDuration): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new TimeoutError(this.name, ms)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Timeout per attempt, inside the breaker, inside the retry loop. */
  executeWithResilience<T>(operation: () => Promise<T>): Promise<T> {
    return this.executeWithRetry(() => this.executeWithCircuitBreaker(() => this.executeWithTimeout(operation)));
  }

  /** Runs `operation`, and on any failure (or an open circuit) returns `fallback()` instead. */
  async executeWithFallback<T>(operation: () => Promise<T>, fallback: (error: unknown) => T | Promise<T>): Promise<T> {
    try {
      return await this.executeWithResilience(operation);
    } catch (error) {
      return fallback(error);
    }
  }

  getCircuitState(): { name: string; state: CircuitState; failureCount: number; openedAt: string | null } {
    this.checkCircuitState();
    return {
      name: this.name,
      state: this.circuitState,
      failureCount: this.failureCount,
      openedAt: this.circuitOpenedAt ? new Date(this.circuitOpenedAt).toISOString() : null,
    };
  }

  resetCircuitBreaker(): void {
    this.circuitState = 'closed';
    this.failureCount = 0;
    this.circuitOpenedAt = 0;
    metrics.circuitState.set({ name: this.name }, 0);
  }

  private checkCircuitState(): void {
    if (this.circuitState === 'open' && Date.now() - this.circuitOpenedAt >= this.breakDuration) {
      this.circuitState = 'half-open';
    }
  }

  private onSuccess(): void {
    if (this.circuitState !== 'closed') logger.info(`${this.name}: circuit closed`);
    this.resetCircuitBreaker();
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.circuitState === 'half-open' || this.failureCount >= this.threshold) {
      this.circuitState = 'open';
      this.circuitOpenedAt = Date.now();
      metrics.circuitState.set({ name: this.name }, 1);
      logger.error(`${this.name}: circuit opened after ${this.failureCount} failures`);
    }
  }
}

/** HTTP status from axios / Stripe / fetch-style errors, when there is one. */
export function errorStatus(error: unknown): number | undefined {
  const e = error as { response?: { status?: number }; statusCode?: number; status?: number };
  return e?.response?.status ?? e?.statusCode ?? e?.status;
}

/** Retry network errors, timeouts, 429 and 5xx; never retry other 4xx. */
export const retryOnTransient = (error: unknown): boolean => {
  if (error instanceof CircuitOpenError) return false;
  const status = errorStatus(error);
  return status === undefined || status === 429 || status >= 500;
};

const breakers = new Map<string, ErrorHandlingService>();

/** Shared breaker per external dependency (state is visible on GET /api/system/health). */
export function resilience(name: string, options: Omit<ResilienceOptions, 'name'> = {}): ErrorHandlingService {
  let breaker = breakers.get(name);
  if (!breaker) {
    breaker = new ErrorHandlingService({ name, isRetryable: retryOnTransient, ...options });
    breakers.set(name, breaker);
  }
  return breaker;
}

export function allCircuitStates() {
  return [...breakers.values()].map((b) => b.getCircuitState());
}
