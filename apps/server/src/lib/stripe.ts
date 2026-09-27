/**
 * Stripe (R25), with fetch: the few calls billing makes, form-encoded as Stripe's API takes them
 * and pinned to one API version so what comes back keeps its shape; and the check of what its
 * webhooks sign. No SDK: this is all of it.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AppContext } from '../context';

/** The API version every call (and the webhook endpoint) uses. */
export const STRIPE_VERSION = '2024-06-20';

export class StripeError extends Error {
  constructor(
    public status: number,
    public type: string | null,
    message: string,
    /** Stripe's error code: `resource_missing` for something it doesn't have. */
    public code: string | null = null,
  ) {
    super(message);
  }
}

/** Something Stripe doesn't have (deleted there, or made with a key of the other mode). */
export const missingAtStripe = (e: unknown) =>
  e instanceof StripeError && (e.code === 'resource_missing' || e.status === 404);

/** A live key (or a restricted live key): anything else is test mode. */
export const liveKey = (key: string | null | undefined) => /^(sk|rk)_live_/.test(key ?? '');

/** Stripe's form encoding: nested objects and arrays as `a[b][0]=c`. */
export function stripeForm(params: Record<string, unknown>): string {
  const out: string[] = [];
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) for (const [i, v] of value.entries()) add(`${key}[${i}]`, v);
    else if (typeof value === 'object')
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) add(`${key}[${k}]`, v);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  };
  for (const [k, v] of Object.entries(params)) add(k, v);
  return out.join('&');
}

export interface Stripe {
  get<T>(path: string, params?: Record<string, unknown>): Promise<T>;
  post<T>(path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<T>;
  del<T>(path: string): Promise<T>;
}

/** Stripe, when a key is set; null otherwise. */
export function stripe(ctx: AppContext): Stripe | null {
  const key = ctx.config.STRIPE_SECRET_KEY;
  if (!key) return null;
  const base = ctx.config.STRIPE_API_BASE.replace(/\/$/, '');
  async function call<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params: Record<string, unknown> = {},
    idempotencyKey?: string,
  ): Promise<T> {
    const body = stripeForm(params);
    const url = method !== 'POST' && body ? `${base}${path}?${body}` : `${base}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        'stripe-version': STRIPE_VERSION,
        ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: method === 'POST' ? body : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { type?: string; message?: string; code?: string };
    };
    if (!res.ok)
      throw new StripeError(
        res.status,
        json.error?.type ?? null,
        json.error?.message ?? `Stripe answered ${res.status}.`,
        json.error?.code ?? null,
      );
    return json as T;
  }
  return {
    get: (path, params) => call('GET', path, params),
    post: (path, params, idempotencyKey) => call('POST', path, params, idempotencyKey),
    del: (path) => call('DELETE', path),
  };
}

/**
 * Did Stripe sign this body? Its `Stripe-Signature` header is `t=<unix seconds>,v1=<hex>,…`:
 * an HMAC-SHA256 of `<t>.<body>` with the endpoint's secret, within `toleranceSeconds` of now,
 * so a body recorded once can't be sent again later.
 */
export function stripeSigned(
  secret: string,
  header: string | undefined,
  body: Buffer,
  nowSeconds: number,
  toleranceSeconds = 300,
): boolean {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!Number.isFinite(t) || !signatures.length) return false;
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.`).update(body).digest();
  return signatures.some((s) => {
    const given = Buffer.from(s, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Sign a body as Stripe does (tests, and the local stub). */
export function stripeSignature(secret: string, body: string, nowSeconds: number): string {
  const v1 = createHmac('sha256', secret).update(`${nowSeconds}.${body}`).digest('hex');
  return `t=${nowSeconds},v1=${v1}`;
}
