/**
 * Structured Logging Service for E-commerce Audit Logs
 * Implements structured logging with correlation IDs and context
 */
const { v4: uuidv4 } = require('uuid');

class StructuredLoggingService {
  constructor() {
    this.currentContext = null;
  }

  /**
   * Set current log context
   */
  setContext(context) {
    this.currentContext = context;
  }

  /**
   * Get current log context
   */
  getContext() {
    return this.currentContext;
  }

  /**
   * Log information with structured context
   */
  logInformation(message, additionalContext = {}) {
    const logEntry = this.createLogEntry('Information', message, additionalContext, null);
    console.log(JSON.stringify(logEntry));
  }

  /**
   * Log warning with structured context
   */
  logWarning(message, additionalContext = {}) {
    const logEntry = this.createLogEntry('Warning', message, additionalContext, null);
    console.warn(JSON.stringify(logEntry));
  }

  /**
   * Log error with structured context
   */
  logError(message, error, additionalContext = {}) {
    const logEntry = this.createLogEntry('Error', message, additionalContext, error);
    console.error(JSON.stringify(logEntry));
  }

  /**
   * Log audit event for compliance
   */
  logAuditEvent(eventType, description, additionalContext = {}) {
    const context = { ...additionalContext };
    context.auditEventType = eventType;
    context.auditDescription = description;

    const logEntry = this.createLogEntry('Audit', `AUDIT: ${description}`, context, null);
    console.log(JSON.stringify(logEntry));
  }

  /**
   * Log order event
   */
  logOrderEvent(orderId, eventType, description, additionalContext = {}) {
    const context = { ...additionalContext };
    context.orderId = orderId;
    context.orderEventType = eventType;
    context.orderDescription = description;

    const logEntry = this.createLogEntry('Order', `ORDER: ${description}`, context, null);
    console.log(JSON.stringify(logEntry));
  }

  /**
   * Create new correlation ID
   */
  static createCorrelationId() {
    return uuidv4();
  }

  createLogEntry(level, message, additionalContext, error) {
    const context = this.currentContext || this.defaultContext();

    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: context.correlationId,
      userId: context.userId,
      orderId: context.orderId,
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      additionalContext,
      error
    };
  }

  defaultContext() {
    return {
      correlationId: StructuredLoggingService.createCorrelationId(),
      userId: null,
      orderId: null,
      requestId: null,
      ipAddress: null,
      userAgent: null
    };
  }
}

module.exports = StructuredLoggingService;
