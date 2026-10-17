'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { useStore } from '@/components/StoreProvider';
import { Card, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

function AuthForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { signIn, notify } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const body = mode === 'login' ? { email: f.get('email'), password: f.get('password') } : { name: f.get('name'), email: f.get('email'), password: f.get('password') };
      const res = await api<{ token: string; data: User; mergedCartItems: number }>(`/api/auth/${mode}`, { body });
      await signIn(res.token, res.data);
      notify(mode === 'login' ? `Welcome back, ${res.data.name}` : 'Account created');
      router.push(params.get('next') ?? (res.data.role === 'admin' ? '/admin' : '/'));
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Card title={mode === 'login' ? 'Sign in' : 'Create an account'}>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" className="input" required minLength={2} autoComplete="name" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" className="input" required autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input id="password" name="password" type="password" className="input" required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            {mode === 'register' && <p className="mt-1 text-xs text-slate-500">At least 8 characters with a letter and a digit.</p>}
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
          <button className="text-indigo-600" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
        <p className="mt-2 text-center text-xs text-slate-400">
          Demo accounts after seeding: admin@example.com / Admin123!, alice@example.com / Customer123!. Items in your guest cart move into your account. <Link href="/products">Keep shopping</Link>
        </p>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AuthForm />
    </Suspense>
  );
}
