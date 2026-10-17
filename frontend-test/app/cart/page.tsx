'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Card, Empty, ProductImage, Spinner } from '@/components/ui';
import { api, money } from '@/lib/api';
import type { Cart, Quote } from '@/lib/types';

export default function CartPage() {
  const { cart, setCart, refreshCart, notify, ready } = useStore();
  const [code, setCode] = useState('');
  const [appliedCode, setAppliedCode] = useState('');
  const [country, setCountry] = useState('US');
  const [state, setState] = useState('CA');
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  useEffect(() => {
    if (!cart || cart.items.length === 0) return setQuote(null);
    const q = new URLSearchParams({ country, ...(state ? { state } : {}), ...(appliedCode ? { discountCode: appliedCode } : {}) });
    api<{ data: Quote }>(`/api/cart/quote?${q}`)
      .then((r) => setQuote(r.data))
      .catch((e) => {
        if (appliedCode) {
          notify(e.message, 'error');
          setAppliedCode('');
        }
      });
  }, [cart, country, state, appliedCode, notify]);

  const setQty = async (itemId: string, quantity: number) => {
    try {
      const res = await api<{ data: Cart }>(`/api/cart/items/${itemId}`, { method: 'PUT', body: { quantity } });
      setCart(res.data);
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  const remove = async (itemId: string) => {
    const res = await api<{ data: Cart }>(`/api/cart/items/${itemId}`, { method: 'DELETE' });
    setCart(res.data);
  };

  if (!ready || !cart) return <Spinner />;
  if (cart.items.length === 0)
    return (
      <Empty>
        Your cart is empty.{' '}
        <Link href="/products" className="text-indigo-600">
          Start shopping
        </Link>
      </Empty>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card title={`Cart (${cart.itemCount})`}>
        <ul className="divide-y divide-slate-100">
          {cart.items.map((item) => (
            <li key={item.id} className="flex gap-4 py-4">
              <div className="w-20 shrink-0">{item.product && <ProductImage product={{ name: item.product.name, images: item.product.images }} className="h-20" />}</div>
              <div className="flex-1">
                <Link href={`/products/${item.product?.slug}`} className="font-medium hover:text-indigo-600">
                  {item.product?.name}
                </Link>
                {item.variantName && <div className="text-sm text-slate-500">{item.variantName}</div>}
                <div className="text-sm text-slate-500">{money(item.price)} each</div>
                <div className="mt-2 flex items-center gap-2">
                  <button className="btn-secondary px-2 py-1" disabled={item.quantity <= 1} onClick={() => void setQty(item.id, item.quantity - 1)} aria-label="Decrease">
                    −
                  </button>
                  <span className="w-8 text-center tabular-nums">{item.quantity}</span>
                  <button className="btn-secondary px-2 py-1" onClick={() => void setQty(item.id, item.quantity + 1)} aria-label="Increase">
                    +
                  </button>
                  <button className="ml-3 text-sm text-rose-600" onClick={() => void remove(item.id)}>
                    Remove
                  </button>
                </div>
              </div>
              <div className="font-semibold tabular-nums">{money(item.lineTotal)}</div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-4">
        <Card title="Summary">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="country">
                Country
              </label>
              <input id="country" className="input" value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="label" htmlFor="state">
                State
              </label>
              <input id="state" className="input" value={state} onChange={(e) => setState(e.target.value.toUpperCase())} />
            </div>
          </div>
          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedCode(code.trim());
            }}
          >
            <input className="input" placeholder="Discount code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn-secondary">Apply</button>
          </form>
          {quote ? (
            <dl className="space-y-1 text-sm">
              <Row label="Subtotal" value={money(quote.subtotal)} />
              {quote.discount && <Row label={`Discount (${quote.discount.code})`} value={`−${money(quote.discount.amount)}`} />}
              <Row label={`Shipping (${quote.shipping.provider} ${quote.shipping.serviceType}, ${quote.shipping.estimatedDelivery})`} value={quote.shipping.cost === 0 ? 'Free' : money(quote.shipping.cost)} />
              <Row label={`Tax (${quote.tax.jurisdiction} ${quote.tax.taxRate}%)`} value={money(quote.tax.taxAmount)} />
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{money(quote.total)}</span>
              </div>
            </dl>
          ) : (
            <Row label="Subtotal" value={money(cart.subtotal)} />
          )}
          <Link href={`/checkout${appliedCode ? `?code=${encodeURIComponent(appliedCode)}` : ''}`} className="btn-primary mt-4 w-full">
            Checkout
          </Link>
        </Card>
        <p className="text-xs text-slate-500">
          Try codes WELCOME10, SAVE20 (orders over $100) or FREESHIP. <Link href="/membership" className="text-indigo-600">Members</Link> ship free.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
