/** Thin fetch client for the e-commerce API: auth token, guest cart token and analytics session id. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000').replace(/\/$/, '');

const TOKEN_KEY = 'ecom.token';
const CART_KEY = 'ecom.cartToken';
const SESSION_KEY = 'ecom.sessionId';

const storage = {
  get(key: string): string | null {
    try {
      return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (typeof window === 'undefined') return;
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: session-only */
    }
  },
};

export const auth = {
  token: () => storage.get(TOKEN_KEY),
  setToken: (token: string | null) => storage.set(TOKEN_KEY, token),
  cartToken: () => storage.get(CART_KEY),
  setCartToken: (token: string | null) => storage.set(CART_KEY, token),
  sessionId(): string {
    let id = storage.get(SESSION_KEY);
    if (!id) {
      id = `s_${crypto.randomUUID().replace(/-/g, '')}`;
      storage.set(SESSION_KEY, id);
    }
    return id;
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth.token();
  if (token) headers.Authorization = `Bearer ${token}`;
  const cartToken = auth.cartToken();
  if (cartToken) headers['X-Cart-Token'] = cartToken;
  if (typeof window !== 'undefined') headers['X-Session-Id'] = auth.sessionId();
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const newCartToken = res.headers.get('X-Cart-Token');
  if (newCartToken && !token) auth.setCartToken(newCartToken);
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    if (res.status === 401 && token) auth.setToken(null);
    const details = json.details as Array<{ path: string; message: string }> | undefined;
    const message = Array.isArray(details) && details.length ? `${json.error}: ${details.map((d) => `${d.path} ${d.message}`).join('; ')}` : String(json.error ?? res.statusText);
    throw new ApiError(message, res.status, json.details);
  }
  return json as T;
}

/** Fire-and-forget analytics event. */
export function track(eventType: string, eventData?: Record<string, unknown>): void {
  api('/api/analytics/track', { body: { eventType, eventData } }).catch(() => undefined);
}

export const money = (n: number | string | null | undefined, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n ?? 0));

export const date = (d: string | Date) => new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
