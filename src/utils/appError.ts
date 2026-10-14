export class AppError extends Error {
  readonly isOperational = true;

  constructor(
    message: string,
    readonly statusCode = 500,
    readonly details?: unknown,
  ) {
    super(message);
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, details);
  }
  static unauthorized(message = 'Not authorized'): AppError {
    return new AppError(message, 401);
  }
  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(message, 403);
  }
  static notFound(message = 'Not found'): AppError {
    return new AppError(message, 404);
  }
  static conflict(message: string): AppError {
    return new AppError(message, 409);
  }
  static unprocessable(message: string, details?: unknown): AppError {
    return new AppError(message, 422, details);
  }
  static tooManyRequests(message = 'Too many requests'): AppError {
    return new AppError(message, 429);
  }
  static badGateway(message: string): AppError {
    return new AppError(message, 502);
  }
  static unavailable(message: string): AppError {
    return new AppError(message, 503);
  }
}
