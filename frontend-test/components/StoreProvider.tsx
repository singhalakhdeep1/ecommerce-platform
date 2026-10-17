'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, auth } from '@/lib/api';
import type { Cart, User } from '@/lib/types';

interface Toast {
  id: number;
  text: string;
  kind: 'success' | 'error';
}

interface Store {
  user: User | null;
  ready: boolean;
  cart: Cart | null;
  refreshCart: () => Promise<void>;
  setCart: (cart: Cart) => void;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  notify: (text: string, kind?: Toast['kind']) => void;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState<Cart | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const refreshCart = useCallback(async () => {
    try {
      const res = await api<{ data: Cart }>('/api/cart');
      setCart(res.data);
    } catch {
      setCart(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!auth.token()) {
      setUser(null);
      return;
    }
    try {
      const res = await api<{ data: User }>('/api/auth/me');
      setUser(res.data);
    } catch {
      auth.setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshUser();
      await refreshCart();
      setReady(true);
    })();
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, [refreshUser, refreshCart]);

  const signIn = useCallback(
    async (token: string, signedIn: User) => {
      auth.setToken(token);
      // The guest cart was merged into the account cart by the API.
      auth.setCartToken(null);
      setUser(signedIn);
      await refreshCart();
    },
    [refreshCart],
  );

  const signOut = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    auth.setToken(null);
    auth.setCartToken(null);
    setUser(null);
    setCart(null);
    await refreshCart();
  }, [refreshCart]);

  const value = useMemo(() => ({ user, ready, cart, refreshCart, setCart, signIn, signOut, refreshUser, notify }), [user, ready, cart, refreshCart, signIn, signOut, refreshUser, notify]);

  return (
    <StoreContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-lg px-4 py-3 text-sm text-white shadow-lg ${t.kind === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </StoreContext.Provider>
  );
}
