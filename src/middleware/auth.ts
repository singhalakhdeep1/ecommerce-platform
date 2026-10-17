import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User, UserRole } from '../models/User';
import { structuredLog } from '../services/logging/structuredLoggingService';
import { AppError } from '../utils/appError';

interface TokenPayload {
  sub: string;
  role: UserRole;
  ver: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      /** Unparsed request body, kept for webhook signature verification. */
      rawBody?: Buffer;
    }
  }
}

export function signToken(user: User): string {
  const payload: TokenPayload = { sub: user.id, role: user.role, ver: user.tokenVersion };
  return jwt.sign(payload, env.auth.jwtSecret, { expiresIn: env.auth.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  return null;
}

/** Resolves the user behind a token; null when the token is invalid, expired, revoked or the account is disabled. */
export async function userFromToken(token: string): Promise<User | null> {
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.auth.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
  const user = await User.findByPk(payload.sub);
  if (!user || !user.isActive || user.tokenVersion !== payload.ver) return null;
  return user;
}

async function attach(req: Request): Promise<boolean> {
  const token = bearer(req);
  if (!token) return false;
  const user = await userFromToken(token);
  if (!user) return false;
  req.user = user;
  structuredLog.setContext({ userId: user.id });
  return true;
}

export function protect(req: Request, _res: Response, next: NextFunction): void {
  attach(req)
    .then((ok) => next(ok ? undefined : AppError.unauthorized('Not authorized: missing, invalid or expired token')))
    .catch(next);
}

/** Attaches the user when a valid token is present; anonymous requests continue. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  attach(req)
    .then(() => next())
    .catch(next);
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      structuredLog.logAuditEvent('AccessDenied', `Role ${req.user.role} tried ${req.method} ${req.originalUrl}`);
      return next(AppError.forbidden(`Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

export const adminOnly = [protect, authorize('admin')];
