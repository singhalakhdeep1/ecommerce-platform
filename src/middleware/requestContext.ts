import { NextFunction, Request, Response } from 'express';
import { metrics } from '../services/metrics';
import { StructuredLoggingService, structuredLog } from '../services/logging/structuredLoggingService';

const HEADER = 'x-correlation-id';
const VALID_ID = /^[A-Za-z0-9\-_.]{8,64}$/;

/** Rolling window of recent requests, read by GET /api/system/constraints (latency, TPS, error rate). */
const WINDOW_MS = 5 * 60_000;
const recent: Array<{ at: number; ms: number; status: number }> = [];

export function liveStats() {
  const cutoff = Date.now() - WINDOW_MS;
  while (recent.length && recent[0].at < cutoff) recent.shift();
  const n = recent.length;
  const latencies = recent.map((r) => r.ms).sort((a, b) => a - b);
  const errors = recent.filter((r) => r.status >= 500).length;
  const spanSeconds = n ? Math.max(1, (Date.now() - recent[0].at) / 1000) : 1;
  return {
    windowSeconds: WINDOW_MS / 1000,
    requests: n,
    avgLatencyMs: n ? latencies.reduce((a, b) => a + b, 0) / n : 0,
    p95LatencyMs: n ? latencies[Math.min(n - 1, Math.floor(n * 0.95))] : 0,
    requestsPerSecond: n / spanSeconds,
    availabilityPercent: n ? ((n - errors) / n) * 100 : 100,
  };
}

/**
 * Per-request context: correlation id (accepted from X-Correlation-Id or generated, echoed back),
 * an async logging context, Prometheus metrics and one structured access-log line.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(HEADER);
  const correlationId = incoming && VALID_ID.test(incoming) ? incoming : StructuredLoggingService.createCorrelationId();
  res.setHeader('X-Correlation-Id', correlationId);
  const started = process.hrtime.bigint();

  StructuredLoggingService.run({ correlationId, ipAddress: req.ip, method: req.method, path: req.originalUrl }, () => {
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || 'unmatched';
      metrics.httpRequests.inc({ method: req.method, route, status: String(res.statusCode) });
      metrics.httpDuration.observe({ method: req.method, route }, ms / 1000);
      if (!req.originalUrl.startsWith('/metrics') && !req.originalUrl.startsWith('/health')) {
        recent.push({ at: Date.now(), ms, status: res.statusCode });
        if (recent.length > 50_000) recent.splice(0, recent.length - 50_000);
        structuredLog.logInformation('request', { method: req.method, path: req.originalUrl, status: res.statusCode, durationMs: Math.round(ms * 10) / 10 });
      }
    });
    next();
  });
}
