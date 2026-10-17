'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Badge, Card, Spinner, Stat } from '@/components/ui';
import { api, date } from '@/lib/api';

interface Health {
  status: string;
  uptimeSeconds: number;
  memoryMb: number;
  database: { ok: boolean; latencyMs: number };
  kvStore: { backend: string; ok: boolean };
  readReplicas: Array<{ id: string; target: string; healthy: boolean; lagSeconds: number | null }>;
  shards: Array<{ id: string; healthy: boolean; events?: number; latencyMs: number }>;
  connectionPools: { primary: { size: number; inUse: number; idle: number; waiting: number; max: number } | null };
  circuitBreakers: Array<{ name: string; state: string; failureCount: number }>;
  searchEngines: Array<{ engine: string; healthy: boolean; default: boolean }>;
  jobs: string[];
  traffic: { requests: number; avgLatencyMs: number; p95LatencyMs: number; requestsPerSecond: number; availabilityPercent: number };
}
interface Saga {
  id: string;
  sagaName: string;
  status: string;
  completedSteps: string[];
  compensatedSteps: string[];
  failedStep: string | null;
  error: string | null;
  startedAt: string;
}
interface Capacity {
  liveVolume: { dailyTransactions: number; productCount: number; customerCount: number };
  databaseCapacity: { totalStorageGB: number; estimatedIOPS: number };
  applicationCapacity: { peakTPS: number; serverCount: number; recommendedInstanceType: string };
  cacheCapacity: { totalMemoryRequiredGB: number; redisNodes: number };
  recommendations: string[];
}
interface Constraints {
  complianceScore: number;
  analysis: { recommendations: string[]; latencyConstraints: { isWithinTarget: boolean }; throughputConstraints: { isWithinTarget: boolean }; availabilityConstraints: { isWithinTarget: boolean } };
}
interface Index {
  table: string;
  index: string;
  scans: number;
  sizeBytes: number;
}

export default function AdminSystem() {
  const { notify } = useStore();
  const [health, setHealth] = useState<Health | null>(null);
  const [sagas, setSagas] = useState<Saga[]>([]);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [constraints, setConstraints] = useState<Constraints | null>(null);
  const [unused, setUnused] = useState<Index[]>([]);
  const [outbox, setOutbox] = useState<Array<{ to: string; subject: string; at: string; delivered: boolean }>>([]);

  const load = useCallback(() => {
    api<{ data: Health }>('/api/system/health').then((r) => setHealth(r.data)).catch((e) => notify(e.message, 'error'));
    api<{ data: Saga[] }>('/api/system/sagas?limit=20').then((r) => setSagas(r.data)).catch(() => undefined);
    api<{ data: Capacity }>('/api/system/capacity').then((r) => setCapacity(r.data)).catch(() => undefined);
    api<{ data: Constraints }>('/api/system/constraints').then((r) => setConstraints(r.data)).catch(() => undefined);
    api<{ data: Index[] }>('/api/system/indexes/unused').then((r) => setUnused(r.data)).catch(() => undefined);
    api<{ data: Array<{ to: string; subject: string; at: string; delivered: boolean }> }>('/api/system/outbox').then((r) => setOutbox(r.data.slice(0, 15))).catch(() => undefined);
  }, [notify]);
  useEffect(load, [load]);

  const runJob = async (name: string) => {
    const res = await api<{ data: { result: unknown } }>(`/api/system/jobs/${name}/run`, { method: 'POST' });
    notify(`${name}: ${JSON.stringify(res.data.result)}`);
    load();
  };
  const reset = async (name: string) => {
    await api(`/api/system/circuits/${encodeURIComponent(name)}/reset`, { method: 'POST' });
    load();
  };

  if (!health) return <Spinner />;
  const ok = (b: boolean) => <Badge tone={b ? 'emerald' : 'rose'}>{b ? 'ok' : 'down'}</Badge>;

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">System</h1>
        <button className="btn-secondary" onClick={load}>
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Status" value={health.status} hint={`up ${Math.round(health.uptimeSeconds / 60)} min · ${health.memoryMb} MB`} />
        <Stat label="Avg latency (5 min)" value={`${health.traffic.avgLatencyMs.toFixed(1)} ms`} hint={`p95 ${health.traffic.p95LatencyMs.toFixed(1)} ms`} />
        <Stat label="Throughput" value={`${health.traffic.requestsPerSecond.toFixed(2)} req/s`} hint={`${health.traffic.requests} requests`} />
        <Stat label="Availability" value={`${health.traffic.availabilityPercent.toFixed(2)}%`} hint={constraints ? `constraint score ${constraints.complianceScore}/100` : undefined} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Dependencies">
          <table className="table">
            <tbody>
              <tr>
                <td>PostgreSQL primary</td>
                <td>
                  {ok(health.database.ok)} {health.database.latencyMs} ms
                </td>
              </tr>
              <tr>
                <td>Pool</td>
                <td>{health.connectionPools.primary && `${health.connectionPools.primary.inUse} in use / ${health.connectionPools.primary.size} open / max ${health.connectionPools.primary.max}, ${health.connectionPools.primary.waiting} waiting`}</td>
              </tr>
              <tr>
                <td>Shared store</td>
                <td>
                  {ok(health.kvStore.ok)} {health.kvStore.backend}
                  {health.kvStore.backend === 'memory' && <span className="ml-1 text-xs text-amber-700">single instance only</span>}
                </td>
              </tr>
              {health.readReplicas.map((r) => (
                <tr key={r.id}>
                  <td>Replica {r.id}</td>
                  <td>
                    {ok(r.healthy)} lag {r.lagSeconds ?? '?'} s
                  </td>
                </tr>
              ))}
              {health.shards.map((s) => (
                <tr key={s.id}>
                  <td>Shard {s.id}</td>
                  <td>
                    {ok(s.healthy)} {s.events ?? 0} events
                  </td>
                </tr>
              ))}
              {health.searchEngines.map((s) => (
                <tr key={s.engine}>
                  <td>Search: {s.engine}</td>
                  <td>
                    {ok(s.healthy)} {s.default && <Badge tone="violet">default</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Circuit breakers & jobs">
          {health.circuitBreakers.length === 0 && <p className="text-sm text-slate-500">No external calls made yet.</p>}
          <ul className="mb-4 space-y-1 text-sm">
            {health.circuitBreakers.map((c) => (
              <li key={c.name} className="flex justify-between">
                <span>
                  {c.name} <Badge tone={c.state === 'closed' ? 'emerald' : c.state === 'open' ? 'rose' : 'amber'}>{c.state}</Badge>
                </span>
                {c.state !== 'closed' && (
                  <button className="text-indigo-600" onClick={() => void reset(c.name)}>
                    Reset
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {health.jobs.map((j) => (
              <button key={j} className="btn-secondary" onClick={() => void runJob(j)}>
                Run {j}
              </button>
            ))}
          </div>
        </Card>
        {capacity && (
          <Card title="Capacity estimate (live volume)">
            <p className="mb-2 text-sm text-slate-600">
              {capacity.liveVolume.dailyTransactions} orders/day · {capacity.liveVolume.productCount} products · {capacity.liveVolume.customerCount} customers
            </p>
            <ul className="mb-2 text-sm">
              <li>Database: {capacity.databaseCapacity.totalStorageGB.toFixed(3)} GB/yr, ~{capacity.databaseCapacity.estimatedIOPS} IOPS peak</li>
              <li>
                API: {capacity.applicationCapacity.serverCount} × {capacity.applicationCapacity.recommendedInstanceType} (peak {capacity.applicationCapacity.peakTPS.toFixed(3)} TPS)
              </li>
              <li>
                Cache: {capacity.cacheCapacity.totalMemoryRequiredGB.toFixed(4)} GB, {capacity.cacheCapacity.redisNodes} Redis node(s)
              </li>
            </ul>
            <ul className="list-inside list-disc text-xs text-slate-500">
              {capacity.recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="Recent sagas">
          <ul className="space-y-1 text-sm">
            {sagas.map((s) => (
              <li key={s.id}>
                <Badge tone={s.status === 'completed' ? 'emerald' : s.status === 'compensated' ? 'amber' : s.status === 'failed' ? 'rose' : 'sky'}>{s.status}</Badge> {s.sagaName} · {s.completedSteps.join(' → ')}
                {s.failedStep && <span className="text-rose-600"> ✕ {s.failedStep}</span>}
                <span className="ml-2 text-xs text-slate-400">{date(s.startedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Unused indexes">
          {unused.length === 0 ? (
            <p className="text-sm text-slate-500">Every non-unique index has been used.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {unused.map((i) => (
                <li key={i.index}>
                  {i.table}.{i.index} <span className="text-slate-400">{(i.sizeBytes / 1024).toFixed(0)} KB</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Outgoing email">
          <ul className="space-y-1 text-sm">
            {outbox.map((m, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">
                  {m.to}: {m.subject}
                </span>
                <Badge tone={m.delivered ? 'emerald' : 'slate'}>{m.delivered ? 'sent' : 'logged'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
