'use client';

import { useEffect, useState } from 'react';
import { Bars, Card, Spinner, Stat } from '@/components/ui';
import { api, money } from '@/lib/api';

interface Sales {
  totalOrders: number;
  grossRevenue: number;
  netRevenue: number;
  refunded: number;
  averageOrderValue: number;
  ordersByStatus: Record<string, number>;
  salesTrend: Array<{ date: string; orders: number; revenue: number }>;
}
interface Funnel {
  counts: Record<string, number>;
  conversionRates: Record<string, number>;
}
interface Products {
  topSelling: Array<{ productId: string; name: string; unitsSold: number; revenue: number; views: number }>;
}
interface Customers {
  totalCustomers: number;
  newCustomers: number;
  repeatRate: number;
  averageLifetimeValue: number;
  topCustomers: Array<{ userId: string; name: string; email: string; orders: number; spent: number }>;
}
interface Inventory {
  summary: { totalProducts: number; lowStockCount: number; outOfStockCount: number; totalInventoryValue: number; sellThroughRate: number };
  lowStockProducts: Array<{ id: string; name: string; sku: string; stock: number; threshold: number }>;
}
interface Cohort {
  cohort: string;
  size: number;
  retention: Record<string, { buyers: number; rate: number }>;
}

export default function AdminDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ sales: Sales; funnel: Funnel; products: Products; customers: Customers; inventory: Inventory; cohorts: Cohort[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const q = `startDate=${start}`;
    setData(null);
    Promise.all([
      api<{ data: Sales }>(`/api/analytics/sales?${q}`),
      api<{ data: Funnel }>(`/api/analytics/funnel?${q}`),
      api<{ data: Products }>(`/api/analytics/products?${q}`),
      api<{ data: Customers }>(`/api/analytics/customers?${q}`),
      api<{ data: Inventory }>(`/api/analytics/inventory?${q}`),
      api<{ data: Cohort[] }>('/api/analytics/cohort?months=6'),
    ])
      .then(([sales, funnel, products, customers, inventory, cohorts]) => setData({ sales: sales.data, funnel: funnel.data, products: products.data, customers: customers.data, inventory: inventory.data, cohorts: cohorts.data }))
      .catch((e) => setError((e as Error).message));
  }, [days]);

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!data) return <Spinner />;
  const { sales, funnel, products, customers, inventory, cohorts } = data;
  const maxMonth = Math.max(0, ...cohorts.flatMap((c) => Object.keys(c.retention).map((k) => Number(k.replace('month', '')))));

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Net revenue" value={money(sales.netRevenue)} hint={`${money(sales.refunded)} refunded`} />
        <Stat label="Paid orders" value={sales.totalOrders} hint={`AOV ${money(sales.averageOrderValue)}`} />
        <Stat label="Customers" value={customers.totalCustomers} hint={`${customers.newCustomers} new · ${customers.repeatRate}% repeat`} />
        <Stat label="Inventory value" value={money(inventory.summary.totalInventoryValue)} hint={`${inventory.summary.lowStockCount} low · ${inventory.summary.outOfStockCount} out`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Revenue by day">
          {sales.salesTrend.length ? <Bars rows={sales.salesTrend.map((t) => ({ label: t.date, value: t.revenue }))} format={money} /> : <p className="text-sm text-slate-500">No paid orders in this period.</p>}
        </Card>
        <Card title="Conversion funnel">
          <Bars rows={Object.entries(funnel.counts).map(([label, value]) => ({ label: label.replace(/_/g, ' '), value }))} />
          <p className="mt-3 text-sm text-slate-600">
            View → cart {funnel.conversionRates.viewToCart}% · cart → checkout {funnel.conversionRates.cartToCheckout}% · checkout → purchase {funnel.conversionRates.checkoutToPurchase}%
          </p>
        </Card>
        <Card title="Top products">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="text-right">Units</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Views</th>
              </tr>
            </thead>
            <tbody>
              {products.topSelling.map((p) => (
                <tr key={p.productId}>
                  <td>{p.name}</td>
                  <td className="text-right">{p.unitsSold}</td>
                  <td className="text-right">{money(p.revenue)}</td>
                  <td className="text-right">{p.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Top customers">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Spent</th>
              </tr>
            </thead>
            <tbody>
              {customers.topCustomers.map((c) => (
                <tr key={c.userId}>
                  <td>
                    {c.name}
                    <div className="text-xs text-slate-500">{c.email}</div>
                  </td>
                  <td className="text-right">{c.orders}</td>
                  <td className="text-right">{money(c.spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Average lifetime value {money(customers.averageLifetimeValue)}</p>
        </Card>
        <Card title="Low stock">
          {inventory.lowStockProducts.length === 0 ? (
            <p className="text-sm text-slate-500">Everything is well stocked.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {inventory.lowStockProducts.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>
                    {p.name} <span className="text-slate-400">{p.sku}</span>
                  </span>
                  <span className="text-amber-700">
                    {p.stock} / {p.threshold}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Purchase retention by signup month">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Cohort</th>
                  <th>Size</th>
                  {Array.from({ length: maxMonth + 1 }, (_, i) => (
                    <th key={i}>M{i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.cohort}>
                    <td>{c.cohort}</td>
                    <td>{c.size}</td>
                    {Array.from({ length: maxMonth + 1 }, (_, i) => (
                      <td key={i}>{c.retention[`month${i}`] ? `${c.retention[`month${i}`].rate}%` : '–'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
