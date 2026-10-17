'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Empty, Pager, Spinner, StatusBadge } from '@/components/ui';
import { api, date, money } from '@/lib/api';
import type { Order, Pagination } from '@/lib/types';

export default function OrdersPage() {
  const { user, ready } = useStore();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!user) return;
    api<{ data: Order[]; pagination: Pagination }>(`/api/orders?page=${page}&limit=10`)
      .then((r) => {
        setOrders(r.data);
        setPagination(r.pagination);
      })
      .catch(() => setOrders([]));
  }, [user, page]);

  if (ready && !user)
    return (
      <Empty>
        <Link href="/login?next=/orders" className="text-indigo-600">
          Sign in
        </Link>{' '}
        to see your orders.
      </Empty>
    );
  if (!orders) return <Spinner />;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">My orders</h1>
      {orders.length === 0 ? (
        <Empty>No orders yet.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Placed</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/orders/${o.id}`} className="font-medium text-indigo-600">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td>{date(o.createdAt)}</td>
                  <td>{o.items?.reduce((n, i) => n + i.quantity, 0)}</td>
                  <td className="tabular-nums">{money(o.totalAmount)}</td>
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
      {pagination && <Pager page={pagination.page} pages={pagination.pages} onPage={setPage} />}
    </div>
  );
}
