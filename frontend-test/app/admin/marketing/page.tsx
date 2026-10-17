'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Badge, Card, Stat, StatusBadge } from '@/components/ui';
import { api, date } from '@/lib/api';

interface Segment {
  id: string;
  name: string;
  description: string | null;
  criteria: Record<string, number>;
  customerCount: number;
}
interface Analytics {
  totalCampaigns: number;
  emailsSent: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
  campaigns: Array<{ id: string; name: string; status: string; sentAt: string | null; sent: number; openRate: number; clickRate: number }>;
}

export default function AdminMarketing() {
  const { notify } = useStore();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  const load = useCallback(() => {
    api<{ data: Segment[] }>('/api/marketing/segments').then((r) => setSegments(r.data)).catch((e) => notify(e.message, 'error'));
    api<{ data: Analytics }>('/api/marketing/analytics').then((r) => setAnalytics(r.data)).catch(() => undefined);
  }, [notify]);
  useEffect(load, [load]);

  const createSegment = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const criteria: Record<string, number> = {};
    for (const k of ['minOrders', 'minTotalSpent', 'inactiveDays', 'registeredWithinDays']) if (f.get(k)) criteria[k] = Number(f.get(k));
    try {
      await api('/api/marketing/segments', { body: { name: f.get('name'), description: f.get('description') || null, criteria } });
      notify('Segment created');
      form.reset();
      load();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const createCampaign = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await api('/api/marketing/campaigns', {
        body: { name: f.get('name'), subject: f.get('subject'), content: f.get('content'), type: f.get('type'), segmentId: f.get('segmentId') || null, scheduledAt: f.get('scheduledAt') ? new Date(String(f.get('scheduledAt'))).toISOString() : null },
      });
      notify('Campaign saved');
      form.reset();
      load();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const send = async (id: string) => {
    try {
      const res = await api<{ data: { sentCount: number } }>(`/api/marketing/campaigns/${id}/send`, { method: 'POST' });
      notify(`Sent to ${res.data.sentCount} customers`);
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  const abandoned = async () => {
    const res = await api<{ data: { reminded: number; checked: number } }>('/api/marketing/abandoned-cart', { body: { idleMinutes: 60 } });
    notify(`Reminders sent: ${res.data.reminded} (of ${res.data.checked} idle carts)`);
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Marketing</h1>
        <button className="btn-secondary" onClick={() => void abandoned()}>
          Send abandoned-cart reminders
        </button>
      </div>
      {analytics && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Campaigns" value={analytics.totalCampaigns} />
          <Stat label="Emails sent" value={analytics.emailsSent} />
          <Stat label="Open rate" value={`${analytics.openRate}%`} hint="measured by tracking pixel" />
          <Stat label="Click rate" value={`${analytics.clickRate}%`} hint={`${analytics.clickToOpenRate}% of opens`} />
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Segments">
          <ul className="mb-4 space-y-2 text-sm">
            {segments.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{s.name}</span> <span className="text-slate-500">{Object.entries(s.criteria).map(([k, v]) => `${k}=${v}`).join(', ') || 'all customers'}</span>
                </span>
                <Badge tone="sky">{s.customerCount} customers</Badge>
              </li>
            ))}
          </ul>
          <form onSubmit={createSegment} className="grid gap-2 md:grid-cols-2">
            <input name="name" className="input md:col-span-2" placeholder="Segment name" required />
            <input name="minOrders" className="input" placeholder="Min paid orders" inputMode="numeric" />
            <input name="minTotalSpent" className="input" placeholder="Min total spent" inputMode="decimal" />
            <input name="inactiveDays" className="input" placeholder="No order for N days" inputMode="numeric" />
            <input name="registeredWithinDays" className="input" placeholder="Joined in last N days" inputMode="numeric" />
            <input name="description" className="input md:col-span-2" placeholder="Description" />
            <button className="btn-primary md:col-span-2">Create segment</button>
          </form>
        </Card>
        <Card title="New campaign">
          <form onSubmit={createCampaign} className="grid gap-2">
            <input name="name" className="input" placeholder="Internal name" required />
            <input name="subject" className="input" placeholder="Email subject" />
            <textarea name="content" className="input" rows={4} placeholder="Body. {{name}} is replaced with the customer's name." required />
            <div className="grid grid-cols-3 gap-2">
              <select name="type" className="input">
                <option value="email">Email</option>
                <option value="sms">SMS (no provider)</option>
              </select>
              <select name="segmentId" className="input">
                <option value="">All customers</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input name="scheduledAt" type="datetime-local" className="input" aria-label="Schedule" />
            </div>
            <button className="btn-primary">Save campaign</button>
          </form>
        </Card>
      </div>
      <Card title="Campaigns">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Open</th>
              <th>Click</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {analytics?.campaigns.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  <StatusBadge status={c.status} /> {c.sentAt && <span className="text-xs text-slate-500">{date(c.sentAt)}</span>}
                </td>
                <td>{c.sent}</td>
                <td>{c.openRate}%</td>
                <td>{c.clickRate}%</td>
                <td className="text-right">
                  {['draft', 'scheduled', 'paused'].includes(c.status) && (
                    <button className="text-indigo-600" onClick={() => void send(c.id)}>
                      Send now
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
