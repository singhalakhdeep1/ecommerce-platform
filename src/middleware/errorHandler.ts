import { NextFunction, Request, Response } from 'express';
import { BaseError, ForeignKeyConstraintError, UniqueConstraintError, ValidationError, DatabaseError } from 'sequelize';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { CircuitOpenError, TimeoutError, errorStatus } from '../services/errorHandling/errorHandlingService';
import { structuredLog } from '../services/logging/structuredLoggingService';
import { AppError } from '../utils/appError';
import { formatZodError } from './validate';

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/** Maps every error to `{ success: false, error, details?, correlationId }` with the right status. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let status = 500;
  let message = 'Internal server error';
  let details: unknown;

  if (err instanceof AppError) {
    status = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 400;
    message = 'Validation failed';
    details = formatZodError(err);
  } else if (err instanceof UniqueConstraintError) {
    status = 409;
    message = 'Duplicate value';
    details = err.errors.map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof ValidationError) {
    status = 400;
    message = 'Validation failed';
    details = err.errors.map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof ForeignKeyConstraintError) {
    status = 409;
    message = 'Referenced record does not exist or is still in use';
  } else if (err instanceof DatabaseError && /check constraint|invalid input syntax/i.test(err.message)) {
    status = 400;
    message = /check constraint/i.test(err.message) ? 'Value violates a data constraint' : 'Invalid value';
  } else if (err instanceof CircuitOpenError) {
    status = 503;
    message = err.message;
  } else if (err instanceof TimeoutError) {
    status = 504;
    message = err.message;
  } else if (err instanceof SyntaxError && 'body' in (err as object)) {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err instanceof Error && (err as { type?: string }).type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  } else if (err instanceof Error && errorStatus(err) && (err as { type?: string }).type?.startsWith('Stripe')) {
    // Stripe card errors etc. are the client's problem; Stripe outages are a bad gateway.
    const providerStatus = errorStatus(err)!;
    status = providerStatus >= 500 ? 502 : 402;
    message = err.message;
  }

  const ctx = structuredLog.getContext();
  if (status >= 500) {
    structuredLog.logError(`${req.method} ${req.originalUrl} failed`, err, { status });
  } else if (!(err instanceof BaseError)) {
    structuredLog.logInformation(`${req.method} ${req.originalUrl} -> ${status}: ${message}`);
  }

  res.status(status).json({
    success: false,
    error: status >= 500 && env.isProduction ? 'Internal server error' : message,
    ...(details !== undefined ? { details } : {}),
    correlationId: ctx.correlationId,
    ...(env.nodeEnv === 'development' && status >= 500 && err instanceof Error ? { stack: err.stack } : {}),
  });
}
