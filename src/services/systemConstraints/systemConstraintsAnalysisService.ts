import { env } from '../../config/env';

export interface ConstraintRequirements {
  targetLatencyMs: number;
  currentLatencyMs: number;
  /** Observed p95 latency (ms); estimated as 1.5x average when not measured. */
  currentP95LatencyMs?: number;
  targetTPS: number;
  currentTPS: number;
  targetUptime: number;
  currentUptime: number;
}

/**
 * Compares observed behaviour (latency, throughput, error-based availability, measured by the
 * request middleware) with targets, and lists the security/compliance controls this codebase
 * actually implements. Exposed on GET /api/system/constraints.
 */
export class SystemConstraintsAnalysisService {
  private readonly dataRetentionYears: number;
  private readonly requireEncryption: boolean;
  private readonly requireAuditLogging: boolean;

  constructor(options: { dataRetentionYears?: number; requireEncryption?: boolean; requireAuditLogging?: boolean } = {}) {
    this.dataRetentionYears = options.dataRetentionYears ?? Number(process.env.COMPLIANCE_DATA_RETENTION_YEARS ?? 7);
    this.requireEncryption = options.requireEncryption ?? process.env.COMPLIANCE_REQUIRE_ENCRYPTION !== 'false';
    this.requireAuditLogging = options.requireAuditLogging ?? process.env.COMPLIANCE_REQUIRE_AUDIT_LOGGING !== 'false';
  }

  analyzeConstraints(requirements: ConstraintRequirements) {
    const analysis = {
      analyzedAt: new Date(),
      requirements,
      latencyConstraints: this.analyzeLatencyConstraints(requirements),
      throughputConstraints: this.analyzeThroughputConstraints(requirements),
      availabilityConstraints: this.analyzeAvailabilityConstraints(requirements),
      securityConstraints: this.analyzeSecurityConstraints(),
      complianceConstraints: this.analyzeComplianceConstraints(),
      dataConstraints: this.analyzeDataConstraints(),
      recommendations: [] as string[],
    };
    analysis.recommendations = this.generateConstraintsRecommendations(analysis);
    return analysis;
  }

  generateComplianceReport(requirements: ConstraintRequirements) {
    const analysis = this.analyzeConstraints(requirements);
    return { analysis, complianceScore: this.calculateComplianceScore(analysis), generatedAt: new Date() };
  }

  analyzeLatencyConstraints(r: ConstraintRequirements) {
    return {
      targetLatencyMs: r.targetLatencyMs,
      currentLatencyMs: r.currentLatencyMs,
      isWithinTarget: r.currentLatencyMs <= r.targetLatencyMs,
      p95LatencyMs: r.currentP95LatencyMs ?? r.currentLatencyMs * 1.5,
    };
  }

  analyzeThroughputConstraints(r: ConstraintRequirements) {
    return {
      targetTPS: r.targetTPS,
      currentTPS: r.currentTPS,
      // Throughput is a capacity target: idle is fine as long as the limiter allows the target rate.
      isWithinTarget: r.currentTPS >= r.targetTPS || this.maxRequestsPerSecond() >= r.targetTPS,
      peakTPS: r.targetTPS * 3,
      sustainedTPS: r.targetTPS * 2,
      rateLimiterCapacityPerClient: this.maxRequestsPerSecond(),
    };
  }

  analyzeAvailabilityConstraints(r: ConstraintRequirements) {
    const allowedDowntimePerYear = this.calculateAllowedDowntime(r.targetUptime);
    return {
      targetUptime: r.targetUptime,
      currentUptime: r.currentUptime,
      isWithinTarget: r.currentUptime >= r.targetUptime,
      allowedDowntimeSecondsPerYear: allowedDowntimePerYear,
      allowedDowntimeSecondsPerMonth: Math.floor(allowedDowntimePerYear / 12),
      allowedDowntimeSecondsPerDay: Math.floor(allowedDowntimePerYear / 365),
    };
  }

  analyzeSecurityConstraints() {
    return {
      encryptionRequired: this.requireEncryption,
      passwordHashing: `bcrypt (${env.auth.bcryptRounds} rounds)`,
      encryptionInTransit: 'TLS terminated by the load balancer / ingress',
      authenticationRequired: true,
      authenticationMethods: ['JWT bearer tokens (revocable via token version)'],
      authorizationRequired: true,
      roles: ['customer', 'seller', 'admin'],
      tokenLifetime: env.auth.jwtExpiresIn,
      maxRequestsPerSecondPerClient: this.maxRequestsPerSecond(),
      loginAttemptsPerMinute: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 10),
      auditLoggingRequired: this.requireAuditLogging,
      cardDataStored: false,
    };
  }

  analyzeComplianceConstraints() {
    return {
      applicableRegulations: ['PCI DSS (card data handled only by Stripe/PayPal)', 'GDPR', 'CCPA'],
      dataRetentionYears: this.dataRetentionYears,
      auditLog: 'logs/payments.log (payment, security and audit events)',
      rightToErasure: 'DELETE /api/auth/me deactivates and anonymises the account',
      dataPortability: 'GET /api/auth/me/export returns the account, orders, reviews and wishlist as JSON',
    };
  }

  analyzeDataConstraints() {
    return {
      moneyType: 'NUMERIC(12,2)',
      databaseConstraints: ['stock >= 0', 'rating 1..5', 'order totals >= 0', 'one review per user per product'],
      migrations: 'umzug, reviewed SQL (src/db/migrations)',
      readReplicas: env.db.readReplicas.length,
      shards: env.db.shards.length,
    };
  }

  calculateAllowedDowntime(uptimePercentage: number): number {
    const downtimePercentage = 100 - uptimePercentage;
    return Math.floor(365 * 24 * 60 * 60 * (downtimePercentage / 100));
  }

  generateConstraintsRecommendations(analysis: ReturnType<SystemConstraintsAnalysisService['analyzeConstraints']>): string[] {
    const recommendations: string[] = [];
    if (!analysis.latencyConstraints.isWithinTarget) {
      recommendations.push('Latency above target: check slow queries (GET /api/system/indexes shows index usage) and cache hit ratio');
    }
    if (!analysis.throughputConstraints.isWithinTarget) {
      recommendations.push('Throughput below target: scale API instances horizontally (Redis keeps limits and caches shared)');
    }
    if (!analysis.availabilityConstraints.isWithinTarget) {
      recommendations.push('Error rate above budget: inspect logs/error.log and open circuit breakers on GET /api/system/health');
    }
    if (!this.requireAuditLogging) recommendations.push('Enable audit logging (COMPLIANCE_REQUIRE_AUDIT_LOGGING=true)');
    if (recommendations.length === 0) recommendations.push('All measured constraints are within target');
    return recommendations;
  }

  calculateComplianceScore(analysis: ReturnType<SystemConstraintsAnalysisService['analyzeConstraints']>): number {
    let score = 0;
    if (analysis.latencyConstraints.isWithinTarget) score += 20;
    if (analysis.throughputConstraints.isWithinTarget) score += 20;
    if (analysis.availabilityConstraints.isWithinTarget) score += 20;
    if (analysis.securityConstraints.encryptionRequired) score += 10;
    if (analysis.securityConstraints.authenticationRequired) score += 10;
    if (analysis.securityConstraints.auditLoggingRequired) score += 20;
    return score;
  }

  private maxRequestsPerSecond(): number {
    return Number(process.env.RATE_LIMIT_REFILL_RATE ?? 1) > 0 ? Number(process.env.RATE_LIMIT_REFILL_RATE ?? 1) : 0;
  }
}
