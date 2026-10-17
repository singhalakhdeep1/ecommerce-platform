'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { Order } from '@/lib/types';

/** PayPal sends the buyer back here with ?token=<PayPal order id> after approval. */
function PaypalReturn() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const paypalOrderId = params.get('token');
    if (!paypalOrderId || started.current) return;
    started.current = true;
    api<{ data: Order }>('/api/payments/paypal/capture', { body: { paypalOrderId } })
      .then((r) => router.replace(`/orders/${r.data.id}?placed=1`))
      .catch((e) => setError((e as Error).message));
  }, [params, router]);

  if (!params.get('token')) return <p className="py-16 text-center">Missing PayPal token.</p>;
  if (error)
    return (
      <div className="py-16 text-center text-rose-600">
        {error} <Link href="/orders" className="text-indigo-600">Go to my orders</Link>
      </div>
    );
  return <p className="py-16 text-center text-slate-500">Confirming your PayPal payment…</p>;
}

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <PaypalReturn />
    </Suspense>
  );
}
