'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Badge, Card, Pager, Spinner, StatusBadge } from '@/components/ui';
import { api, date, money } from '@/lib/api';
import type { Order, Pagination } from '@/lib/types';

const NEXT: Record<string, string[]> = { pending: ['processing', 'cancelled'], processing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };

export default function AdminOrders() {
  const { notify } = useStore();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filters, setFilters] = useState({ status: '', paymentStatus: '', flagged: '', q: '', page: 1 });
  const [selected, setSelected] = useState<Order | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ all: 'true', page: String(filters.page), limit: '15' });
    if (filters.status) q.set('status', filters.status);
    if (filters.paymentStatus) q.set('paymentStatus', filters.paymentStatus);
    if (filters.flagged) q.set('flagged', filters.flagged);
    if (filters.q) q.set('q', filters.q);
    api<{ data: Order[]; pagination: Pagination }>(`/api/orders?${q}`)
      .then((r) => {
        setOrders(r.data);
        setPagination(r.pagination);
      })
      .catch((e) => notify(e.message, 'error'));
  }, [filters, notify]);

  useEffect(load, [load]);

  const open = async (id: string) => setSelected((await api<{ data: Order }>(`/api/orders/${id}`)).data);

  return (
    <>
      <h1 className="text-2xl font-semibold">Orders</h1>
      <div className="flex flex-wrap gap-2">
        <input className="input w-56" placeholder="Order number or email" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })} />
        <select className="input w-auto" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })} aria-label="Status">
          <option value="">All statuses</option>
          {Object.keys(NEXT).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="input w-auto" value={filters.paymentStatus} onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value, page: 1 })} aria-label="Payment">
          <option value="">All payments</option>
          {['pending', 'paid', 'failed', 'refunded'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="input w-auto" value={filters.flagged} onChange={(e) => setFilters({ ...filters, flagged: e.target.value, page: 1 })} aria-label="Fraud">
          <option value="">Any risk</option>
          <option value="true">Flagged for review</option>
        </select>
      </div>
      {!orders ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Placed</th>
                <th className="text-right">Total</th>
                <th>Status</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => void open(o.id)}>
                  <td className="font-medium text-indigo-600">
                    {o.orderNumber} {o.fraudFlag && <Badge tone="rose">risk {o.fraudScore}</Badge>} {o.orderType !== 'standard' && <Badge>{o.orderType}</Badge>}
                  </td>
                  <td>{o.user?.email}</td>
                  <td>{date(o.createdAt)}</td>
                  <td className="text-right tabular-nums">{money(o.totalAmount)}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td>
                    <StatusBadge status={o.paymentStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pagination && <Pager page={pagination.page} pages={pagination.pages} onPage={(p) => setFilters({ ...filters, page: p })} />}
      {selected && <OrderPanel order={selected} onClose={() => setSelected(null)} onChange={async () => { await open(selected.id); load(); }} />}
    </>
  );
}

function OrderPanel({ order, onClose, onChange }: { order: Order; onClose: () => void; onChange: () => Promise<void> }) {
  const { notify } = useStore();
  const [busy, setBusy] = useState(false);

  const setStatus = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(`/api/orders/${order.id}/status`, {
        method: 'PATCH',
        body: { status: f.get('status'), trackingNumber: f.get('tracking') || undefined, shippingProvider: f.get('carrier') || undefined, note: f.get('note') || undefined },
      });
      notify('Order updated');
      await onChange();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const refund = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const amount = f.get('amount') ? Number(f.get('amount')) : undefined;
    if (!confirm(`Refund ${amount ? money(amount) : 'the remaining balance'}?`)) return;
    setBusy(true);
    try {
      await api(`/api/payments/refund/${order.id}`, { idempotencyKey: `refund-${crypto.randomUUID()}`, body: { amount, reason: f.get('reason') || undefined, restock: f.get('restock') === 'on' } });
      notify('Refund processed');
      await onChange();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const next = NEXT[order.status] ?? [];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-slate-50 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{order.orderNumber}</h2>
          <button onClick={onClose} className="text-slate-500" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap gap-2 text-sm">
              <StatusBadge status={order.status} /> <StatusBadge status={order.paymentStatus} /> <Badge>{order.paymentProvider}</Badge> {order.fraudFlag && <Badge tone="rose">fraud score {order.fraudScore}</Badge>}
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {order.user?.name} &lt;{order.user?.email}&gt; · {order.shippingAddress.city}, {order.shippingAddress.country}
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              {order.items?.map((i) => (
                <li key={i.id} className="flex justify-between">
                  <span>
                    {i.quantity} × {i.productSnapshot.name} {i.variantName && `(${i.variantName})`}
                  </span>
                  <span>{money(i.total)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-right text-sm font-semibold">
              Total {money(order.totalAmount)} {order.refundedAmount > 0 && <span className="text-slate-500">(refunded {money(order.refundedAmount)})</span>}
            </p>
          </Card>
          {next.length > 0 && (
            <Card title="Update status">
              <form onSubmit={setStatus} className="grid gap-2 md:grid-cols-2">
                <select name="status" className="input">
                  {next.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select name="carrier" className="input" defaultValue={order.shippingProvider ?? 'usps'}>
                  {['usps', 'ups', 'fedex', 'dhl'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <input name="tracking" className="input" placeholder="Tracking number (generated if empty)" />
                <input name="note" className="input" placeholder="Note" />
                <button className="btn-primary md:col-span-2" disabled={busy}>
                  Apply
                </button>
              </form>
            </Card>
          )}
          {order.paymentStatus === 'paid' && (
            <Card title="Refund">
              <form onSubmit={refund} className="grid gap-2 md:grid-cols-2">
                <input name="amount" className="input" placeholder={`Amount (max ${(order.totalAmount - order.refundedAmount).toFixed(2)})`} inputMode="decimal" />
                <input name="reason" className="input" placeholder="Reason" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="restock" defaultChecked /> Put items back in stock
                </label>
                <button className="btn-danger" disabled={busy}>
                  Refund
                </button>
              </form>
            </Card>
          )}
          <Card title="Timeline">
            <ul className="space-y-1 text-sm">
              {order.events?.map((e) => (
                <li key={e.id}>
                  <span className="text-slate-500">{date(e.createdAt)}</span> · {e.fromStatus ?? '–'} → {e.toStatus} {e.note && <span className="text-slate-600">({e.note})</span>}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Payments">
            <ul className="space-y-1 text-sm">
              {order.transactions?.map((t) => (
                <li key={t.id} className="flex justify-between">
                  <span>
                    {t.type} via {t.provider} · {t.status}
                  </span>
                  <span>
                    {money(t.amount)} {t.platformFee > 0 && <span className="text-slate-400">(fee {money(t.platformFee)})</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </aside>
    </div>
  );
}
