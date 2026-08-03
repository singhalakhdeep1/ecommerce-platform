/**
 * Unit of Work Pattern Implementation
 * Manages transactions and repository coordination
 */
class UnitOfWork {
  constructor() {
    this.repositories = new Map();
    this.transactionActive = false;
  }

  /**
   * Begin transaction
   */
  async beginTransaction(operation) {
    if (this.transactionActive) {
      throw new Error('Transaction already active');
    }

    this.transactionActive = true;

    try {
      await operation();
      this.transactionActive = false;
    } catch (error) {
      this.transactionActive = false;
      throw error;
    }
  }

  /**
   * Get repository for model class
   */
  repository(modelClass) {
    if (!this.repositories.has(modelClass)) {
      this.repositories.set(modelClass, new Repository(modelClass));
    }
    return this.repositories.get(modelClass);
  }

  /**
   * Register repository
   */
  registerRepository(modelClass, repository) {
    this.repositories.set(modelClass, repository);
  }

  /**
   * Check if transaction is active
   */
  isTransactionActive() {
    return this.transactionActive;
  }

  /**
   * Commit transaction (handled by Mongoose)
   */
  async commit() {
    this.transactionActive = false;
  }

  /**
   * Rollback transaction (handled by Mongoose)
   */
  async rollback() {
    this.transactionActive = false;
  }
}

module.exports = UnitOfWork;
