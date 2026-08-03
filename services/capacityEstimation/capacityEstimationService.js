/**
 * Capacity Estimation Service for E-commerce Operations
 * Calculates resource requirements for scaling e-commerce operations
 */
class CapacityEstimationService {
  constructor(options = {}) {
    this.coresPerServer = options.coresPerServer || 4;
    this.memoryPerServerGB = options.memoryPerServerGB || 16;
    this.redisMemoryPerNodeGB = options.redisMemoryPerNodeGB || 8;
  }

  /**
   * Estimate database capacity requirements
   */
  estimateDatabaseCapacity(volume) {
    const transactionsPerDay = volume.dailyTransactions;
    const transactionsPerMonth = transactionsPerDay * 30;
    const transactionsPerYear = transactionsPerDay * 365;

    // Average transaction record size (estimated)
    const avgRecordSize = 500; // bytes
    const indexOverhead = 0.3; // 30% overhead for indexes

    const dailyStorage = transactionsPerDay * avgRecordSize * (1 + indexOverhead);
    const monthlyStorage = dailyStorage * 30;
    const yearlyStorage = dailyStorage * 365;

    // Product records storage
    const productStorage = volume.productCount * 2000 * (1 + indexOverhead);

    // Customer records storage
    const customerStorage = volume.customerCount * 2000 * (1 + indexOverhead);

    const totalStorage = yearlyStorage + productStorage + customerStorage;

    // IOPS estimation
    const avgIOPSPerTransaction = 5;
    const peakIOPS = Math.floor((transactionsPerDay / 86400) * avgIOPSPerTransaction * 2);

    return {
      dailyTransactions: transactionsPerDay,
      monthlyTransactions: transactionsPerMonth,
      yearlyTransactions: transactionsPerYear,
      dailyStorageBytes: dailyStorage,
      monthlyStorageBytes: monthlyStorage,
      yearlyStorageBytes: yearlyStorage,
      productStorageBytes: productStorage,
      customerStorageBytes: customerStorage,
      totalStorageBytes: totalStorage,
      totalStorageGB: totalStorage / (1024 * 1024 * 1024),
      totalStorageTB: totalStorage / (1024 * 1024 * 1024 * 1024),
      estimatedIOPS: peakIOPS,
      readWriteRatio: 0.7
    };
  }

  /**
   * Estimate application server capacity
   */
  estimateApplicationCapacity(volume) {
    const transactionsPerSecond = volume.dailyTransactions / 86400;
    const peakTPS = transactionsPerSecond * 3;

    // CPU requirements
    const cpuCoresPerTPS = 0.1;
    const totalCPUCores = Math.floor(peakTPS * cpuCoresPerTPS);
    const serverCount = Math.ceil(totalCPUCores / this.coresPerServer);

    // Memory requirements
    const totalMemoryGB = serverCount * this.memoryPerServerGB;

    // Network bandwidth
    const avgRequestSize = 1024; // 1 KB
    const avgResponseSize = 2048; // 2 KB
    const bandwidthPerSecond = peakTPS * (avgRequestSize + avgResponseSize);
    const bandwidthMbps = bandwidthPerSecond * 8 / 1_000_000;

    return {
      transactionsPerSecond,
      peakTPS,
      totalCPUCores,
      serverCount,
      coresPerServer: this.coresPerServer,
      totalMemoryGB,
      memoryPerServerGB: this.memoryPerServerGB,
      bandwidthMbps,
      recommendedInstanceType: this.getRecommendedInstanceType(totalCPUCores, this.memoryPerServerGB)
    };
  }

  /**
   * Estimate cache capacity
   */
  estimateCacheCapacity(volume) {
    const productCacheSize = volume.productCount * 2048;
    const orderCacheSize = volume.dailyTransactions * 100;
    const sessionCacheSize = volume.customerCount * 512;

    const totalCacheSize = productCacheSize + orderCacheSize + sessionCacheSize;

    // Redis memory overhead
    const memoryOverhead = 1.5;
    const totalMemoryRequired = totalCacheSize * memoryOverhead;

    const redisNodes = Math.ceil(totalMemoryRequired / (this.redisMemoryPerNodeGB * 1024 * 1024 * 1024));

    return {
      productCacheSizeBytes: productCacheSize,
      orderCacheSizeBytes: orderCacheSize,
      sessionCacheSizeBytes: sessionCacheSize,
      totalCacheSizeBytes: totalCacheSize,
      totalMemoryRequiredBytes: totalMemoryRequired,
      totalMemoryRequiredGB: totalMemoryRequired / (1024 * 1024 * 1024),
      redisNodes,
      redisMemoryPerNodeGB: this.redisMemoryPerNodeGB
    };
  }

  /**
   * Generate comprehensive capacity report
   */
  generateCapacityReport(volume) {
    const dbCapacity = this.estimateDatabaseCapacity(volume);
    const appCapacity = this.estimateApplicationCapacity(volume);
    const cacheCapacity = this.estimateCacheCapacity(volume);

    return {
      transactionVolume: volume,
      databaseCapacity: dbCapacity,
      applicationCapacity: appCapacity,
      cacheCapacity: cacheCapacity,
      generatedAt: new Date(),
      recommendations: this.generateRecommendations(dbCapacity, appCapacity, cacheCapacity)
    };
  }

  generateRecommendations(dbCapacity, appCapacity, cacheCapacity) {
    const recommendations = [];

    // Database recommendations
    if (dbCapacity.totalStorageTB > 1) {
      recommendations.push('Consider database sharding for storage > 1TB');
    }
    if (dbCapacity.estimatedIOPS > 10000) {
      recommendations.push('Use provisioned IOPS storage for high IOPS requirements');
    }

    // Application recommendations
    if (appCapacity.serverCount > 10) {
      recommendations.push('Consider using Kubernetes for auto-scaling');
    }
    if (appCapacity.bandwidthMbps > 1000) {
      recommendations.push('Use CDN for static content to reduce bandwidth');
    }

    // Cache recommendations
    if (cacheCapacity.redisNodes > 3) {
      recommendations.push('Use Redis Cluster for distributed caching');
    }

    // General recommendations
    recommendations.push('Implement read replicas for read-heavy workloads');
    recommendations.push('Use connection pooling for database connections');
    recommendations.push('Implement rate limiting to prevent abuse');

    return recommendations;
  }

  getRecommendedInstanceType(cores, memoryGB) {
    if (cores <= 2 && memoryGB <= 4) return 't3.medium';
    if (cores <= 4 && memoryGB <= 8) return 't3.large';
    if (cores <= 8 && memoryGB <= 16) return 'm5.xlarge';
    if (cores <= 16 && memoryGB <= 32) return 'm5.2xlarge';
    if (cores <= 32 && memoryGB <= 64) return 'm5.4xlarge';
    return 'm5.8xlarge';
  }
}

module.exports = CapacityEstimationService;
