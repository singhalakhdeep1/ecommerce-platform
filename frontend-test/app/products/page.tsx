'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Empty, Pager, ProductCard, Spinner } from '@/components/ui';
import { api, track } from '@/lib/api';
import type { Cart, Category, Pagination, Product } from '@/lib/types';

const SORTS = [
  { label: 'Newest', sortBy: 'createdAt', order: 'desc' },
  { label: 'Price: low to high', sortBy: 'price', order: 'asc' },
  { label: 'Price: high to low', sortBy: 'price', order: 'desc' },
  { label: 'Top rated', sortBy: 'rating', order: 'desc' },
  { label: 'Name', sortBy: 'name', order: 'asc' },
];

function Catalog() {
  const params = useSearchParams();
  const router = useRouter();
  const { setCart, notify } = useStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const category = params.get('category') ?? '';
  const search = params.get('search') ?? '';
  const sort = params.get('sort') ?? '0';
  const page = Number(params.get('page') ?? 1);
  const inStock = params.get('inStock') === 'true';
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    router.push(`/products?${next.toString()}`);
  };

  useEffect(() => {
    api<{ data: Category[] }>('/api/categories').then((r) => setCategories(r.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const s = SORTS[Number(sort)] ?? SORTS[0];
    const q = new URLSearchParams({ page: String(page), limit: '12', sortBy: s.sortBy, order: s.order });
    if (category) q.set('category', category);
    if (search) q.set('search', search);
    if (inStock) q.set('inStock', 'true');
    if (minPrice) q.set('minPrice', minPrice);
    if (maxPrice) q.set('maxPrice', maxPrice);
    setProducts(null);
    api<{ data: { products: Product[]; pagination: Pagination } }>(`/api/products?${q}`)
      .then((r) => {
        setProducts(r.data.products);
        setPagination(r.data.pagination);
      })
      .catch((e) => {
        notify(e.message, 'error');
        setProducts([]);
      });
    if (search) track('search', { q: search });
    if (category) track('category_view', { category });
  }, [category, search, sort, page, inStock, minPrice, maxPrice, notify]);

  const quickAdd = async (p: Product) => {
    if (p.variants.length) return router.push(`/products/${p.slug}`);
    try {
      const res = await api<{ data: Cart }>('/api/cart/items', { body: { productId: p.id, quantity: 1 } });
      setCart(res.data);
      notify(`${p.name} added to cart`);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
      <aside className="space-y-5">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Category</h3>
          <ul className="space-y-1 text-sm">
            <li>
              <button className={!category ? 'font-semibold text-indigo-600' : 'text-slate-600'} onClick={() => update({ category: '' })}>
                All products
              </button>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <button className={category === c.slug ? 'font-semibold text-indigo-600' : 'text-slate-700'} onClick={() => update({ category: c.slug })}>
                  {c.name} <span className="text-slate-400">({c.productCount})</span>
                </button>
                <ul className="ml-3 mt-1 space-y-1">
                  {c.children?.map((sub) => (
                    <li key={sub.id}>
                      <button className={category === sub.slug ? 'font-semibold text-indigo-600' : 'text-slate-500'} onClick={() => update({ category: sub.slug })}>
                        {sub.name} <span className="text-slate-400">({sub.productCount})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Price</h3>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              update({ minPrice: String(f.get('min') ?? ''), maxPrice: String(f.get('max') ?? '') });
            }}
          >
            <input name="min" className="input" placeholder="Min" defaultValue={minPrice} inputMode="decimal" />
            <input name="max" className="input" placeholder="Max" defaultValue={maxPrice} inputMode="decimal" />
            <button className="btn-secondary px-2">Go</button>
          </form>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={inStock} onChange={(e) => update({ inStock: e.target.checked ? 'true' : '' })} /> In stock only
        </label>
      </aside>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{search ? `Results for “${search}”` : 'All products'}</h1>
          <div className="flex items-center gap-3 text-sm">
            {pagination && <span className="text-slate-500">{pagination.total} items</span>}
            <select className="input w-auto" value={sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
              {SORTS.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {products === null ? (
          <Spinner />
        ) : products.length === 0 ? (
          <Empty>No products match these filters.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={quickAdd} />
            ))}
          </div>
        )}
        {pagination && <Pager page={pagination.page} pages={pagination.pages} onPage={(p) => update({ page: String(p) })} />}
      </section>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Catalog />
    </Suspense>
  );
}
