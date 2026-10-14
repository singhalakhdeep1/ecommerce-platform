import path from 'path';
import winston from 'winston';
import { env } from '../config/env';

const logDir = path.resolve(process.cwd(), 'logs');

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const rest = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}] ${message}${rest}`;
  }),
);

const transports: winston.transport[] = [
  new winston.transports.Console({ format: env.isProduction ? fileFormat : consoleFormat, silent: env.isTest }),
];

if (!env.isTest) {
  transports.push(
    new winston.transports.File({ filename: path.join(logDir, 'combined.log'), format: fileFormat, maxsize: 5_242_880, maxFiles: 5 }),
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error', format: fileFormat, maxsize: 5_242_880, maxFiles: 5 }),
    // Payments, security and audit events also land in their own file for compliance review.
    new winston.transports.File({
      filename: path.join(logDir, 'payments.log'),
      format: winston.format.combine(
        winston.format((info) => (info.type === 'payment' || info.type === 'security' || info.type === 'audit' ? info : false))(),
        fileFormat,
      ),
    }),
  );
}

const base = winston.createLogger({ level: env.logLevel, transports, exitOnError: false });

type Meta = Record<string, unknown>;

/** Winston logger plus the typed payment / security / audit helpers used across the app. */
export const logger = Object.assign(base, {
  payment: (message: string, meta: Meta = {}) => base.info(message, { ...meta, type: 'payment' }),
  security: (message: string, meta: Meta = {}) => base.warn(message, { ...meta, type: 'security' }),
  audit: (message: string, meta: Meta = {}) => base.info(message, { ...meta, type: 'audit' }),
});
