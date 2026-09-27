/**
 * A stand-in for the few Stripe endpoints billing calls, on a local port: prices by lookup key,
 * customers (one per idempotency key, as Stripe does), Checkout and portal sessions, and
 * subscriptions a test moves along. It records every request, so a test can see what was asked.
 */
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StubSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
  items: { data: Array<{ price: { id: string; lookup_key: string | null } }> };
}

export interface StripeStub {
  url: string;
  requests: Array<{
    method: string;
    path: string;
    params: URLSearchParams;
    headers: IncomingMessage['headers'];
  }>;
  customers: Map<string, { id: string; params: URLSearchParams }>;
  sessions: Map<string, { id: string; customer: string; price: string; params: URLSearchParams }>;
  subscriptions: Map<string, StubSubscription>;
  /** Pay for a Checkout session: its subscription starts, and the event Stripe would send. */
  pay(sessionId: string, status?: string): { subscription: StubSubscription; event: object };
  /** A subscription changed (renewed, failed, cancelled): the event Stripe would send. */
  change(id: string, patch: Partial<StubSubscription>, type?: string): object;
  /** A subscription to a price of someone else's. */
  foreign(customer: string): { subscription: StubSubscription; event: object };
  close(): Promise<void>;
}

export const PRICES = [
  { id: 'price_pro_m', lookup_key: 'caishy_pro_month', unit_amount: 600 },
  { id: 'price_pro_y', lookup_key: 'caishy_pro_year', unit_amount: 6000 },
  { id: 'price_biz_m', lookup_key: 'caishy_business_month', unit_amount: 2900 },
  { id: 'price_biz_y', lookup_key: 'caishy_business_year', unit_amount: 29000 },
].map((p) => ({
  ...p,
  object: 'price',
  active: true,
  currency: 'eur',
  recurring: { interval: p.lookup_key.endsWith('year') ? 'year' : 'month' },
}));

export async function stripeStub(): Promise<StripeStub> {
  let n = 0;
  let events = 0;
  const next = (prefix: string) => `${prefix}_${(++n).toString().padStart(6, '0')}`;
  const requests: StripeStub['requests'] = [];
  const customers: StripeStub['customers'] = new Map();
  const byIdempotency = new Map<string, string>();
  const sessions: StripeStub['sessions'] = new Map();
  const subscriptions: StripeStub['subscriptions'] = new Map();
  const event = (type: string, object: object) => ({
    id: `evt_${(++events).toString().padStart(6, '0')}`,
    object: 'event',
    type,
    data: { object },
  });

  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const url = new URL(req.url ?? '/', 'http://stripe.test');
    const params =
      req.method === 'GET' || req.method === 'DELETE' ? url.searchParams : new URLSearchParams(raw);
    requests.push({ method: req.method ?? '', path: url.pathname, params, headers: req.headers });
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== 'Bearer sk_test_stub_0123456789abcdef')
      return send(401, { error: { type: 'invalid_request_error', message: 'Invalid API key.' } });
    const path = url.pathname;
    if (req.method === 'GET' && path === '/v1/prices') {
      const keys = [...params.entries()]
        .filter(([k]) => k.startsWith('lookup_keys'))
        .map(([, v]) => v);
      return send(200, { object: 'list', data: PRICES.filter((p) => keys.includes(p.lookup_key)) });
    }
    if (req.method === 'POST' && path === '/v1/customers') {
      const key = req.headers['idempotency-key'];
      const known = typeof key === 'string' ? byIdempotency.get(key) : undefined;
      const id = known ?? next('cus');
      if (!known) customers.set(id, { id, params });
      if (typeof key === 'string') byIdempotency.set(key, id);
      return send(200, { id, object: 'customer' });
    }
    if (req.method === 'POST' && path === '/v1/checkout/sessions') {
      const id = next('cs');
      sessions.set(id, {
        id,
        customer: params.get('customer') ?? '',
        price: params.get('line_items[0][price]') ?? '',
        params,
      });
      return send(200, {
        id,
        object: 'checkout.session',
        url: `https://checkout.stripe.test/${id}`,
      });
    }
    if (req.method === 'POST' && path === '/v1/billing_portal/sessions')
      return send(200, {
        object: 'billing_portal.session',
        url: `https://billing.stripe.test/${params.get('customer')}`,
      });
    const sub = /^\/v1\/subscriptions\/([\w]+)$/.exec(path);
    if (sub) {
      const s = subscriptions.get(sub[1] ?? '');
      if (!s)
        return send(404, {
          error: { type: 'invalid_request_error', message: 'No such subscription.' },
        });
      if (req.method === 'DELETE') s.status = 'canceled';
      return send(200, { object: 'subscription', ...s });
    }
    send(404, { error: { type: 'invalid_request_error', message: `No route ${path}` } });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;

  const start = (
    customer: string,
    price: { id: string; lookup_key: string | null },
    status: string,
  ) => {
    const subscription: StubSubscription = {
      id: next('sub'),
      customer,
      status,
      cancel_at_period_end: false,
      current_period_end: Date.parse('2026-10-23T14:00:00Z') / 1000,
      items: { data: [{ price }] },
    };
    subscriptions.set(subscription.id, subscription);
    return subscription;
  };
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    customers,
    sessions,
    subscriptions,
    pay(sessionId, status = 'active') {
      const s = sessions.get(sessionId);
      if (!s) throw new Error(`No session ${sessionId}`);
      const price = PRICES.find((p) => p.id === s.price);
      if (!price) throw new Error(`No price ${s.price}`);
      const subscription = start(s.customer, price, status);
      return {
        subscription,
        event: event('checkout.session.completed', {
          id: s.id,
          object: 'checkout.session',
          mode: 'subscription',
          customer: s.customer,
          subscription: subscription.id,
        }),
      };
    },
    change(id, patch, type = 'customer.subscription.updated') {
      const s = subscriptions.get(id);
      if (!s) throw new Error(`No subscription ${id}`);
      Object.assign(s, patch);
      return event(type, { ...s, object: 'subscription' });
    },
    foreign(customer) {
      const subscription = start(
        customer,
        { id: 'price_other', lookup_key: 'other_product' },
        'active',
      );
      return {
        subscription,
        event: event('customer.subscription.created', { ...subscription, object: 'subscription' }),
      };
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
}
