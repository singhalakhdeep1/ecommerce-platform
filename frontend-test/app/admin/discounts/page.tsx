'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Badge, Card, Spinner } from '@/components/ui';
import { api, date, money } from '@/lib/api';

interface Discount {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  description: string | null;
  minimumPurchase: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  usageCount: number;
  userLimit: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export default function AdminDiscounts() {
  const { notify } = useStore();
  const [discounts, setDiscounts] = useState<Discount[] | null>(null);

  const load = useCallback(() => {
    api<{ data: { discounts: Discount[] } }>('/api/discounts?limit=100')
      .then((r) => setDiscounts(r.data.discounts))
      .catch((e) => notify(e.message, 'error'));
  }, [notify]);
  useEffect(load, [load]);

  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const n = (k: string) => (f.get(k) ? Number(f.get(k)) : undefined);
    try {
      await api('/api/discounts', {
        body: {
          code: f.get('code'),
          type: f.get('type'),
          value: n('value') ?? 0,
          description: f.get('description') || null,
          minimumPurchase: n('minimumPurchase') ?? 0,
          maxDiscount: n('maxDiscount') ?? null,
          usageLimit: n('usageLimit') ?? null,
          userLimit: n('userLimit') ?? 1,
          startDate: new Date(String(f.get('startDate'))).toISOString(),
          endDate: new Date(String(f.get('endDate'))).toISOString(),
        },
      });
      notify('Discount created');
      form.reset();
      load();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const toggle = async (d: Discount) => {
    await api(`/api/discounts/${d.id}`, { method: 'PUT', body: { isActive: !d.isActive } });
    load();
  };
  const remove = async (d: Discount) => {
    const res = await api<{ message: string }>(`/api/discounts/${d.id}`, { method: 'DELETE' });
    notify(res.message);
    load();
  };

  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <h1 className="text-2xl font-semibold">Discount codes</h1>
      <Card title="New code">
        <form onSubmit={create} className="grid gap-2 md:grid-cols-4">
          <input name="code" className="input" placeholder="CODE" required pattern="[A-Za-z0-9_-]{3,50}" />
          <select name="type" className="input">
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
            <option value="free_shipping">Free shipping</option>
          </select>
          <input name="value" className="input" placeholder="Value" inputMode="decimal" />
          <input name="maxDiscount" className="input" placeholder="Max discount" inputMode="decimal" />
          <input name="minimumPurchase" className="input" placeholder="Minimum purchase" inputMode="decimal" />
          <input name="usageLimit" className="input" placeholder="Total uses" inputMode="numeric" />
          <input name="userLimit" className="input" placeholder="Uses per customer (1)" inputMode="numeric" />
          <input name="description" className="input" placeholder="Description" />
          <input name="startDate" type="date" className="input" defaultValue={today} required />
          <input name="endDate" type="date" className="input" defaultValue={nextMonth} required />
          <button className="btn-primary md:col-span-2">Create</button>
        </form>
      </Card>
      {!discounts ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Rule</th>
                <th>Used</th>
                <th>Valid</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((d) => (
                <tr key={d.id}>
                  <td className="font-mono font-medium">
                    {d.code} {!d.isActive && <Badge tone="rose">inactive</Badge>}
                  </td>
                  <td>
                    {d.type === 'percentage' ? `${d.value}% off` : d.type === 'fixed' ? `${money(d.value)} off` : 'Free shipping'}
                    {d.minimumPurchase > 0 && ` · min ${money(d.minimumPurchase)}`}
                    {d.maxDiscount !== null && ` · max ${money(d.maxDiscount)}`}
                  </td>
                  <td>
                    {d.usageCount}
                    {d.usageLimit ? ` / ${d.usageLimit}` : ''} · {d.userLimit}/customer
                  </td>
                  <td className="text-xs text-slate-500">
                    {date(d.startDate)} → {date(d.endDate)}
                  </td>
                  <td className="whitespace-nowrap text-right text-sm">
                    <button className="text-indigo-600" onClick={() => void toggle(d)}>
                      {d.isActive ? 'Deactivate' : 'Activate'}
                    </button>{' '}
                    ·{' '}
                    <button className="text-rose-600" onClick={() => void remove(d)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
