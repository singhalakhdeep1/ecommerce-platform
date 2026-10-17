'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Badge, Card } from '@/components/ui';
import { api } from '@/lib/api';

interface Experiment {
  key: string;
  name: string;
  description: string | null;
  variants: string[];
  active: boolean;
}
interface Stats {
  variants: Array<{ variant: string; assignments: number; converters: number; conversionRate: number }>;
  comparisons: Array<{ variant: string; pValue: number | null; lift: number | null; significant: boolean; message: string }>;
}

export default function AdminExperiments() {
  const { notify } = useStore();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [stats, setStats] = useState<Record<string, Stats>>({});

  const load = useCallback(async () => {
    const res = await api<{ data: Experiment[] }>('/api/experiments');
    setExperiments(res.data);
    const entries = await Promise.all(res.data.map(async (e) => [e.key, (await api<{ data: Stats }>(`/api/experiments/${e.key}/stats`)).data] as const));
    setStats(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    load().catch((e) => notify((e as Error).message, 'error'));
  }, [load, notify]);

  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await api('/api/experiments', { body: { key: f.get('key'), name: f.get('name'), description: f.get('description') || null, variants: String(f.get('variants')).split(',').map((v) => v.trim()).filter(Boolean) } });
      form.reset();
      await load();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const toggle = async (exp: Experiment) => {
    await api(`/api/experiments/${exp.key}`, { method: 'PATCH', body: { active: !exp.active } });
    await load();
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">A/B experiments</h1>
      <p className="text-sm text-slate-600">Subjects are bucketed deterministically; conversion = share of subjects with at least one conversion (purchases count automatically). Significance uses a two-proportion z-test against the first variant.</p>
      {experiments.map((exp) => (
        <Card key={exp.key} title={exp.name} actions={<button className="btn-secondary" onClick={() => void toggle(exp)}>{exp.active ? 'Pause' : 'Resume'}</button>}>
          <div className="mb-2 text-xs text-slate-500">
            <code>{exp.key}</code> {exp.active ? <Badge tone="emerald">running</Badge> : <Badge>paused</Badge>}
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Variant</th>
                <th>Subjects</th>
                <th>Converted</th>
                <th>Rate</th>
                <th>vs control</th>
              </tr>
            </thead>
            <tbody>
              {stats[exp.key]?.variants.map((v, i) => {
                const cmp = stats[exp.key].comparisons.find((c) => c.variant === v.variant);
                return (
                  <tr key={v.variant}>
                    <td>
                      {v.variant} {i === 0 && <span className="text-xs text-slate-400">(control)</span>}
                    </td>
                    <td>{v.assignments}</td>
                    <td>{v.converters}</td>
                    <td>{v.conversionRate}%</td>
                    <td className="text-xs">
                      {cmp ? (
                        <>
                          {cmp.lift !== null && `${cmp.lift > 0 ? '+' : ''}${cmp.lift}% · `}
                          {cmp.pValue !== null && `p=${cmp.pValue} · `}
                          <span className={cmp.significant ? 'font-semibold text-emerald-700' : 'text-slate-500'}>{cmp.message}</span>
                        </>
                      ) : (
                        '–'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}
      <Card title="New experiment">
        <form onSubmit={create} className="grid gap-2 md:grid-cols-2">
          <input name="key" className="input" placeholder="key (lowercase_with_underscores)" required pattern="[a-z0-9_-]{2,80}" />
          <input name="name" className="input" placeholder="Name" required />
          <input name="variants" className="input" placeholder="Variants, e.g. A, B" defaultValue="A, B" required />
          <input name="description" className="input" placeholder="Description" />
          <button className="btn-primary md:col-span-2">Create</button>
        </form>
      </Card>
    </>
  );
}
