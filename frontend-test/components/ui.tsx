'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { money } from '@/lib/api';
import type { Product } from '@/lib/types';

export function Stars({ rating, size = 'text-sm' }: { rating: number; size?: string }) {
  const full = Math.round(rating);
  return (
    <span className={`${size} text-amber-500`} aria-label={`${rating.toFixed(1)} out of 5`}>
      {'★'.repeat(full)}
      <span className="text-slate-300">{'★'.repeat(5 - full)}</span>
    </span>
  );
}

export function Price({ price, compare }: { price: number; compare?: number | null }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-semibold text-slate-900">{money(price)}</span>
      {compare && compare > price ? <span className="text-sm text-slate-400 line-through">{money(compare)}</span> : null}
    </span>
  );
}

/** Product images are optional; without one we draw a coloured tile with the initials. */
export function ProductImage({ product, className = 'h-48' }: { product: Pick<Product, 'name' | 'images'>; className?: string }) {
  const src = product.images?.[0];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={product.name} className={`${className} w-full rounded-lg object-cover`} />;
  }
  const hue = [...product.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = product.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <div className={`${className} flex w-full items-center justify-center rounded-lg text-3xl font-bold text-white`} style={{ background: `linear-gradient(135deg, hsl(${hue} 60% 55%), hsl(${(hue + 40) % 360} 60% 40%))` }}>
      {initials}
    </div>
  );
}

export function ProductCard({ product, onAdd }: { product: Product; onAdd?: (p: Product) => void }) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow-md">
      <Link href={`/products/${product.slug}`} className="block">
        <ProductImage product={product} />
        <h3 className="mt-3 line-clamp-2 font-medium text-slate-800">{product.name}</h3>
      </Link>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        <Stars rating={product.rating} size="text-xs" /> ({product.numReviews})
      </div>
      <div className="mt-2 flex items-center justify-between">
        <Price price={product.price} compare={product.comparePrice} />
        {product.stock === 0 ? <Badge tone="rose">Out of stock</Badge> : product.stock <= product.lowStockThreshold ? <Badge tone="amber">{product.stock} left</Badge> : null}
      </div>
      {onAdd && (
        <button className="btn-primary mt-3" disabled={product.stock === 0} onClick={() => onAdd(product)}>
          {product.variants.length ? 'Choose options' : 'Add to cart'}
        </button>
      )}
    </div>
  );
}

const TONES = {
  slate: 'bg-slate-100 text-slate-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-700',
  sky: 'bg-sky-100 text-sky-700',
  violet: 'bg-violet-100 text-violet-700',
};

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, keyof typeof TONES> = {
    pending: 'amber',
    processing: 'sky',
    shipped: 'violet',
    delivered: 'emerald',
    cancelled: 'rose',
    paid: 'emerald',
    failed: 'rose',
    refunded: 'slate',
  };
  return <Badge tone={tone[status] ?? 'slate'}>{status}</Badge>;
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      <button className="btn-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="text-sm text-slate-600">
        Page {page} of {pages}
      </span>
      <button className="btn-secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold text-slate-800">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">{children}</div>;
}

export function Spinner() {
  return <div className="py-10 text-center text-slate-400">Loading…</div>;
}

/** Simple horizontal bar chart (no chart library needed). */
export function Bars({ rows, format = (n: number) => String(n) }: { rows: Array<{ label: string; value: number }>; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[8rem_1fr_6rem] items-center gap-2 text-sm">
          <span className="truncate text-slate-600" title={r.label}>
            {r.label}
          </span>
          <div className="h-3 rounded bg-slate-100">
            <div className="h-3 rounded bg-indigo-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums text-slate-700">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
