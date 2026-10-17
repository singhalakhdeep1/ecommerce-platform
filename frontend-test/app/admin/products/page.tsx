'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Badge, Card, Pager, Spinner } from '@/components/ui';
import { api, money } from '@/lib/api';
import type { Category, Pagination, Product } from '@/lib/types';

type Editing = Partial<Product> & { id?: string };

export default function AdminProducts() {
  const { notify } = useStore();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<Array<Category & { parentName?: string }>>([]);
  const [editing, setEditing] = useState<Editing | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), limit: '15', includeUnpublished: 'true', sortBy: 'name', order: 'asc' });
    if (search) q.set('search', search);
    api<{ data: { products: Product[]; pagination: Pagination } }>(`/api/products?${q}`)
      .then((r) => {
        setProducts(r.data.products);
        setPagination(r.data.pagination);
      })
      .catch((e) => notify(e.message, 'error'));
  }, [page, search, notify]);

  useEffect(load, [load]);
  useEffect(() => {
    api<{ data: Array<Category & { parentName?: string }> }>('/api/categories?flat=true').then((r) => setCategories(r.data)).catch(() => undefined);
  }, []);

  const adjust = async (p: Product) => {
    const value = prompt(`Adjust stock for ${p.name} (current ${p.stock}). Use +10 / -3, or a plain number to set it.`);
    if (!value) return;
    const body = /^[+-]/.test(value.trim()) ? { adjustment: Number(value) } : { stock: Number(value) };
    try {
      await api(`/api/products/${p.id}/inventory`, { method: 'PATCH', body });
      notify('Stock updated');
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  const remove = async (p: Product) => {
    if (!confirm(`Delete ${p.name}? Order history keeps its snapshot.`)) return;
    await api(`/api/products/${p.id}`, { method: 'DELETE' });
    notify('Product deleted');
    load();
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Products</h1>
        <div className="flex gap-2">
          <input className="input w-56" placeholder="Search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <button className="btn-primary" onClick={() => setEditing({ published: true, stock: 0, variants: [], tags: [] })}>
            New product
          </button>
        </div>
      </div>
      {!products ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="text-right">Price</th>
                <th className="text-right">Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name} {!p.published && <Badge tone="amber">hidden</Badge>} {p.featured && <Badge tone="violet">featured</Badge>}
                    <div className="text-xs text-slate-400">{p.category?.name}</div>
                  </td>
                  <td className="text-slate-500">{p.sku}</td>
                  <td className="text-right">{money(p.price)}</td>
                  <td className={`text-right ${p.stock <= p.lowStockThreshold ? 'text-amber-700' : ''}`}>{p.stock}</td>
                  <td className="whitespace-nowrap text-right text-sm">
                    <button className="text-indigo-600" onClick={() => setEditing(p)}>
                      Edit
                    </button>{' '}
                    ·{' '}
                    <button className="text-indigo-600" onClick={() => void adjust(p)}>
                      Stock
                    </button>{' '}
                    ·{' '}
                    <button className="text-rose-600" onClick={() => void remove(p)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pagination && <Pager page={pagination.page} pages={pagination.pages} onPage={setPage} />}
      {editing && <ProductForm product={editing} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function ProductForm({ product, categories, onClose, onSaved }: { product: Editing; categories: Array<Category & { parentName?: string }>; onClose: () => void; onSaved: () => void }) {
  const { notify } = useStore();
  const [variants, setVariants] = useState(JSON.stringify(product.variants ?? [], null, 0));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let parsedVariants: unknown = [];
    try {
      parsedVariants = JSON.parse(variants || '[]');
    } catch {
      return notify('Variants must be valid JSON, e.g. [{"name":"Large","price":20,"quantity":5}]', 'error');
    }
    const num = (k: string) => (f.get(k) === '' || f.get(k) === null ? null : Number(f.get(k)));
    const body = {
      name: f.get('name'),
      description: f.get('description'),
      sku: f.get('sku'),
      price: num('price'),
      comparePrice: num('comparePrice'),
      stock: num('stock') ?? 0,
      lowStockThreshold: num('lowStockThreshold') ?? 10,
      weight: num('weight'),
      categoryId: f.get('categoryId') || null,
      tags: String(f.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
      images: String(f.get('images') ?? '').split(/\s+/).filter(Boolean),
      featured: f.get('featured') === 'on',
      published: f.get('published') === 'on',
      variants: parsedVariants,
    };
    try {
      if (product.id) await api(`/api/products/${product.id}`, { method: 'PUT', body });
      else await api('/api/products', { body });
      notify('Product saved');
      onSaved();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6" onClick={onClose}>
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Card title={product.id ? `Edit ${product.name}` : 'New product'} actions={<button onClick={onClose} aria-label="Close">✕</button>}>
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
            <input name="name" className="input md:col-span-2" placeholder="Name" defaultValue={product.name} required minLength={2} />
            <textarea name="description" className="input md:col-span-2" rows={3} placeholder="Description" defaultValue={product.description} required />
            <input name="sku" className="input" placeholder="SKU" defaultValue={product.sku} required />
            <select name="categoryId" className="input" defaultValue={product.categoryId ?? ''}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentName ? `${c.parentName} › ` : ''}
                  {c.name}
                </option>
              ))}
            </select>
            <input name="price" className="input" placeholder="Price" defaultValue={product.price} required inputMode="decimal" />
            <input name="comparePrice" className="input" placeholder="Compare-at price" defaultValue={product.comparePrice ?? ''} inputMode="decimal" />
            <input name="stock" className="input" placeholder="Stock" defaultValue={product.stock} inputMode="numeric" />
            <input name="lowStockThreshold" className="input" placeholder="Low-stock threshold" defaultValue={product.lowStockThreshold ?? 10} inputMode="numeric" />
            <input name="weight" className="input" placeholder="Weight (kg)" defaultValue={product.weight ?? ''} inputMode="decimal" />
            <input name="tags" className="input" placeholder="Tags, comma separated" defaultValue={product.tags?.join(', ')} />
            <input name="images" className="input md:col-span-2" placeholder="Image URLs (space separated)" defaultValue={product.images?.join(' ')} />
            <label className="label md:col-span-2">Variants (JSON)</label>
            <textarea className="input font-mono text-xs md:col-span-2" rows={2} value={variants} onChange={(e) => setVariants(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="published" defaultChecked={product.published ?? true} /> Published
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="featured" defaultChecked={product.featured} /> Featured
            </label>
            <button className="btn-primary md:col-span-2">Save</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
