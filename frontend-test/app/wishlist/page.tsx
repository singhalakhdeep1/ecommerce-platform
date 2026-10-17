'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Badge, Empty, Price, ProductImage, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { Cart, Product } from '@/lib/types';

interface WishlistItem {
  id: string;
  priority: 'low' | 'medium' | 'high';
  notes: string | null;
  product: Product;
}

export default function WishlistPage() {
  const { user, ready, setCart, notify } = useStore();
  const [items, setItems] = useState<WishlistItem[] | null>(null);

  const load = useCallback(() => {
    api<{ data: WishlistItem[] }>('/api/wishlist')
      .then((r) => setItems(r.data))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (ready && !user)
    return (
      <Empty>
        <Link href="/login?next=/wishlist" className="text-indigo-600">
          Sign in
        </Link>{' '}
        to see your wishlist.
      </Empty>
    );
  if (!items) return <Spinner />;

  const move = async (id: string) => {
    try {
      const res = await api<{ data: Cart }>(`/api/wishlist/${id}/move-to-cart`, { body: {} });
      setCart(res.data);
      notify('Moved to cart');
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };
  const remove = async (id: string) => {
    await api(`/api/wishlist/${id}`, { method: 'DELETE' });
    load();
  };
  const setPriority = async (id: string, priority: string) => {
    await api(`/api/wishlist/${id}`, { method: 'PUT', body: { priority } });
    load();
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Wishlist</h1>
      {items.length === 0 ? (
        <Empty>Nothing saved yet.</Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map((w) => (
            <li key={w.id} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="w-24 shrink-0">
                <ProductImage product={w.product} className="h-24" />
              </div>
              <div className="flex-1 space-y-2">
                <Link href={`/products/${w.product.slug}`} className="font-medium hover:text-indigo-600">
                  {w.product.name}
                </Link>
                <Price price={w.product.price} compare={w.product.comparePrice} />
                <div className="flex items-center gap-2 text-sm">
                  {w.product.stock > 0 ? <Badge tone="emerald">In stock</Badge> : <Badge tone="rose">Out of stock</Badge>}
                  <select className="input w-auto py-1" value={w.priority} onChange={(e) => void setPriority(w.id, e.target.value)} aria-label="Priority">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary" disabled={w.product.stock === 0} onClick={() => void move(w.id)}>
                    Move to cart
                  </button>
                  <button className="btn-secondary" onClick={() => void remove(w.id)}>
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
