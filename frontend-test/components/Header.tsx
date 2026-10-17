'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, money } from '@/lib/api';
import { useStore } from './StoreProvider';

interface Suggestion {
  id: string;
  name: string;
  slug: string;
  price: number;
}

export default function Header() {
  const { user, cart, signOut } = useStore();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(() => {
      api<{ data: Suggestion[] }>(`/api/search/suggest?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setSuggestions(r.data))
        .catch(() => setSuggestions([]));
    }, 200);
  }, [q]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setOpen(false);
    router.push(`/products?search=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="text-xl font-bold text-indigo-600">
          ShopLine
        </Link>
        <nav className="hidden gap-4 text-sm text-slate-600 md:flex">
          <Link href="/products" className="hover:text-indigo-600">
            Shop
          </Link>
          <Link href="/membership" className="hover:text-indigo-600">
            Membership
          </Link>
          {user && (
            <Link href="/orders" className="hover:text-indigo-600">
              Orders
            </Link>
          )}
          {user && (
            <Link href="/wishlist" className="hover:text-indigo-600">
              Wishlist
            </Link>
          )}
          {user?.role === 'admin' && (
            <Link href="/admin" className="font-medium text-indigo-600">
              Admin
            </Link>
          )}
        </nav>
        <form onSubmit={submit} className="relative ml-auto w-full max-w-sm">
          <input
            className="input"
            placeholder="Search products…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            aria-label="Search products"
          />
          {open && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-1 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <Link href={`/products/${s.slug}`} className="flex justify-between px-3 py-2 text-sm hover:bg-slate-50" onClick={() => setOpen(false)}>
                    <span>{s.name}</span>
                    <span className="text-slate-500">{money(s.price)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </form>
        <Link href="/cart" className="relative rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100" aria-label="Cart">
          Cart
          {cart && cart.itemCount > 0 && <span className="ml-1 rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">{cart.itemCount}</span>}
        </Link>
        {user ? (
          <div className="flex items-center gap-2 text-sm">
            <Link href="/account" className="text-slate-700 hover:text-indigo-600">
              {user.name.split(' ')[0]}
            </Link>
            <button className="text-slate-500 hover:text-slate-800" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        ) : (
          <Link href="/login" className="btn-primary whitespace-nowrap">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
