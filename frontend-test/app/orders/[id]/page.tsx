'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Card, Spinner, StatusBadge } from '@/components/ui';
import { api, date, money } from '@/lib/api';
import type { Order } from '@/lib/types';

interface Tracking {
  status: string;
  trackingNumber: string | null;
  carrier: string | null;
  service: string | null;
  progress: number | null;
  estimatedDelivery: { earliest: string; latest: string } | null;
  timeline: Array<{ at: string; from: string | null; to: string; note: string | null }>;
  carrierEvents: { status: string | null; history: Array<{ status: string; details: string; at: string; location: string | null }> } | null;
}

const STEPS = ['pending', 'processing', 'shipped', 'delivered'];

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { notify } = useStore();
  const [order, setOrder] = useState<Order | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, t] = await Promise.all([api<{ data: Order }>(`/api/orders/${id}`), api<{ data: Tracking }>(`/api/orders/${id}/track`)]);
      setOrder(o.data);
      setTracking(t.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="py-16 text-center text-rose-600">{error}</p>;
  if (!order || !tracking) return <Spinner />;

  const cancel = async () => {
    if (!confirm(order.paymentStatus === 'paid' ? 'Cancel this order? You will be refunded in full.' : 'Cancel this order?')) return;
    try {
      await api(`/api/orders/${order.id}/cancel`, { body: {} });
      notify('Order cancelled');
      await load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  const stepIndex = STEPS.indexOf(order.status);

  return (
    <div className="space-y-6">
      {params.get('placed') && <div className="rounded-xl bg-emerald-50 p-4 text-emerald-800">Thank you! Your order {order.orderNumber} has been placed.</div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Order {order.orderNumber}</h1>
        <div className="flex gap-2">
          <StatusBadge status={order.status} /> <StatusBadge status={order.paymentStatus} />
        </div>
      </div>

      {order.status !== 'cancelled' && (
        <Card title="Tracking">
          <ol className="mb-4 grid grid-cols-4 gap-2 text-center text-xs">
            {STEPS.map((s, i) => (
              <li key={s} className={`rounded-lg py-2 ${i <= stepIndex ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {s}
              </li>
            ))}
          </ol>
          <div className="text-sm text-slate-600">
            {tracking.trackingNumber && (
              <p>
                {tracking.carrier?.toUpperCase()} tracking number <code>{tracking.trackingNumber}</code>
              </p>
            )}
            {tracking.estimatedDelivery && (
              <p>
                Estimated delivery: {new Date(tracking.estimatedDelivery.earliest).toDateString()} – {new Date(tracking.estimatedDelivery.latest).toDateString()}
              </p>
            )}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card title="Items">
          <table className="table">
            <tbody>
              {order.items?.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.productSnapshot.name} {i.variantName && <span className="text-slate-500">({i.variantName})</span>}
                    <div className="text-xs text-slate-400">{i.productSnapshot.sku}</div>
                  </td>
                  <td className="text-right">{i.quantity} ×</td>
                  <td className="text-right tabular-nums">{money(i.price)}</td>
                  <td className="text-right tabular-nums">{money(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
            <Row label="Subtotal" value={money(order.subtotal)} />
            {order.discount > 0 && <Row label={`Discount ${order.discountCode ?? ''}`} value={`−${money(order.discount)}`} />}
            <Row label={`Shipping (${order.shippingProvider?.toUpperCase()} ${order.shippingService})`} value={order.shippingCost ? money(order.shippingCost) : 'Free'} />
            <Row label="Tax" value={money(order.tax)} />
            <Row label="Total" value={money(order.totalAmount)} bold />
            {order.refundedAmount > 0 && <Row label="Refunded" value={money(order.refundedAmount)} />}
          </dl>
        </Card>
        <div className="space-y-4">
          <Card title="Ship to">
            <address className="text-sm not-italic text-slate-600">
              {order.shippingAddress.name}
              <br />
              {order.shippingAddress.address}
              <br />
              {order.shippingAddress.city} {order.shippingAddress.state} {order.shippingAddress.zip}
              <br />
              {order.shippingAddress.country}
            </address>
          </Card>
          {['pending', 'processing'].includes(order.status) && (
            <button className="btn-danger w-full" onClick={() => void cancel()}>
              Cancel order
            </button>
          )}
          {order.paymentStatus !== 'paid' && order.paymentStatus !== 'refunded' && order.status === 'pending' && <PayNow order={order} onPaid={load} />}
        </div>
      </div>

      <Card title="History">
        <ul className="space-y-2 text-sm">
          {tracking.timeline.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-44 shrink-0 text-slate-500">{date(e.at)}</span>
              <span>
                <StatusBadge status={e.to} /> {e.note}
              </span>
            </li>
          ))}
        </ul>
        {tracking.carrierEvents && tracking.carrierEvents.history.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <h3 className="mb-2 text-sm font-semibold">Carrier updates</h3>
            <ul className="space-y-1 text-sm">
              {tracking.carrierEvents.history.map((h, i) => (
                <li key={i}>
                  {date(h.at)} · {h.details} {h.location && `(${h.location})`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Link href="/orders" className="text-sm text-indigo-600">
        ← All orders
      </Link>
    </div>
  );
}

/** Retry payment for an unpaid sandbox card order (e.g. after a decline). */
function PayNow({ order, onPaid }: { order: Order; onPaid: () => Promise<void> }) {
  const { notify } = useStore();
  if (order.paymentProvider !== 'sandbox') return null;
  const pay = async () => {
    try {
      await api('/api/payments/confirm', { body: { orderId: order.id, paymentMethod: 'pm_card_visa' } });
      notify('Payment successful');
      await onPaid();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  return (
    <button className="btn-primary w-full" onClick={() => void pay()}>
      Pay now with test Visa
    </button>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'border-t border-slate-200 pt-1 font-semibold' : ''}`}>
      <dt className="text-slate-600">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <OrderDetail />
    </Suspense>
  );
}
