const winston = require('winston');
const path = require('path');

/**
 * CURRICULUM COVERAGE:
 * #476-500: Logging - Winston logger configuration
 * #951-1000: Security - Audit logging
 */

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
        }
        return msg;
    })
);

// Create transports
const transports = [
    // Console transport
    new winston.transports.Console({
        format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat
    }),
    
    // Combined log file
    new winston.transports.File({
        filename: path.join(__dirname, '../logs/combined.log'),
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }),
    
    // Error log file
    new winston.transports.File({
        filename: path.join(__dirname, '../logs/error.log'),
        level: 'error',
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
    }),
    
    // Payment-specific log file
    new winston.transports.File({
        filename: path.join(__dirname, '../logs/payments.log'),
        level: 'info',
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5
    })
];

// Create logger
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    transports,
    exitOnError: false
});

// Payment logger helper
logger.payment = (message, metadata = {}) => {
    logger.info(message, { ...metadata, type: 'payment' });
};

// Security logger helper
logger.security = (message, metadata = {}) => {
    logger.warn(message, { ...metadata, type: 'security' });
};

// Audit logger helper
logger.audit = (message, metadata = {}) => {
    logger.info(message, { ...metadata, type: 'audit' });
};

module.exports = logger;
