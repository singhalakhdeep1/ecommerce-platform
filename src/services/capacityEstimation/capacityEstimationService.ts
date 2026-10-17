export interface TransactionVolume {
  dailyTransactions: number;
  productCount: number;
  customerCount: number;
}

const GB = 1024 ** 3;
const TB = 1024 ** 4;

/**
 * Back-of-the-envelope capacity planning for the store. GET /api/system/capacity feeds it the live
 * volume (orders per day over the last 30 days, product and customer counts) unless a hypothetical
 * volume is passed in the query string.
 */
export class CapacityEstimationService {
  private readonly coresPerServer: number;
  private readonly memoryPerServerGB: number;
  private readonly redisMemoryPerNodeGB: number;

  constructor(options: { coresPerServer?: number; memoryPerServerGB?: number; redisMemoryPerNodeGB?: number } = {}) {
    this.coresPerServer = options.coresPerServer ?? Number(process.env.CAPACITY_CORES_PER_SERVER ?? 4);
    this.memoryPerServerGB = options.memoryPerServerGB ?? Number(process.env.CAPACITY_MEMORY_PER_SERVER_GB ?? 16);
    this.redisMemoryPerNodeGB = options.redisMemoryPerNodeGB ?? Number(process.env.CAPACITY_REDIS_MEMORY_PER_NODE_GB ?? 8);
  }

  estimateDatabaseCapacity(volume: TransactionVolume) {
    const perDay = volume.dailyTransactions;
    const avgRecordSize = 500; // bytes per order row incl. items, estimated
    const indexOverhead = 0.3;
    const dailyStorage = perDay * avgRecordSize * (1 + indexOverhead);
    const yearlyStorage = dailyStorage * 365;
    const productStorage = volume.productCount * 2000 * (1 + indexOverhead);
    const customerStorage = volume.customerCount * 2000 * (1 + indexOverhead);
    const totalStorage = yearlyStorage + productStorage + customerStorage;
    const avgIOPSPerTransaction = 5;
    return {
      dailyTransactions: perDay,
      monthlyTransactions: perDay * 30,
      yearlyTransactions: perDay * 365,
      dailyStorageBytes: dailyStorage,
      monthlyStorageBytes: dailyStorage * 30,
      yearlyStorageBytes: yearlyStorage,
      productStorageBytes: productStorage,
      customerStorageBytes: customerStorage,
      totalStorageBytes: totalStorage,
      totalStorageGB: totalStorage / GB,
      totalStorageTB: totalStorage / TB,
      estimatedIOPS: Math.ceil((perDay / 86_400) * avgIOPSPerTransaction * 2),
      readWriteRatio: 0.7,
    };
  }

  estimateApplicationCapacity(volume: TransactionVolume) {
    const transactionsPerSecond = volume.dailyTransactions / 86_400;
    const peakTPS = transactionsPerSecond * 3;
    const cpuCoresPerTPS = 0.1;
    // At least one core and one server: a store never runs on zero machines.
    const totalCPUCores = Math.max(1, Math.ceil(peakTPS * cpuCoresPerTPS));
    const serverCount = Math.max(1, Math.ceil(totalCPUCores / this.coresPerServer));
    const bytesPerTransaction = 1024 + 2048;
    return {
      transactionsPerSecond,
      peakTPS,
      totalCPUCores,
      serverCount,
      coresPerServer: this.coresPerServer,
      totalMemoryGB: serverCount * this.memoryPerServerGB,
      memoryPerServerGB: this.memoryPerServerGB,
      bandwidthMbps: (peakTPS * bytesPerTransaction * 8) / 1_000_000,
      recommendedInstanceType: this.getRecommendedInstanceType(Math.min(totalCPUCores, this.coresPerServer), this.memoryPerServerGB),
    };
  }

  estimateCacheCapacity(volume: TransactionVolume) {
    const productCacheSize = volume.productCount * 2048;
    const orderCacheSize = volume.dailyTransactions * 100;
    const sessionCacheSize = volume.customerCount * 512;
    const totalCacheSize = productCacheSize + orderCacheSize + sessionCacheSize;
    const totalMemoryRequired = totalCacheSize * 1.5; // Redis per-key overhead
    return {
      productCacheSizeBytes: productCacheSize,
      orderCacheSizeBytes: orderCacheSize,
      sessionCacheSizeBytes: sessionCacheSize,
      totalCacheSizeBytes: totalCacheSize,
      totalMemoryRequiredBytes: totalMemoryRequired,
      totalMemoryRequiredGB: totalMemoryRequired / GB,
      redisNodes: Math.max(1, Math.ceil(totalMemoryRequired / (this.redisMemoryPerNodeGB * GB))),
      redisMemoryPerNodeGB: this.redisMemoryPerNodeGB,
    };
  }

  generateCapacityReport(volume: TransactionVolume) {
    const databaseCapacity = this.estimateDatabaseCapacity(volume);
    const applicationCapacity = this.estimateApplicationCapacity(volume);
    const cacheCapacity = this.estimateCacheCapacity(volume);
    return {
      transactionVolume: volume,
      databaseCapacity,
      applicationCapacity,
      cacheCapacity,
      generatedAt: new Date(),
      recommendations: this.generateRecommendations(databaseCapacity, applicationCapacity, cacheCapacity),
    };
  }

  generateRecommendations(
    db: ReturnType<CapacityEstimationService['estimateDatabaseCapacity']>,
    app: ReturnType<CapacityEstimationService['estimateApplicationCapacity']>,
    cache: ReturnType<CapacityEstimationService['estimateCacheCapacity']>,
  ): string[] {
    const recommendations: string[] = [];
    if (db.totalStorageTB > 1) recommendations.push('Storage above 1 TB: enable DB_SHARDS for the analytics event stream');
    if (db.estimatedIOPS > 10_000) recommendations.push('Use provisioned IOPS storage for the primary database');
    if (app.serverCount > 10) recommendations.push('Run the API on Kubernetes with a horizontal pod autoscaler');
    if (app.bandwidthMbps > 1000) recommendations.push('Serve product images through a CDN');
    if (cache.redisNodes > 3) recommendations.push('Use Redis Cluster for the shared cache');
    if (app.peakTPS > 50) recommendations.push('Add read replicas (DB_READ_REPLICAS) for analytics and catalog reads');
    if (recommendations.length === 0) recommendations.push('Current volume fits a single API instance, one PostgreSQL primary and one Redis node');
    return recommendations;
  }

  getRecommendedInstanceType(cores: number, memoryGB: number): string {
    if (cores <= 2 && memoryGB <= 4) return 't3.medium';
    if (cores <= 4 && memoryGB <= 8) return 't3.large';
    if (cores <= 8 && memoryGB <= 16) return 'm5.xlarge';
    if (cores <= 16 && memoryGB <= 32) return 'm5.2xlarge';
    if (cores <= 32 && memoryGB <= 64) return 'm5.4xlarge';
    return 'm5.8xlarge';
  }
}
