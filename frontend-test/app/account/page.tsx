'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Badge, Card, Empty, Spinner } from '@/components/ui';
import { api, auth, date } from '@/lib/api';
import type { User } from '@/lib/types';

interface Hook {
  id: string;
  targetUrl: string;
  event: string;
  isActive: boolean;
}

export default function AccountPage() {
  const { user, ready, refreshUser, notify, signOut } = useStore();
  const router = useRouter();
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const loadHooks = useCallback(() => {
    api<{ data: Hook[] }>('/api/webhooks').then((r) => setHooks(r.data)).catch(() => undefined);
    api<{ data: string[] }>('/api/webhooks/events').then((r) => setEvents(r.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (user) loadHooks();
  }, [user, loadHooks]);

  if (ready && !user)
    return (
      <Empty>
        <Link href="/login?next=/account" className="text-indigo-600">
          Sign in
        </Link>{' '}
        to manage your account.
      </Empty>
    );
  if (!user) return <Spinner />;

  const saveProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const address = { name: String(f.get('name')), address: String(f.get('street')), city: String(f.get('city')), state: String(f.get('state')).toUpperCase(), zip: String(f.get('zip')), country: String(f.get('country')).toUpperCase() };
    try {
      await api<{ data: User }>('/api/auth/me', { method: 'PUT', body: { name: f.get('name'), phone: f.get('phone') || null, ...(address.address ? { address } : {}) } });
      await refreshUser();
      notify('Profile saved');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const changePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      const res = await api<{ token: string }>('/api/auth/password', { method: 'PUT', body: { currentPassword: f.get('current'), newPassword: f.get('next') } });
      auth.setToken(res.token);
      form.reset();
      notify('Password changed; other devices were signed out');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const exportData = async () => {
    const data = await api('/api/auth/me/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'my-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteAccount = async () => {
    const password = prompt('Type your password to permanently delete your account');
    if (!password) return;
    try {
      await api('/api/auth/me', { method: 'DELETE', body: { password } });
      await signOut();
      router.push('/');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const addHook = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      const res = await api<{ data: { secret: string } }>('/api/webhooks', { body: { targetUrl: f.get('url'), event: f.get('event') } });
      setNewSecret(res.data.secret);
      form.reset();
      loadHooks();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  const a = user.address;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Profile" actions={<Badge tone={user.role === 'admin' ? 'violet' : 'slate'}>{user.role}</Badge>}>
        <form onSubmit={saveProfile} className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label">Email</label>
            <input className="input bg-slate-50" value={user.email} disabled />
          </div>
          <div>
            <label className="label">Name</label>
            <input name="name" className="input" defaultValue={user.name} required minLength={2} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" className="input" defaultValue={user.phone ?? ''} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Default shipping address</label>
            <input name="street" className="input" placeholder="Street" defaultValue={a?.address ?? ''} />
          </div>
          <input name="city" className="input" placeholder="City" defaultValue={a?.city ?? ''} />
          <input name="state" className="input" placeholder="State" defaultValue={a?.state ?? ''} />
          <input name="zip" className="input" placeholder="Postal code" defaultValue={a?.zip ?? ''} />
          <input name="country" className="input" placeholder="Country (US)" defaultValue={a?.country ?? 'US'} maxLength={2} />
          <button className="btn-primary md:col-span-2">Save</button>
        </form>
        <p className="mt-3 text-xs text-slate-400">Member since {date(user.createdAt)}</p>
      </Card>

      <div className="space-y-6">
        <Card title="Password">
          <form onSubmit={changePassword} className="space-y-3">
            <input name="current" type="password" className="input" placeholder="Current password" required autoComplete="current-password" />
            <input name="next" type="password" className="input" placeholder="New password (8+ chars, letter and digit)" required minLength={8} autoComplete="new-password" />
            <button className="btn-primary">Change password</button>
          </form>
        </Card>

        <Card title="Order webhooks">
          <p className="mb-3 text-sm text-slate-600">Get a signed POST when your orders are created, paid, change status or are refunded.</p>
          {newSecret && (
            <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              Signing secret (shown once): <code className="break-all">{newSecret}</code>
            </div>
          )}
          <ul className="mb-3 space-y-2 text-sm">
            {hooks.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <Badge>{h.event}</Badge> {h.targetUrl}
                </span>
                <button className="text-rose-600" onClick={() => void api(`/api/webhooks/${h.id}`, { method: 'DELETE' }).then(loadHooks)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addHook} className="flex gap-2">
            <input name="url" type="url" className="input" placeholder="https://example.com/hook" required />
            <select name="event" className="input w-auto">
              {events
                .filter((e) => e.startsWith('order.') || user.role === 'admin')
                .map((e) => (
                  <option key={e}>{e}</option>
                ))}
            </select>
            <button className="btn-secondary">Add</button>
          </form>
        </Card>

        <Card title="Your data">
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => void exportData()}>
              Download my data
            </button>
            <Link href="/membership" className="btn-secondary">
              Membership
            </Link>
            {user.role !== 'admin' && (
              <button className="btn-danger" onClick={() => void deleteAccount()}>
                Delete account
              </button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
