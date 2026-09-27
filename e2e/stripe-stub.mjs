/**
 * A stand-in for Stripe, for end-to-end runs: the server under test talks to it through
 * STRIPE_API_BASE. It answers the API calls billing makes (prices, customers, Checkout and portal
 * sessions, subscriptions), and serves a Checkout page and a portal page a test clicks through.
 * Paying or cancelling there sends the server the event Stripe would, signed with the webhook
 * secret, and then goes back where Stripe would.
 */
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 8796);
const origin = `http://127.0.0.1:${port}`;
const KEY = process.env.STRIPE_KEY ?? 'sk_test_e2e_0123456789abcdef';
const SECRET = process.env.WEBHOOK_SECRET ?? 'whsec_e2e_0123456789abcdef';
const WEBHOOK = process.env.WEBHOOK_URL ?? 'http://localhost:8787/v1/billing/webhook';

const PRICES = [
  ['price_pro_m', 'caishy_pro_month', 600],
  ['price_pro_y', 'caishy_pro_year', 6000],
  ['price_biz_m', 'caishy_business_month', 2900],
  ['price_biz_y', 'caishy_business_year', 29000],
].map(([id, lookup_key, unit_amount]) => ({
  id,
  object: 'price',
  lookup_key,
  unit_amount,
  currency: 'eur',
  active: true,
  recurring: { interval: lookup_key.endsWith('year') ? 'year' : 'month' },
}));

let n = 0;
const next = (prefix) => `${prefix}_${(++n).toString().padStart(8, '0')}`;
const customers = new Map();
const byIdempotency = new Map();
const sessions = new Map();
const subscriptions = new Map();

async function tell(type, object) {
  const body = JSON.stringify({ id: next('evt'), object: 'event', type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${v1}` },
    body,
  });
  if (!res.ok) console.error(`webhook ${type}: ${res.status} ${await res.text()}`);
}

const page = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;max-width:420px;margin:48px auto">${body}</body></html>`;

const server = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const url = new URL(req.url ?? '/', origin);
  const path = url.pathname;
  const params = req.method === 'POST' ? new URLSearchParams(raw) : url.searchParams;
  const json = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const html = (body) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  };
  const redirect = (to) => {
    res.writeHead(303, { location: to });
    res.end();
  };
  if (path === '/health') return json(200, { ok: true });

  // The pages a person clicks through.
  const checkout = /^\/checkout\/(\w+)(\/pay)?$/.exec(path);
  if (checkout) {
    const s = sessions.get(checkout[1]);
    if (!s) return json(404, { error: 'No such session' });
    const price = PRICES.find((p) => p.id === s.price);
    // As Stripe does: only an open session can be paid (a newer one closed it, say).
    if (s.status !== 'open')
      return html(page('Checkout', `<h1>This checkout has ${s.status}.</h1>`));
    if (!checkout[2])
      return html(
        page(
          'Checkout',
          `<h1>Pay Caishy</h1><p>${price.lookup_key} · ${price.unit_amount / 100} EUR a ${price.recurring.interval}</p><form method="post" action="/checkout/${s.id}/pay"><button type="submit">Pay</button></form>`,
        ),
      );
    const sub = {
      id: next('sub'),
      object: 'subscription',
      customer: s.customer,
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
      metadata: s.payer ? { caishy_payer: s.payer } : {},
      items: {
        data: [
          {
            price: {
              id: price.id,
              lookup_key: price.lookup_key,
              unit_amount: price.unit_amount,
              currency: price.currency,
              recurring: price.recurring,
            },
          },
        ],
      },
    };
    s.status = 'complete';
    subscriptions.set(sub.id, sub);
    await tell('checkout.session.completed', {
      id: s.id,
      object: 'checkout.session',
      mode: 'subscription',
      customer: s.customer,
      subscription: sub.id,
    });
    return redirect(s.success_url);
  }
  const portal = /^\/portal\/(\w+)(\/cancel)?$/.exec(path);
  if (portal) {
    const customer = portal[1];
    const returnTo = url.searchParams.get('return') ?? '/';
    const sub = [...subscriptions.values()].find(
      (x) => x.customer === customer && x.status === 'active',
    );
    if (!portal[2])
      return html(
        page(
          'Billing',
          `<h1>Your billing</h1>${sub ? `<form method="post" action="/portal/${customer}/cancel?return=${encodeURIComponent(returnTo)}"><button type="submit">Cancel plan</button></form>` : '<p>Nothing to cancel.</p>'}<p><a href="${returnTo}">Back to Caishy</a></p>`,
        ),
      );
    if (sub) {
      sub.cancel_at_period_end = true;
      await tell('customer.subscription.updated', sub);
    }
    return redirect(returnTo);
  }

  // The API.
  if (req.headers.authorization !== `Bearer ${KEY}`)
    return json(401, { error: { type: 'invalid_request_error', message: 'Invalid API key.' } });
  const missing = (what) =>
    json(404, {
      error: {
        type: 'invalid_request_error',
        code: 'resource_missing',
        message: `No such ${what}.`,
      },
    });
  if (req.method === 'GET' && path === '/v1/prices') {
    const keys = [...params.entries()]
      .filter(([k]) => k.startsWith('lookup_keys'))
      .map(([, v]) => v);
    return json(200, { object: 'list', data: PRICES.filter((p) => keys.includes(p.lookup_key)) });
  }
  if (req.method === 'POST' && path === '/v1/customers') {
    const key = req.headers['idempotency-key'];
    const known = key ? byIdempotency.get(key) : undefined;
    const id = known ?? next('cus');
    if (!known) customers.set(id, Object.fromEntries(params));
    if (key) byIdempotency.set(key, id);
    return json(200, { id, object: 'customer' });
  }
  const customer = /^\/v1\/customers\/(\w+)$/.exec(path);
  if (customer) {
    const c = customers.get(customer[1]);
    if (!c || c.deleted) return missing('customer');
    if (req.method === 'DELETE') {
      // Deleted: every subscription it has ends at once.
      c.deleted = true;
      for (const x of subscriptions.values()) if (x.customer === customer[1]) x.status = 'canceled';
      return json(200, { id: customer[1], object: 'customer', deleted: true });
    }
    if (req.method === 'POST') Object.assign(c, Object.fromEntries(params));
    return json(200, { id: customer[1], object: 'customer' });
  }
  if (req.method === 'GET' && path === '/v1/subscriptions') {
    const of = params.get('customer');
    return json(200, {
      object: 'list',
      data: [...subscriptions.values()].filter((x) => x.customer === of),
    });
  }
  if (req.method === 'GET' && path === '/v1/checkout/sessions') {
    const of = params.get('customer');
    const status = params.get('status');
    return json(200, {
      object: 'list',
      data: [...sessions.values()]
        .filter((x) => x.customer === of && (!status || x.status === status))
        .map((x) => ({ id: x.id, object: 'checkout.session', status: x.status })),
    });
  }
  const expire = /^\/v1\/checkout\/sessions\/(\w+)\/expire$/.exec(path);
  if (req.method === 'POST' && expire) {
    const x = sessions.get(expire[1]);
    if (!x) return missing('checkout session');
    if (x.status === 'open') x.status = 'expired';
    return json(200, { id: x.id, object: 'checkout.session', status: x.status });
  }
  if (req.method === 'POST' && path === '/v1/checkout/sessions') {
    const of = customers.get(params.get('customer'));
    if (!of || of.deleted) return missing('customer');
    const id = next('cs');
    sessions.set(id, {
      id,
      status: 'open',
      customer: params.get('customer'),
      price: params.get('line_items[0][price]'),
      payer: params.get('subscription_data[metadata][caishy_payer]'),
      success_url: params.get('success_url'),
      cancel_url: params.get('cancel_url'),
    });
    return json(200, { id, object: 'checkout.session', url: `${origin}/checkout/${id}` });
  }
  if (req.method === 'POST' && path === '/v1/billing_portal/sessions')
    return json(200, {
      object: 'billing_portal.session',
      url: `${origin}/portal/${params.get('customer')}?return=${encodeURIComponent(params.get('return_url') ?? '/')}`,
    });
  const sub = /^\/v1\/subscriptions\/(\w+)$/.exec(path);
  if (sub) {
    const s = subscriptions.get(sub[1]);
    if (!s) return missing('subscription');
    if (req.method === 'DELETE') s.status = 'canceled';
    return json(200, s);
  }
  json(404, { error: { type: 'invalid_request_error', message: `No route ${path}` } });
});

server.listen(port, '127.0.0.1', () => console.log(`Stripe stub on ${origin}`));
