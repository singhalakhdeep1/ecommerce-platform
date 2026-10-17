'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Card, Spinner } from '@/components/ui';
import { api, money } from '@/lib/api';
import type { Address, Order, PaymentSession, Quote } from '@/lib/types';

interface PaymentConfig {
  cardProvider: 'stripe' | 'sandbox' | null;
  stripePublishableKey: string | null;
  paypalEnabled: boolean;
  sandboxTestMethods: Array<{ id: string; succeeds: boolean; description: string }>;
}

const CARRIERS = [
  ['usps', 'USPS'],
  ['ups', 'UPS'],
  ['fedex', 'FedEx'],
  ['dhl', 'DHL'],
] as const;

function CheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, ready, cart, refreshCart, notify } = useStore();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [address, setAddress] = useState<Address>({ name: '', address: '', city: '', state: '', zip: '', country: 'US' });
  const [carrier, setCarrier] = useState('usps');
  const [service, setService] = useState('ground');
  const [orderType, setOrderType] = useState('standard');
  const [method, setMethod] = useState<'card' | 'paypal'>('card');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<{ order: Order; payment: PaymentSession } | null>(null);
  // One key per checkout attempt: a double click or retry cannot create two orders.
  const [idempotencyKey] = useState(() => `chk-${crypto.randomUUID()}`);

  useEffect(() => {
    if (ready && !user) router.replace('/login?next=/checkout');
  }, [ready, user, router]);

  useEffect(() => {
    api<{ data: PaymentConfig }>('/api/payments/config').then((r) => setConfig(r.data)).catch(() => undefined);
    if (user?.address) setAddress((a) => ({ ...a, ...user.address, name: user.address?.name || user.name }));
    else if (user) setAddress((a) => ({ ...a, name: user.name }));
  }, [user]);

  useEffect(() => {
    if (!cart?.items.length || placed) return;
    const q = new URLSearchParams({ country: address.country || 'US', shippingProvider: carrier, shippingService: service, orderType });
    if (address.state) q.set('state', address.state);
    if (code) q.set('discountCode', code);
    const t = setTimeout(() => {
      api<{ data: Quote }>(`/api/cart/quote?${q}`)
        .then((r) => setQuote(r.data))
        .catch((e) => {
          setQuote(null);
          notify(e.message, 'error');
        });
    }, 300);
    return () => clearTimeout(t);
  }, [cart, address.country, address.state, carrier, service, orderType, code, placed, notify]);

  const placeOrder = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ data: { order: Order; payment: PaymentSession } }>('/api/checkout', {
        idempotencyKey,
        body: { shippingAddress: address, paymentMethod: method, shippingProvider: carrier, shippingService: service, orderType, discountCode: code || undefined },
      });
      setPlaced(res.data);
      await refreshCart();
      if (res.data.payment.provider === 'paypal' && res.data.payment.approvalUrl) window.location.href = res.data.payment.approvalUrl;
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!ready || !user) return <Spinner />;
  if (!placed && (!cart || cart.items.length === 0))
    return (
      <div className="py-16 text-center text-slate-500">
        Your cart is empty. <Link href="/products" className="text-indigo-600">Continue shopping</Link>
      </div>
    );

  if (placed) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card title={`Pay for order ${placed.order.orderNumber}`}>
          <p className="mb-4 text-sm text-slate-600">
            Total due: <strong>{money(placed.order.totalAmount)}</strong>
            {placed.order.fraudFlag && <span className="ml-2 text-amber-700">(held for a quick manual review after payment)</span>}
          </p>
          {placed.payment.provider === 'sandbox' && config && <SandboxPay order={placed.order} methods={config.sandboxTestMethods} />}
          {placed.payment.provider === 'stripe' && config?.stripePublishableKey && placed.payment.clientSecret && (
            <StripePay order={placed.order} publishableKey={config.stripePublishableKey} clientSecret={placed.payment.clientSecret} />
          )}
          {placed.payment.provider === 'paypal' && <p className="text-sm">Redirecting to PayPal…</p>}
        </Card>
      </div>
    );
  }

  const field = (key: keyof Address, label: string, props: Record<string, unknown> = {}) => (
    <div>
      <label className="label" htmlFor={key}>
        {label}
      </label>
      <input id={key} className="input" value={address[key]} onChange={(e) => setAddress({ ...address, [key]: key === 'country' || key === 'state' ? e.target.value.toUpperCase() : e.target.value })} {...props} />
    </div>
  );

  return (
    <form onSubmit={placeOrder} className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Card title="Shipping address">
          <div className="grid gap-3 md:grid-cols-2">
            {field('name', 'Full name', { required: true, minLength: 2 })}
            {field('address', 'Street address', { required: true, minLength: 5 })}
            {field('city', 'City', { required: true })}
            {field('state', 'State / region', { maxLength: 50 })}
            {field('zip', 'Postal code', { required: true })}
            {field('country', 'Country (ISO code)', { required: true, minLength: 2, maxLength: 2 })}
          </div>
        </Card>
        <Card title="Delivery">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="label">Carrier</label>
              <select className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                {CARRIERS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Speed</label>
              <select className="input" value={service} onChange={(e) => setService(e.target.value)}>
                <option value="ground">Ground</option>
                <option value="express">Express</option>
                <option value="overnight">Overnight</option>
              </select>
            </div>
            <div>
              <label className="label">Order type</label>
              <select className="input" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                <option value="standard">Standard</option>
                <option value="express">Express (max 20 items)</option>
                <option value="preorder">Pre-order (out-of-stock items)</option>
              </select>
            </div>
          </div>
        </Card>
        <Card title="Payment method">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={method === 'card'} onChange={() => setMethod('card')} /> Card {config?.cardProvider === 'sandbox' && <span className="text-slate-400">(sandbox test cards)</span>}
            </label>
            {config?.paypalEnabled && (
              <label className="flex items-center gap-2">
                <input type="radio" checked={method === 'paypal'} onChange={() => setMethod('paypal')} /> PayPal
              </label>
            )}
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Order summary">
          <ul className="mb-3 space-y-1 text-sm">
            {cart?.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {i.quantity} × {i.product?.name} {i.variantName && `(${i.variantName})`}
                </span>
                <span className="tabular-nums">{money(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <input className="input mb-3" placeholder="Discount code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          {quote && (
            <dl className="space-y-1 border-t border-slate-200 pt-3 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{money(quote.subtotal)}</dd>
              </div>
              {quote.discount && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Discount</dt>
                  <dd>−{money(quote.discount.amount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt>Shipping ({quote.shipping.estimatedDelivery})</dt>
                <dd>{quote.shipping.cost ? money(quote.shipping.cost) : 'Free'}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Tax</dt>
                <dd>{money(quote.tax.taxAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd>{money(quote.total)}</dd>
              </div>
            </dl>
          )}
          <button className="btn-primary mt-4 w-full" disabled={busy || !quote}>
            {busy ? 'Placing order…' : 'Place order'}
          </button>
        </Card>
      </div>
    </form>
  );
}

function SandboxPay({ order, methods }: { order: Order; methods: PaymentConfig['sandboxTestMethods'] }) {
  const router = useRouter();
  const { notify } = useStore();
  const [pm, setPm] = useState(methods[0]?.id ?? 'pm_card_visa');
  const [busy, setBusy] = useState(false);
  const pay = async () => {
    setBusy(true);
    try {
      await api('/api/payments/confirm', { body: { orderId: order.id, paymentMethod: pm } });
      notify('Payment successful');
      router.push(`/orders/${order.id}?placed=1`);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">No Stripe key is configured, so this store runs the sandbox provider. Pick a test card:</p>
      {methods.map((m) => (
        <label key={m.id} className="flex items-center gap-2 text-sm">
          <input type="radio" checked={pm === m.id} onChange={() => setPm(m.id)} />
          <code>{m.id}</code> <span className={m.succeeds ? 'text-emerald-600' : 'text-rose-600'}>{m.description}</span>
        </label>
      ))}
      <button className="btn-primary w-full" onClick={() => void pay()} disabled={busy}>
        Pay {money(order.totalAmount)}
      </button>
    </div>
  );
}

function StripePay({ order, publishableKey, clientSecret }: { order: Order; publishableKey: string; clientSecret: string }) {
  const stripePromise = useMemo<Promise<Stripe | null>>(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <StripeForm order={order} />
    </Elements>
  );
}

function StripeForm({ order }: { order: Order }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const { notify } = useStore();
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    const { error } = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: `${window.location.origin}/orders/${order.id}?placed=1` } });
    if (error) {
      notify(error.message ?? 'Payment failed', 'error');
      setBusy(false);
      return;
    }
    // The webhook marks the order paid; this server-side re-check makes the result immediate.
    await api('/api/payments/confirm', { body: { orderId: order.id } }).catch(() => undefined);
    router.push(`/orders/${order.id}?placed=1`);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement />
      <button className="btn-primary w-full" disabled={!stripe || busy}>
        Pay {money(order.totalAmount)}
      </button>
    </form>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CheckoutInner />
    </Suspense>
  );
}
