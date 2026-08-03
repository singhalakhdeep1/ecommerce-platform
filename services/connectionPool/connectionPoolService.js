/**
 * Connection Pooling Service for MongoDB
 * Optimizes database connection management for high concurrency
 */
class ConnectionPoolService {
  constructor(options = {}) {
    this.maxPoolSize = options.maxPoolSize || 100;
    this.connectionLifetime = options.connectionLifetime || 1800000; // 30 minutes
    this.connections = new Map();
    this.lastCleanup = new Date();
  }

  /**
   * Get connection from pool or create new one
   */
  async getConnection(connectionString) {
    const connectionKey = this.getConnectionKey(connectionString);

    // Try to get existing connection
    if (this.connections.has(connectionKey)) {
      const connection = this.connections.get(connectionKey);
      if (this.isConnectionValid(connection)) {
        connection.lastUsed = new Date();
        console.debug(`Reusing existing connection: ${connectionKey}`);
        return connection.client;
      } else {
        this.connections.delete(connectionKey);
        this.closeConnection(connection);
      }
    }

    // Check pool size limit
    if (this.connections.size >= this.maxPoolSize) {
      throw new Error('Connection pool exhausted');
    }

    // Create new connection
    const client = await this.createConnection(connectionString);
    this.connections.set(connectionKey, {
      connectionString,
      client,
      createdAt: new Date(),
      lastUsed: new Date()
    });

    console.debug(`Created new connection: ${connectionKey} (Pool size: ${this.connections.size})`);
    return client;
  }

  /**
   * Return connection to pool
   */
  returnConnection(connectionString) {
    const connectionKey = this.getConnectionKey(connectionString);

    if (this.connections.has(connectionKey)) {
      const connection = this.connections.get(connectionKey);
      if (this.isConnectionValid(connection)) {
        connection.lastUsed = new Date();
        console.debug(`Returned connection to pool: ${connectionKey}`);
      } else {
        this.connections.delete(connectionKey);
        console.debug(`Removed invalid connection from pool: ${connectionKey}`);
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStatistics() {
    return {
      totalConnections: this.connections.size,
      maxPoolSize: this.maxPoolSize,
      availableConnections: this.maxPoolSize - this.connections.size,
      lastCleanup: this.lastCleanup
    };
  }

  /**
   * Cleanup idle connections
   */
  cleanupIdleConnections() {
    console.log('Starting connection pool cleanup...');

    const now = new Date();
    for (const [key, connection] of this.connections) {
      if (now - connection.lastUsed > 3600000) { // 1 hour
        this.connections.delete(key);
        this.closeConnection(connection);
        console.debug(`Cleaned up idle connection: ${key}`);
      }
    }

    this.lastCleanup = new Date();
    console.log(`Connection pool cleanup completed. Current size: ${this.connections.size}`);
  }

  /**
   * Clear all connections
   */
  clearAllConnections() {
    console.warn('Clearing all connections from pool');

    for (const connection of this.connections.values()) {
      this.closeConnection(connection);
    }

    this.connections.clear();
  }

  async createConnection(connectionString) {
    // In a real implementation, this would create a MongoDB connection
    return { connectionString };
  }

  closeConnection(connection) {
    // In a real implementation, this would close the connection
    if (connection.client && connection.client.close) {
      connection.client.close();
    }
  }

  isConnectionValid(connection) {
    return new Date() - connection.createdAt < this.connectionLifetime;
  }

  getConnectionKey(connectionString) {
    // Simple hash for connection key
    return Buffer.from(connectionString).toString('base64');
  }
}

module.exports = ConnectionPoolService;
