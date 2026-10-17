'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProductCard, Spinner } from '@/components/ui';
import { api, track } from '@/lib/api';
import type { Category, Product } from '@/lib/types';

export default function HomePage() {
  const router = useRouter();
  const [featured, setFeatured] = useState<Product[] | null>(null);
  const [latest, setLatest] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    track('page_view', { page: 'home' });
    api<{ data: { products: Product[] } }>('/api/products?featured=true&limit=8&sortBy=rating').then((r) => setFeatured(r.data.products)).catch(() => setFeatured([]));
    api<{ data: { products: Product[] } }>('/api/products?limit=4').then((r) => setLatest(r.data.products)).catch(() => undefined);
    api<{ data: Category[] }>('/api/categories').then((r) => setCategories(r.data)).catch(() => undefined);
  }, []);

  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-12 text-white">
        <h1 className="text-3xl font-bold md:text-4xl">Everything you need, delivered.</h1>
        <p className="mt-2 max-w-xl text-indigo-100">Electronics, home, fashion and books. Members get free shipping on every order.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/products" className="rounded-lg bg-white px-5 py-2 font-medium text-indigo-700 hover:bg-indigo-50">
            Shop now
          </Link>
          <Link href="/membership" className="rounded-lg border border-white/50 px-5 py-2 font-medium hover:bg-white/10">
            Become a member
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Shop by department</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {categories.map((c) => (
            <Link key={c.id} href={`/products?category=${c.slug}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300">
              <div className="font-semibold text-slate-800">{c.name}</div>
              <div className="mt-1 text-sm text-slate-500">{c.productCount} products</div>
              <div className="mt-2 text-xs text-slate-400">{c.children?.map((x) => x.name).join(' · ')}</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Featured</h2>
        {featured === null ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={() => router.push(`/products/${p.slug}`)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">New arrivals</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {latest.map((p) => (
            <ProductCard key={p.id} product={p} onAdd={() => router.push(`/products/${p.slug}`)} />
          ))}
        </div>
      </section>
    </div>
  );
}
