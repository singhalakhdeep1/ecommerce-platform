/**
 * Database Sharding Service for E-commerce Data
 * Shards data by region and customer segment for horizontal scaling
 */
class DatabaseShardingService {
  constructor(shardsConfig) {
    this.shards = shardsConfig;
    this.shardClients = new Map();
    this.initializeShards();
  }

  /**
   * Get shard ID based on region and customer segment
   */
  getShardId(region, customerSegment) {
    const shardingKey = `${region.toLowerCase()}_${customerSegment.toLowerCase()}`;
    const hash = this.hashString(shardingKey);
    const shardIndex = hash % this.shards.length;
    return this.shards[shardIndex].id;
  }

  /**
   * Get shard ID based on customer ID
   */
  getShardIdByCustomer(customerId) {
    const region = customerId.substring(0, 2);
    const segment = customerId.substring(2, 4);
    return this.getShardId(region, segment);
  }

  /**
   * Get shard client for a specific shard ID
   */
  getShardClient(shardId) {
    const shard = this.shards.find(s => s.id === shardId);
    if (!shard) {
      throw new Error(`Shard not found: ${shardId}`);
    }

    if (!this.shardClients.has(shardId)) {
      this.shardClients.set(shardId, this.establishConnection(shard.connectionString));
    }

    return this.shardClients.get(shardId);
  }

  /**
   * Execute query on specific shard
   */
  async executeOnShard(shardId, operation) {
    const client = this.getShardClient(shardId);
    return await operation(client);
  }

  /**
   * Get shard health status
   */
  async getShardHealth() {
    const healthStatus = {};

    for (const shard of this.shards) {
      try {
        const client = this.getShardClient(shard.id);
        const isHealthy = await this.checkConnectionHealth(client);
        healthStatus[shard.id] = {
          shardId: shard.id,
          isHealthy,
          lastChecked: new Date()
        };
      } catch (error) {
        console.error(`Health check failed for shard ${shard.id}: ${error.message}`);
        healthStatus[shard.id] = {
          shardId: shard.id,
          isHealthy: false,
          lastChecked: new Date(),
          error: error.message
        };
      }
    }

    return healthStatus;
  }

  initializeShards() {
    for (const shard of this.shards) {
      console.log(`Initialized shard: ${shard.id} (Type: ${shard.shardType})`);
    }
  }

  establishConnection(connectionString) {
    // In a real implementation, this would create a database connection
    return { connectionString };
  }

  async checkConnectionHealth(client) {
    // In a real implementation, this would check the connection
    return true;
  }

  hashString(string) {
    let hash = 5381;
    for (let i = 0; i < string.length; i++) {
      hash = ((hash << 5) + hash) + string.charCodeAt(i);
    }
    return hash >>> 0;
  }
}

module.exports = DatabaseShardingService;
