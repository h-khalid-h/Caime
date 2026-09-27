import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STRIPE_VERSION, stripeSignature } from '../src/lib/stripe';
import { type Client, createTestApp, signup, type TestApp } from './helpers';
import { type StripeStub, stripeStub } from './stripe-stub';

const SECRET = 'whsec_test_0123456789abcdef';
let t: TestApp;
let off: TestApp;
let stub: StripeStub;
let noor: Client;
let sam: Client;
let teen: Client;

/** Send Stripe's event as Stripe would: signed, now, with the body exactly as signed. */
const deliver = (event: object, opts: { secret?: string; at?: number; body?: string } = {}) => {
  const body = opts.body ?? JSON.stringify(event);
  const at = opts.at ?? Math.floor(t.ctx.now().getTime() / 1000);
  return t.app.inject({
    method: 'POST',
    url: '/v1/billing/webhook',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': stripeSignature(opts.secret ?? SECRET, body, at),
    },
    payload: body,
  });
};
const checkout = (c: Client, body: object) => c.req('POST', '/v1/billing/checkout', body);
/** The Checkout session a checkout asked Stripe for, by its URL. */
const sessionOf = (url: string) => url.split('/').pop() as string;
const planOf = async (c: Client) => (await c.get('/v1/me/plan')).plan as string;

beforeAll(async () => {
  stub = await stripeStub();
  t = await createTestApp({
    STRIPE_SECRET_KEY: 'sk_test_stub_0123456789abcdef',
    STRIPE_WEBHOOK_SECRET: SECRET,
    STRIPE_API_BASE: stub.url,
  });
  off = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad', email: 'noor@example.com' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  teen = await signup(t, { displayName: 'Rami Young', birthYear: 2011 });
});
afterAll(async () => {
  await t.close();
  await off.close();
  await stub.close();
});

describe('billing (PRD §84, R25)', () => {
  it('without Stripe set up, nothing can be bought, and says so', async () => {
    const someone = await signup(off, { displayName: 'Ola Offline' });
    expect(await someone.get('/v1/billing')).toEqual({
      enabled: false,
      prices: [],
      subscription: null,
      canManage: false,
      unavailable: null,
    });
    const tried = await someone.req('POST', '/v1/billing/checkout', {
      plan: 'pro',
      interval: 'month',
    });
    expect(tried.statusCode).toBe(503);
    expect(
      (await off.app.inject({ method: 'POST', url: '/v1/billing/webhook', payload: {} }))
        .statusCode,
    ).toBe(404);
  });

  it('shows Pro’s prices from Stripe, and nobody under 18 buys it', async () => {
    const view = await noor.get('/v1/billing');
    expect(view).toMatchObject({ enabled: true, subscription: null, canManage: false });
    expect(view.prices).toEqual([
      { plan: 'pro', interval: 'month', amount: 600, currency: 'eur' },
      { plan: 'pro', interval: 'year', amount: 6000, currency: 'eur' },
    ]);
    // Every call is pinned to one API version, with the key.
    const asked = stub.requests.find((r) => r.path === '/v1/prices');
    expect(asked?.headers['stripe-version']).toBe(STRIPE_VERSION);
    expect((await teen.get('/v1/billing')).unavailable).toBe(
      'Plans are bought by someone 18 or over.',
    );
    const refused = await checkout(teen, { plan: 'pro', interval: 'month' });
    expect(refused.statusCode).toBe(403);
    // Pro is for you; Business is for an organization.
    expect((await checkout(noor, { plan: 'business', interval: 'month' })).statusCode).toBe(400);
  });

  it('checkout makes one customer and a session for the price, and comes back here', async () => {
    const first = await checkout(noor, { plan: 'pro', interval: 'year' });
    expect(first.statusCode).toBe(200);
    const again = await checkout(noor, { plan: 'pro', interval: 'month' });
    const [a, b] = [first, again].map((r) => stub.sessions.get(sessionOf(r.json().url)));
    // One customer, however often they start.
    expect(a?.customer).toMatch(/^cus_/);
    expect(b?.customer).toBe(a?.customer);
    expect(stub.customers.size).toBe(1);
    const customer = stub.customers.get(a?.customer ?? '');
    expect(customer?.params.get('email')).toBe('noor@example.com');
    expect(customer?.params.get('metadata[caishy_user_id]')).toBe(noor.user.id);
    expect(a?.price).toBe('price_pro_y');
    expect(b?.price).toBe('price_pro_m');
    expect(Object.fromEntries(a?.params ?? [])).toMatchObject({
      mode: 'subscription',
      'line_items[0][quantity]': '1',
      success_url: 'http://localhost:8787/settings/plan?billing=done',
      cancel_url: 'http://localhost:8787/settings/plan?billing=cancelled',
      'subscription_data[metadata][caishy_payer]': `user:${noor.user.id}`,
    });
  });

  it('only what Stripe signed is taken, and only just now', async () => {
    const url = (await checkout(noor, { plan: 'pro', interval: 'month' })).json().url;
    const { event } = stub.pay(sessionOf(url));
    expect((await deliver(event, { secret: 'whsec_somebody_else_0000' })).statusCode).toBe(400);
    const now = Math.floor(t.ctx.now().getTime() / 1000);
    expect((await deliver(event, { at: now - 600 })).statusCode).toBe(400);
    const unsigned = await t.app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(event),
    });
    expect(unsigned.statusCode).toBe(400);
    // Signed, but not what was sent.
    const body = JSON.stringify(event);
    const forged = await t.app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignature(SECRET, body, now),
      },
      payload: body.replace('checkout.session.completed', 'customer.subscription.created'),
    });
    expect(forged.statusCode).toBe(400);
    expect(await planOf(noor)).toBe('personal');
  });

  it('paid, Pro is on; once it ends, it’s off; a payment being tried again keeps it', async () => {
    const url = (await checkout(noor, { plan: 'pro', interval: 'month' })).json().url;
    const { subscription, event } = stub.pay(sessionOf(url));
    expect((await deliver(event)).statusCode).toBe(200);
    expect(await planOf(noor)).toBe('pro');
    expect((await noor.get('/v1/billing')).subscription).toEqual({
      plan: 'pro',
      interval: 'month',
      status: 'active',
      periodEnd: '2026-10-23T14:00:00.000Z',
      cancelAtPeriodEnd: false,
    });
    // Paying already: never bought twice.
    const twice = await checkout(noor, { plan: 'pro', interval: 'year' });
    expect(twice.statusCode).toBe(409);
    expect(twice.json().error.code).toBe('already_subscribed');
    // A card that failed, being tried again: still Pro.
    await deliver(stub.change(subscription.id, { status: 'past_due' }));
    expect(await planOf(noor)).toBe('pro');
    // Set to end: still Pro until it does, and it says so.
    await deliver(stub.change(subscription.id, { status: 'active', cancel_at_period_end: true }));
    expect((await noor.get('/v1/billing')).subscription.cancelAtPeriodEnd).toBe(true);
    // The same event again changes nothing twice.
    const ended = stub.change(
      subscription.id,
      { status: 'canceled' },
      'customer.subscription.deleted',
    );
    stub.subscriptions.get(subscription.id)!.status = 'active';
    await deliver(ended);
    expect(await planOf(noor)).toBe('pro');
    stub.subscriptions.get(subscription.id)!.status = 'canceled';
    expect((await deliver(ended)).statusCode).toBe(200);
    expect(await planOf(noor)).toBe('pro');
    // Whatever an event says, what's kept is what Stripe says now.
    await deliver(stub.change(subscription.id, {}, 'customer.subscription.updated'));
    expect(await planOf(noor)).toBe('personal');
    expect((await noor.get('/v1/billing')).subscription).toBeNull();
  });

  it('the portal is for someone who has paid', async () => {
    expect((await sam.req('POST', '/v1/billing/portal', {})).statusCode).toBe(404);
    const portal = await noor.req('POST', '/v1/billing/portal', {});
    expect(portal.statusCode).toBe(200);
    expect(portal.json().url).toMatch(/^https:\/\/billing\.stripe\.test\/cus_/);
    const asked = stub.requests.filter((r) => r.path === '/v1/billing_portal/sessions').at(-1);
    expect(asked?.params.get('return_url')).toBe('http://localhost:8787/settings/plan');
    expect((await noor.get('/v1/billing')).canManage).toBe(true);
  });

  it('an operator’s plan stays whatever Stripe says; nor does anything else Stripe sells count', async () => {
    await t.ctx.db
      .updateTable('users')
      .set({ plan: 'enterprise' })
      .where('id', '=', sam.user.id)
      .execute();
    const url = (await checkout(sam, { plan: 'pro', interval: 'month' })).json().url;
    const { subscription, event } = stub.pay(sessionOf(url));
    await deliver(event);
    expect(await planOf(sam)).toBe('enterprise');
    await deliver(
      stub.change(subscription.id, { status: 'canceled' }, 'customer.subscription.deleted'),
    );
    expect(await planOf(sam)).toBe('enterprise');
    await t.ctx.db
      .updateTable('users')
      .set({ plan: 'personal' })
      .where('id', '=', sam.user.id)
      .execute();
    // Something else sold to the same customer isn't Caishy's to act on.
    const customer = stub.sessions.get(sessionOf(url))?.customer ?? '';
    expect((await deliver(stub.foreign(customer).event)).statusCode).toBe(200);
    expect(await planOf(sam)).toBe('personal');
  });

  it('Business is bought for an organization by its owner or an admin', async () => {
    const org = (
      await noor.post('/v1/orgs', { name: 'Haddad Clinic', handle: 'haddadclinic', kind: 'clinic' })
    ).org;
    // Sam is on the team, but doesn't run it.
    const request = await noor.post('/v1/connections/requests', { toUserId: sam.user.id });
    await sam.post(`/v1/connections/requests/${request.requestId}/accept`, {});
    await noor.post(`/v1/orgs/${org.id}/members`, { userIds: [sam.user.id] });
    const view = await noor.get(`/v1/orgs/${org.id}/billing`);
    expect(view.prices.map((p: any) => [p.plan, p.interval, p.amount])).toEqual([
      ['business', 'month', 2900],
      ['business', 'year', 29000],
    ]);
    expect((await sam.req('GET', `/v1/orgs/${org.id}/billing`)).statusCode).toBeGreaterThanOrEqual(
      403,
    );
    const bought = await checkout(noor, { plan: 'business', interval: 'month', orgId: org.id });
    expect(bought.statusCode).toBe(200);
    const session = stub.sessions.get(sessionOf(bought.json().url));
    expect(session?.params.get('success_url')).toBe(
      `http://localhost:8787/o/${org.handle}?billing=done`,
    );
    expect(stub.customers.get(session?.customer ?? '')?.params.get('metadata[caishy_org_id]')).toBe(
      org.id,
    );
    const { subscription, event } = stub.pay(sessionOf(bought.json().url));
    await deliver(event);
    const planOfOrg = async () =>
      (
        await t.ctx.db
          .selectFrom('organizations')
          .select('plan')
          .where('id', '=', org.id)
          .executeTakeFirstOrThrow()
      ).plan;
    expect(await planOfOrg()).toBe('business');
    // Noor's own plan is hers: the organization's doesn't change it.
    expect(await planOf(noor)).toBe('personal');
    await deliver(stub.change(subscription.id, { status: 'unpaid' }));
    expect(await planOfOrg()).toBe('free');
  });

  it('deleting an account ends what it pays for, first', async () => {
    const ivy = await signup(t, { displayName: 'Ivy Payer' });
    const url = (await checkout(ivy, { plan: 'pro', interval: 'month' })).json().url;
    const { subscription, event } = stub.pay(sessionOf(url));
    await deliver(event);
    expect(await planOf(ivy)).toBe('pro');
    const gone = await ivy.req('DELETE', '/v1/me', { password: 'correct horse battery' });
    expect(gone.statusCode).toBeLessThan(300);
    expect(stub.subscriptions.get(subscription.id)?.status).toBe('canceled');
    expect(
      stub.requests.some(
        (r) => r.method === 'DELETE' && r.path === `/v1/subscriptions/${subscription.id}`,
      ),
    ).toBe(true);
  });
});
