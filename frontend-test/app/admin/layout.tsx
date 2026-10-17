'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Empty, Spinner } from '@/components/ui';

const NAV = [
  ['/admin', 'Dashboard'],
  ['/admin/orders', 'Orders'],
  ['/admin/products', 'Products'],
  ['/admin/discounts', 'Discounts'],
  ['/admin/marketing', 'Marketing'],
  ['/admin/experiments', 'Experiments'],
  ['/admin/system', 'System'],
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, ready } = useStore();
  const pathname = usePathname();
  if (!ready) return <Spinner />;
  if (!user || user.role !== 'admin')
    return (
      <Empty>
        Admins only.{' '}
        <Link href="/login?next=/admin" className="text-indigo-600">
          Sign in as an admin
        </Link>
      </Empty>
    );
  return (
    <div className="grid gap-6 md:grid-cols-[11rem_1fr]">
      <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className={`rounded-lg px-3 py-2 text-sm ${pathname === href ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
