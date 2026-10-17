'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Badge, Price, ProductCard, ProductImage, Spinner, Stars } from '@/components/ui';
import { api, date, money, track } from '@/lib/api';
import type { Cart, Product, Review } from '@/lib/types';

type Detail = Product & { reviews: Review[]; related: Product[] };

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, setCart, notify } = useStore();
  const [product, setProduct] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [variant, setVariant] = useState('');
  const [qty, setQty] = useState(1);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewSort, setReviewSort] = useState('newest');
  const [priceVariant, setPriceVariant] = useState('A');

  const load = useCallback(async () => {
    try {
      const res = await api<{ data: Detail }>(`/api/products/${slug}`);
      setProduct(res.data);
      setVariant((v) => v || res.data.variants[0]?.name || '');
      track('product_view', { productId: res.data.id });
    } catch {
      setMissing(true);
    }
  }, [slug]);

  useEffect(() => {
    void load();
    // A/B test: variant B shows the saving as a percentage badge.
    api<{ data: { variant: string } }>('/api/experiments/price_display_format/assignment')
      .then((r) => setPriceVariant(r.data.variant))
      .catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!product) return;
    api<{ data: { reviews: Review[] } }>(`/api/products/${product.id}/reviews?sort=${reviewSort}&limit=20`)
      .then((r) => setReviews(r.data.reviews))
      .catch(() => undefined);
  }, [product, reviewSort]);

  if (missing) return <div className="py-20 text-center text-slate-500">Product not found. <Link href="/products" className="text-indigo-600">Back to the shop</Link></div>;
  if (!product) return <Spinner />;

  const selected = product.variants.find((v) => v.name === variant);
  const price = selected?.price ?? product.price;
  const available = selected?.quantity !== undefined ? Math.min(selected.quantity, product.stock) : product.stock;
  const saving = product.comparePrice && product.comparePrice > price ? Math.round((1 - price / product.comparePrice) * 100) : 0;

  const addToCart = async () => {
    try {
      const res = await api<{ data: Cart }>('/api/cart/items', { body: { productId: product.id, quantity: qty, variantName: variant } });
      setCart(res.data);
      notify(`Added ${qty} × ${product.name}`);
      if (saving) api('/api/experiments/price_display_format/convert', { method: 'POST' }).catch(() => undefined);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  const addToWishlist = async () => {
    if (!user) return notify('Sign in to use your wishlist', 'error');
    try {
      await api('/api/wishlist', { body: { productId: product.id } });
      notify('Saved to wishlist');
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  return (
    <div className="space-y-10">
      <nav className="text-sm text-slate-500">
        <Link href="/products">Shop</Link>
        {product.category && (
          <>
            {' / '}
            <Link href={`/products?category=${product.category.slug}`}>{product.category.name}</Link>
          </>
        )}
      </nav>
      <div className="grid gap-8 md:grid-cols-2">
        <ProductImage product={product} className="h-80" />
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold">{product.name}</h1>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Stars rating={product.rating} /> {product.rating.toFixed(1)} · {product.numReviews} reviews · SKU {selected?.sku ?? product.sku}
          </div>
          <div className="flex items-center gap-3 text-2xl">
            <Price price={price} compare={product.comparePrice} />
            {saving > 0 && priceVariant === 'B' && <Badge tone="emerald">Save {saving}%</Badge>}
          </div>
          <p className="text-slate-600">{product.description}</p>
          {product.variants.length > 0 && (
            <div>
              <div className="label">Option</div>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button key={v.name} onClick={() => setVariant(v.name)} disabled={v.quantity === 0} className={`rounded-lg border px-3 py-1.5 text-sm ${variant === v.name ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-300'} disabled:opacity-40`}>
                    {v.name}
                    {v.price ? ` · ${money(v.price)}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="text-sm">{available > 0 ? <span className="text-emerald-600">{available} in stock</span> : <span className="text-rose-600">Out of stock</span>}</div>
          <div className="flex items-center gap-3">
            <input type="number" min={1} max={Math.max(1, available)} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className="input w-20" aria-label="Quantity" />
            <button className="btn-primary" disabled={available < 1} onClick={() => void addToCart()}>
              Add to cart
            </button>
            <button className="btn-secondary" onClick={() => void addToWishlist()}>
              ♡ Wishlist
            </button>
          </div>
          {Object.keys(product.specifications).length > 0 && (
            <table className="table mt-4">
              <tbody>
                {Object.entries(product.specifications).map(([k, v]) => (
                  <tr key={k}>
                    <td className="w-40 text-slate-500">{k}</td>
                    <td>{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex flex-wrap gap-1">
            {product.tags.map((t) => (
              <Badge key={t}>#{t}</Badge>
            ))}
          </div>
        </div>
      </div>

      <section className="grid gap-6 md:grid-cols-[1fr_22rem]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Reviews</h2>
            <select className="input w-auto" value={reviewSort} onChange={(e) => setReviewSort(e.target.value)} aria-label="Sort reviews">
              <option value="newest">Newest</option>
              <option value="helpful">Most helpful</option>
              <option value="rating">Highest rating</option>
            </select>
          </div>
          {reviews.length === 0 && <p className="text-slate-500">No reviews yet.</p>}
          <ul className="space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Stars rating={r.rating} /> <span className="font-medium">{r.title}</span> {r.verified && <Badge tone="emerald">Verified purchase</Badge>}
                </div>
                <p className="mt-2 text-sm text-slate-700">{r.comment}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                  <span>
                    {r.user?.name ?? 'Customer'} · {date(r.createdAt)}
                  </span>
                  {user && user.id !== r.userId && (
                    <button
                      className="text-indigo-600"
                      onClick={() =>
                        api<{ data: { helpful: number } }>(`/api/reviews/${r.id}/helpful`, { method: 'POST' })
                          .then((res) => setReviews((all) => all.map((x) => (x.id === r.id ? { ...x, helpful: res.data.helpful } : x))))
                          .catch((e) => notify(e.message, 'error'))
                      }
                    >
                      Helpful ({r.helpful})
                    </button>
                  )}
                  {(!user || user.id === r.userId) && <span>{r.helpful} found this helpful</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <ReviewForm productId={product.id} onDone={load} />
      </section>

      {product.related.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">You may also like</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {product.related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ReviewForm({ productId, onDone }: { productId: string; onDone: () => Promise<void> }) {
  const { user, notify } = useStore();
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  if (!user)
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <Link href="/login" className="text-indigo-600">
          Sign in
        </Link>{' '}
        to write a review.
      </div>
    );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    try {
      await api('/api/reviews', { body: { productId, rating, title: f.get('title'), comment: f.get('comment') } });
      notify('Thanks for your review');
      form.reset();
      await onDone();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold">Write a review</h3>
      <div className="flex gap-1 text-2xl">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} onClick={() => setRating(n)} className={n <= rating ? 'text-amber-500' : 'text-slate-300'} aria-label={`${n} stars`}>
            ★
          </button>
        ))}
      </div>
      <input name="title" className="input" placeholder="Title" required minLength={2} maxLength={150} />
      <textarea name="comment" className="input" rows={4} placeholder="What did you think?" required minLength={5} />
      <button className="btn-primary w-full" disabled={busy}>
        Submit review
      </button>
    </form>
  );
}
