'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Badge, Card } from '@/components/ui';
import { api, date, money } from '@/lib/api';

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  perks: string[];
  billing: 'stripe' | 'sandbox';
}

interface Subscription {
  id: string;
  planId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  plan: Plan | null;
}

export default function MembershipPage() {
  const { user, notify } = useStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [member, setMember] = useState(false);

  const load = useCallback(() => {
    api<{ data: Plan[] }>('/api/subscriptions/plans').then((r) => setPlans(r.data)).catch(() => undefined);
    if (user)
      api<{ data: Subscription[]; member: boolean }>('/api/subscriptions')
        .then((r) => {
          setSubs(r.data);
          setMember(r.member);
        })
        .catch(() => undefined);
  }, [user]);

  useEffect(() => load(), [load]);

  const subscribe = async (planId: string) => {
    try {
      const res = await api<{ mode: 'stripe' | 'sandbox'; checkoutUrl?: string }>('/api/subscriptions', { body: { planId } });
      if (res.mode === 'stripe' && res.checkoutUrl) window.location.href = res.checkoutUrl;
      else {
        notify('Welcome, member! Shipping is now free.');
        load();
      }
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  const act = async (id: string, action: 'cancel' | 'resume', atPeriodEnd = true) => {
    try {
      await api(`/api/subscriptions/${id}/${action}`, { body: action === 'cancel' ? { atPeriodEnd } : {} });
      notify(action === 'cancel' ? 'Membership cancellation scheduled' : 'Membership resumed');
      load();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  const active = subs.filter((s) => ['active', 'trialing', 'past_due'].includes(s.status));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Membership</h1>
        <p className="text-slate-600">Members get free ground shipping on every domestic order.</p>
      </div>
      {member && <div className="rounded-xl bg-emerald-50 p-4 text-emerald-800">You are a member. Shipping is on us.</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.id} title={p.name} actions={<Badge tone={p.billing === 'stripe' ? 'violet' : 'slate'}>{p.billing === 'stripe' ? 'Stripe billing' : 'Sandbox billing'}</Badge>}>
            <div className="text-3xl font-bold">
              {money(p.price)}
              <span className="text-base font-normal text-slate-500"> / {p.interval}</span>
            </div>
            <ul className="my-4 list-inside list-disc text-sm text-slate-600">
              {p.perks.map((perk) => (
                <li key={perk}>{perk}</li>
              ))}
            </ul>
            {user ? (
              <button className="btn-primary w-full" disabled={member} onClick={() => void subscribe(p.id)}>
                {member ? 'Already a member' : 'Join'}
              </button>
            ) : (
              <Link href="/login?next=/membership" className="btn-primary w-full">
                Sign in to join
              </Link>
            )}
          </Card>
        ))}
      </div>
      {active.length > 0 && (
        <Card title="Your membership">
          {active.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <div className="font-medium">{s.plan?.name ?? s.planId}</div>
                <div className="text-slate-500">
                  {s.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on {date(s.currentPeriodEnd)} · status {s.status}
                </div>
              </div>
              <div className="flex gap-2">
                {s.cancelAtPeriodEnd ? (
                  <button className="btn-secondary" onClick={() => void act(s.id, 'resume')}>
                    Resume
                  </button>
                ) : (
                  <button className="btn-secondary" onClick={() => void act(s.id, 'cancel', true)}>
                    Cancel at period end
                  </button>
                )}
                <button className="btn-danger" onClick={() => confirm('End your membership now?') && void act(s.id, 'cancel', false)}>
                  End now
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
