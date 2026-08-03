/**
 * Error Handling Service with Retry and Circuit Breaker Patterns
 * Implements resilience patterns for external service calls
 */
class ErrorHandlingService {
  constructor(options = {}) {
    this.retryCount = options.retryCount || 3;
    this.exceptionsAllowedBeforeBreaking = options.exceptionsAllowedBeforeBreaking || 5;
    this.breakDuration = options.breakDuration || 60000; // 1 minute
    this.timeoutDuration = options.timeoutDuration || 30000; // 30 seconds
    this.circuitState = 'closed';
    this.circuitOpenedAt = null;
    this.failureCount = 0;
  }

  /**
   * Execute operation with retry
   */
  async executeWithRetry(operation) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        const result = await operation();
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < this.retryCount) {
          const delay = 100 * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute operation with circuit breaker
   */
  async executeWithCircuitBreaker(operation) {
    this.checkCircuitState();

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Execute operation with timeout
   */
  async executeWithTimeout(operation) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Operation timed out'));
      }, this.timeoutDuration);

      operation()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Execute operation with all resilience patterns
   */
  async executeWithResilience(operation) {
    const circuitBreakerOp = async () => {
      return await this.executeWithCircuitBreaker(operation);
    };

    return await this.executeWithRetry(circuitBreakerOp);
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState() {
    return this.circuitState;
  }

  /**
   * Reset circuit breaker manually
   */
  resetCircuitBreaker() {
    this.circuitState = 'closed';
    this.circuitOpenedAt = null;
    console.log('Circuit breaker manually reset');
  }

  /**
   * Isolate circuit breaker (manual open)
   */
  isolateCircuitBreaker() {
    this.circuitState = 'open';
    this.circuitOpenedAt = Date.now();
    console.warn('Circuit breaker manually isolated');
  }

  checkCircuitState() {
    if (this.circuitState === 'open' && this.circuitOpenedAt) {
      if (Date.now() - this.circuitOpenedAt > this.breakDuration) {
        this.circuitState = 'half-open';
        console.log('Circuit breaker transitioning to half-open');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
  }

  onSuccess() {
    if (this.circuitState === 'half-open') {
      this.circuitState = 'closed';
      this.failureCount = 0;
    }
  }

  onFailure() {
    this.failureCount++;

    if (this.failureCount >= this.exceptionsAllowedBeforeBreaking) {
      this.circuitState = 'open';
      this.circuitOpenedAt = Date.now();
      console.warn(`Circuit breaker opened after ${this.failureCount} failures`);
    }
  }
}

module.exports = ErrorHandlingService;
