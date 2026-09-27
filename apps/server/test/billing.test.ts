import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reconcileBilling } from '../src/lib/billing';
import { runDueJobs } from '../src/lib/jobs';
import { STRIPE_VERSION, stripeSignature } from '../src/lib/stripe';
import { type Client, createTestApp, signup, type TestApp } from './helpers';
import { type StripeStub, type StubSubscription, stripeStub } from './stripe-stub';

const SECRET = 'whsec_test_0123456789abcdef';
const ADMIN = 'operator-token-for-the-billing-test-0123456789';
const PASSWORD = 'correct horse battery';
let t: TestApp;
let off: TestApp;
let stub: StripeStub;
let noor: Client;
let sam: Client;
let teen: Client;
/** Paid for at Stripe while Caishy took none of what claimed to be its word. */
let unreported: { subscription: StubSubscription; event: object };

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
const PRO = { plan: 'pro', interval: 'month' };
/** The Checkout session a checkout asked Stripe for, by its URL. */
const sessionOf = (url: string) => url.split('/').pop() as string;
const planOf = async (c: Client) => (await c.get('/v1/me/plan')).plan as string;
const planOfOrg = async (id: string) =>
  (
    await t.ctx.db
      .selectFrom('organizations')
      .select('plan')
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
  ).plan;
const operator = (url: string, body: object) =>
  t.app.inject({
    method: 'PUT',
    url: `/v1/admin${url}`,
    headers: { authorization: `Bearer ${ADMIN}` },
    payload: body,
  });
const asked = (method: string, path: string) =>
  stub.requests.filter((r) => r.method === method && r.path === path);
/** Checkout, paid, and Stripe's word of it taken: the plan it's for is on. */
async function buy(c: Client, body: object = PRO) {
  const res = await checkout(c, body);
  expect(res.statusCode).toBe(200);
  const paid = stub.pay(sessionOf(res.json().url));
  expect((await deliver(paid.event)).statusCode).toBe(200);
  return paid;
}
async function until(done: () => boolean) {
  for (let i = 0; i < 500 && !done(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(done()).toBe(true);
}

beforeAll(async () => {
  stub = await stripeStub();
  t = await createTestApp({
    STRIPE_SECRET_KEY: 'sk_test_stub_0123456789abcdef',
    STRIPE_WEBHOOK_SECRET: SECRET,
    STRIPE_API_BASE: stub.url,
    ADMIN_TOKEN: ADMIN,
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
    const tried = await someone.req('POST', '/v1/billing/checkout', PRO);
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
    const prices = stub.requests.find((r) => r.path === '/v1/prices');
    expect(prices?.headers['stripe-version']).toBe(STRIPE_VERSION);
    expect((await teen.get('/v1/billing')).unavailable).toBe(
      'Plans are bought by someone 18 or over.',
    );
    const refused = await checkout(teen, PRO);
    expect(refused.statusCode).toBe(403);
    // Pro is for you; Business is for an organization.
    expect((await checkout(noor, { plan: 'business', interval: 'month' })).statusCode).toBe(400);
  });

  it('checkout makes one customer and a session for the price, and comes back here', async () => {
    const first = await checkout(noor, { plan: 'pro', interval: 'year' });
    expect(first.statusCode).toBe(200);
    const again = await checkout(noor, PRO);
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
    // Only the newest can be paid: the one before it closed as the new one opened.
    expect([a?.status, b?.status]).toEqual(['expired', 'open']);
    expect(() => stub.pay(a?.id ?? '')).toThrow(/expired/);
    // Before each, what Stripe has of theirs was asked.
    const listed = asked('GET', '/v1/subscriptions').filter(
      (r) => r.params.get('customer') === a?.customer,
    );
    expect(listed).toHaveLength(2);
  });

  it('two taps at once make one customer, and leave one Checkout to pay', async () => {
    const dee = await signup(t, { displayName: 'Dee Double' });
    const both = await Promise.all([checkout(dee, PRO), checkout(dee, PRO)]);
    expect(both.map((r) => r.statusCode)).toEqual([200, 200]);
    const [a, b] = both.map((r) => stub.sessions.get(sessionOf(r.json().url)));
    expect(a?.customer).toBe(b?.customer);
    const theirs = [...stub.customers.values()].filter(
      (c) => c.params.get('metadata[caishy_user_id]') === dee.user.id,
    );
    expect(theirs).toHaveLength(1);
    expect([a?.status, b?.status].filter((s) => s === 'open')).toHaveLength(1);
  });

  it('only what Stripe signed is taken, and only just now', async () => {
    const url = (await checkout(noor, PRO)).json().url;
    unreported = stub.pay(sessionOf(url));
    const { event } = unreported;
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

  it('paid before Stripe’s word came: it isn’t sold again, and it’s on', async () => {
    // Nothing Caishy has heard says so, but Stripe does: Checkout asks it first.
    const twice = await checkout(noor, { plan: 'pro', interval: 'year' });
    expect(twice.statusCode).toBe(409);
    expect(twice.json().error.code).toBe('already_subscribed');
    expect(await planOf(noor)).toBe('pro');
    // Its word, when it comes, changes nothing more.
    expect((await deliver(unreported.event)).statusCode).toBe(200);
    expect(await planOf(noor)).toBe('pro');
  });

  it('paid, Pro is on; once it ends, it’s off; a payment being tried again keeps it', async () => {
    const { subscription } = unreported;
    expect((await noor.get('/v1/billing')).subscription).toEqual({
      plan: 'pro',
      interval: 'month',
      status: 'active',
      periodEnd: '2026-10-23T14:00:00.000Z',
      cancelAtPeriodEnd: false,
      amount: 600,
      currency: 'eur',
    });
    // Its own price is what's shown (one kept from before a price change, say), not today's.
    const [item] = subscription.items.data;
    if (!item) throw new Error('no item');
    await deliver(
      stub.change(subscription.id, {
        items: { data: [{ price: { ...item.price, unit_amount: 450 } }] },
      }),
    );
    const view = await noor.get('/v1/billing');
    expect([view.subscription.amount, view.prices[0].amount]).toEqual([450, 600]);
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
    const kept = stub.subscriptions.get(subscription.id);
    if (!kept) throw new Error('no subscription');
    kept.status = 'active';
    await deliver(ended);
    expect(await planOf(noor)).toBe('pro');
    kept.status = 'canceled';
    expect((await deliver(ended)).statusCode).toBe(200);
    expect(await planOf(noor)).toBe('pro');
    // Whatever an event says, what's kept is what Stripe says now.
    await deliver(stub.change(subscription.id, {}, 'customer.subscription.updated'));
    expect(await planOf(noor)).toBe('personal');
    expect((await noor.get('/v1/billing')).subscription).toBeNull();
  });

  it('the portal is for someone who has paid, with who they are today', async () => {
    expect((await sam.req('POST', '/v1/billing/portal', {})).statusCode).toBe(404);
    const portal = await noor.req('POST', '/v1/billing/portal', {});
    expect(portal.statusCode).toBe(200);
    expect(portal.json().url).toMatch(/^https:\/\/billing\.stripe\.test\/cus_/);
    const session = asked('POST', '/v1/billing_portal/sessions').at(-1);
    expect(session?.params.get('return_url')).toBe('http://localhost:8787/settings/plan');
    const customer = session?.params.get('customer') ?? '';
    // Its name and email at Stripe are brought up to date first.
    const updated = asked('POST', `/v1/customers/${customer}`).at(-1);
    expect(updated?.params.get('name')).toBe('Noor Haddad');
    expect(updated?.params.get('email')).toBe('noor@example.com');
    expect((await noor.get('/v1/billing')).canManage).toBe(true);
  });

  it('starting Checkout or the portal is limited to thirty an hour', async () => {
    const rae = await signup(t, { displayName: 'Rae Rapid' });
    for (let i = 0; i < 30; i++)
      expect((await rae.req('POST', '/v1/billing/portal', {})).statusCode).toBe(404);
    expect((await rae.req('POST', '/v1/billing/portal', {})).statusCode).toBe(429);
    expect((await checkout(rae, PRO)).statusCode).toBe(429);
    // Someone else's allowance is their own.
    expect((await checkout(sam, PRO)).statusCode).toBe(200);
  });

  it('an operator’s plan is theirs: billing never changes it, nor sells what it includes', async () => {
    // On a plan the operator set, there's nothing more to buy.
    expect(
      (await operator(`/people/${sam.user.handle}/plan`, { plan: 'enterprise' })).statusCode,
    ).toBe(200);
    expect((await sam.get('/v1/billing')).unavailable).toBe('You’re on Enterprise already.');
    const included = await checkout(sam, PRO);
    expect(included.statusCode).toBe(409);
    expect(included.json().error.code).toBe('plan_included');
    // A free Pro from the operator outlasts the subscription it takes over from.
    const lea = await signup(t, { displayName: 'Lea Gift' });
    const { subscription } = await buy(lea);
    expect(await planOf(lea)).toBe('pro');
    expect((await operator(`/people/${lea.user.handle}/plan`, { plan: 'pro' })).statusCode).toBe(
      200,
    );
    await deliver(
      stub.change(subscription.id, { status: 'canceled' }, 'customer.subscription.deleted'),
    );
    expect(await planOf(lea)).toBe('pro');
    // Handed back to the plan everyone starts on, it's billing's again.
    expect(
      (await operator(`/people/${lea.user.handle}/plan`, { plan: 'personal' })).statusCode,
    ).toBe(200);
    expect((await lea.get('/v1/billing')).unavailable).toBeNull();
    // Someone paying keeps what they pay for until it ends: never charged for a plan they lost.
    const omar = await signup(t, { displayName: 'Omar Paying' });
    await buy(omar);
    const down = await operator(`/people/${omar.user.handle}/plan`, { plan: 'personal' });
    expect(down.statusCode).toBe(409);
    expect(down.json().error.code).toBe('paying');
    expect(await planOf(omar)).toBe('pro');
    // Something else sold to the same customer isn't Caishy's to act on.
    expect((await deliver(stub.foreign(subscription.customer).event)).statusCode).toBe(200);
    expect(await planOf(lea)).toBe('personal');
    // The same for an organization.
    const shop = (
      await lea.post('/v1/orgs', { name: 'Lea’s Gifts', handle: 'leasgifts', kind: 'shop' })
    ).org;
    expect((await operator(`/orgs/${shop.handle}/plan`, { plan: 'business' })).statusCode).toBe(
      200,
    );
    expect((await lea.get(`/v1/orgs/${shop.id}/billing`)).unavailable).toBe(
      'It’s on Business already.',
    );
    const orgs = await checkout(lea, { plan: 'business', interval: 'month', orgId: shop.id });
    expect(orgs.statusCode).toBe(409);
  });

  it('Business is bought for an organization by its owner or an admin, never anyone else', async () => {
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
    const business = { plan: 'business', interval: 'month', orgId: org.id };
    expect((await sam.req('GET', `/v1/orgs/${org.id}/billing`)).statusCode).toBe(403);
    expect((await checkout(sam, business)).statusCode).toBe(403);
    expect((await sam.req('POST', '/v1/billing/portal', { orgId: org.id })).statusCode).toBe(403);
    // Made an admin, Sam buys it; its receipts and notices go to its owner, not to him.
    await noor.patch(`/v1/orgs/${org.id}/members/${sam.user.id}`, { role: 'admin' });
    const bought = await checkout(sam, business);
    expect(bought.statusCode).toBe(200);
    const session = stub.sessions.get(sessionOf(bought.json().url));
    expect(session?.params.get('success_url')).toBe(
      `http://localhost:8787/o/${org.handle}?billing=done`,
    );
    const customer = stub.customers.get(session?.customer ?? '');
    expect(customer?.params.get('metadata[caishy_org_id]')).toBe(org.id);
    expect(customer?.params.get('name')).toBe('Haddad Clinic');
    expect(customer?.params.get('email')).toBe('noor@example.com');
    const { subscription, event } = stub.pay(sessionOf(bought.json().url));
    await deliver(event);
    expect(await planOfOrg(org.id)).toBe('business');
    // Noor's own plan is hers: the organization's doesn't change it.
    expect(await planOf(noor)).toBe('personal');
    await deliver(stub.change(subscription.id, { status: 'unpaid' }));
    expect(await planOfOrg(org.id)).toBe('free');
  });

  it('an organization that closes stops paying at once', async () => {
    const ada = await signup(t, { displayName: 'Ada Owner' });
    const shop = (await ada.post('/v1/orgs', { name: 'Ada Shop', handle: 'adashop', kind: 'shop' }))
      .org;
    const left = await buy(ada, { plan: 'business', interval: 'month', orgId: shop.id });
    expect(await planOfOrg(shop.id)).toBe('business');
    // The only person on its team leaves: it closes, and its customer at Stripe ends with it.
    expect((await ada.req('DELETE', `/v1/orgs/${shop.id}/members/${ada.user.id}`)).statusCode).toBe(
      200,
    );
    expect(asked('DELETE', `/v1/customers/${left.subscription.customer}`)).toHaveLength(1);
    expect(stub.subscriptions.get(left.subscription.id)?.status).toBe('canceled');
    // The same when the account that ran it is deleted.
    const bea = await signup(t, { displayName: 'Bea Owner' });
    const cafe = (await bea.post('/v1/orgs', { name: 'Bea Cafe', handle: 'beacafe', kind: 'shop' }))
      .org;
    const deleted = await buy(bea, { plan: 'business', interval: 'year', orgId: cafe.id });
    expect((await bea.req('DELETE', '/v1/me', { password: PASSWORD })).statusCode).toBeLessThan(
      300,
    );
    expect(stub.subscriptions.get(deleted.subscription.id)?.status).toBe('canceled');
    const closed = await t.ctx.db
      .selectFrom('billing_customers')
      .select(['org_id', 'closed_at'])
      .where('id', 'in', [left.subscription.customer, deleted.subscription.customer])
      .execute();
    expect(closed.every((c) => c.closed_at !== null)).toBe(true);
  });

  it('deleting an account ends what it pays for, even what Stripe hasn’t told of yet', async () => {
    const ivy = await signup(t, { displayName: 'Ivy Payer' });
    const url = (await checkout(ivy, PRO)).json().url;
    // Paid, and Stripe's word of it hasn't come.
    const { subscription, event } = stub.pay(sessionOf(url));
    expect(await planOf(ivy)).toBe('personal');
    const gone = await ivy.req('DELETE', '/v1/me', { password: PASSWORD });
    expect(gone.statusCode).toBeLessThan(300);
    // Its customer is deleted at Stripe, which ends every subscription it has.
    expect(asked('DELETE', `/v1/customers/${subscription.customer}`)).toHaveLength(1);
    expect(stub.subscriptions.get(subscription.id)?.status).toBe('canceled');
    // Its word, coming late, starts nothing again.
    expect((await deliver(event)).statusCode).toBe(200);
    const kept = await t.ctx.db
      .selectFrom('billing_customers')
      .selectAll()
      .where('id', '=', subscription.customer)
      .executeTakeFirstOrThrow();
    expect(kept.user_id).toBeNull();
    expect(kept.closed_at).not.toBeNull();
  });

  it('deleting an account never waits on Stripe: a job ends what it paid for once it’s back', async () => {
    const jo = await signup(t, { displayName: 'Jo Away' });
    const { subscription } = await buy(jo);
    stub.outage(true);
    try {
      const gone = await jo.req('DELETE', '/v1/me', { password: PASSWORD });
      expect(gone.statusCode).toBeLessThan(300);
    } finally {
      stub.outage(false);
    }
    expect(stub.subscriptions.get(subscription.id)?.status).toBe('active');
    const job = await t.ctx.db
      .selectFrom('jobs')
      .select(['payload', 'max_attempts'])
      .where('kind', '=', 'billing.close')
      .where('done_at', 'is', null)
      .executeTakeFirstOrThrow();
    expect(job.payload).toEqual({ customerId: subscription.customer });
    await runDueJobs(t.ctx);
    expect(stub.subscriptions.get(subscription.id)?.status).toBe('canceled');
    // Away for longer than the job keeps trying: the periodic check ends it instead.
    const lou = await signup(t, { displayName: 'Lou Longer' });
    const paid = await buy(lou);
    stub.outage(true);
    try {
      expect((await lou.req('DELETE', '/v1/me', { password: PASSWORD })).statusCode).toBeLessThan(
        300,
      );
    } finally {
      stub.outage(false);
    }
    await t.ctx.db
      .updateTable('jobs')
      .set({ attempts: 20 })
      .where('dedupe_key', '=', `billing.close:${paid.subscription.customer}`)
      .execute();
    await runDueJobs(t.ctx);
    expect(stub.subscriptions.get(paid.subscription.id)?.status).toBe('active');
    await reconcileBilling(t.ctx);
    expect(stub.subscriptions.get(paid.subscription.id)?.status).toBe('canceled');
  });

  it('what’s paid for someone gone ends as soon as Stripe says there’s something', async () => {
    // A Checkout opened just as the account went, and paid after.
    const ned = await signup(t, { displayName: 'Ned Late' });
    const url = (await checkout(ned, PRO)).json().url;
    const { subscription, event } = stub.pay(sessionOf(url));
    await t.ctx.db
      .updateTable('billing_customers')
      .set({ user_id: null })
      .where('id', '=', subscription.customer)
      .execute();
    expect((await deliver(event)).statusCode).toBe(200);
    await runDueJobs(t.ctx);
    expect(asked('DELETE', `/v1/customers/${subscription.customer}`)).toHaveLength(1);
    expect(stub.subscriptions.get(subscription.id)?.status).toBe('canceled');
  });

  it('a customer Stripe no longer has is forgotten, and one of the other mode never seen', async () => {
    const tia = await signup(t, { displayName: 'Tia Test' });
    // Made with a live key before: a test key never sees it, nor what it paid for.
    await t.ctx.db
      .insertInto('billing_customers')
      .values({ id: 'cus_live_tia', livemode: true, user_id: tia.user.id })
      .execute();
    await t.ctx.db
      .insertInto('billing_subscriptions')
      .values({
        id: 'sub_live_tia',
        customer_id: 'cus_live_tia',
        plan: 'pro',
        interval: 'month',
        status: 'active',
        amount: 600,
        currency: 'eur',
      })
      .execute();
    expect(await tia.get('/v1/billing')).toMatchObject({ subscription: null, canManage: false });
    const first = await checkout(tia, PRO);
    expect(first.statusCode).toBe(200);
    const was = stub.sessions.get(sessionOf(first.json().url))?.customer ?? '';
    expect(was).not.toBe('cus_live_tia');
    // Deleted in Stripe's dashboard: forgotten here, and a new one made in its place.
    const deleted = stub.customers.get(was);
    if (!deleted) throw new Error('no customer');
    deleted.deleted = true;
    const second = await checkout(tia, PRO);
    expect(second.statusCode).toBe(200);
    const now = stub.sessions.get(sessionOf(second.json().url))?.customer ?? '';
    expect(now).toMatch(/^cus_/);
    expect(now).not.toBe(was);
    // A subscription Stripe no longer has pays for nothing, once it's asked again.
    const { subscription, event } = stub.pay(sessionOf(second.json().url));
    await deliver(event);
    expect(await planOf(tia)).toBe('pro');
    stub.subscriptions.delete(subscription.id);
    await reconcileBilling(t.ctx);
    expect(await planOf(tia)).toBe('personal');
  });

  it('a price moved to a new one: whoever pays the old one is still followed', async () => {
    const kai = await signup(t, { displayName: 'Kai Longtime' });
    const { subscription } = await buy(kai);
    // Pro's price goes up: a new price takes the lookup key, and Kai's keeps none. Kai's is older
    // than Checkout saying who it's for: what Caishy knew of it is what's left.
    const moved = (s: StubSubscription) => {
      for (const item of s.items.data) item.price = { ...item.price, lookup_key: null };
    };
    moved(subscription);
    subscription.metadata = {};
    await deliver(stub.change(subscription.id, { status: 'past_due' }));
    expect(await planOf(kai)).toBe('pro');
    expect((await kai.get('/v1/billing')).subscription.status).toBe('past_due');
    await deliver(
      stub.change(subscription.id, { status: 'canceled' }, 'customer.subscription.deleted'),
    );
    expect(await planOf(kai)).toBe('personal');
    // One paid for then, before Caishy heard of it: known by what its Checkout put on it.
    const url = (await checkout(kai, { plan: 'pro', interval: 'year' })).json().url;
    const later = stub.pay(sessionOf(url));
    moved(later.subscription);
    await deliver(later.event);
    expect(await planOf(kai)).toBe('pro');
    expect((await kai.get('/v1/billing')).subscription.interval).toBe('year');
  });

  it('two deliveries at once: what’s kept is what Stripe said last', async () => {
    const bo = await signup(t, { displayName: 'Bo Racing' });
    const { subscription } = await buy(bo);
    const gets = () => asked('GET', `/v1/subscriptions/${subscription.id}`).length;
    const before = gets();
    // A's answer is 'active', and slow to come; meanwhile it's cancelled, and B is sent.
    const release = stub.hold(subscription.id);
    const a = Promise.resolve(deliver(stub.change(subscription.id, {})));
    await until(() => gets() > before);
    const b = Promise.resolve(
      deliver(
        stub.change(subscription.id, { status: 'canceled' }, 'customer.subscription.deleted'),
      ),
    );
    // B waits its turn: it hasn't asked Stripe yet.
    await new Promise((r) => setTimeout(r, 150));
    expect(gets()).toBe(before + 1);
    release();
    expect((await a).statusCode).toBe(200);
    expect((await b).statusCode).toBe(200);
    expect(gets()).toBe(before + 2);
    expect(await planOf(bo)).toBe('personal');
  });

  it('every so often, what Stripe says is taken even if its word never came', async () => {
    const max = await signup(t, { displayName: 'Max Quiet' });
    const url = (await checkout(max, PRO)).json().url;
    const { subscription } = stub.pay(sessionOf(url));
    await reconcileBilling(t.ctx);
    expect(await planOf(max)).toBe('pro');
    const kept = stub.subscriptions.get(subscription.id);
    if (!kept) throw new Error('no subscription');
    kept.status = 'canceled';
    await reconcileBilling(t.ctx);
    expect(await planOf(max)).toBe('personal');
  });

  it('a listing from a moment ago never undoes what Stripe said since', async () => {
    const ren = await signup(t, { displayName: 'Ren Racing' });
    const { subscription } = await buy(ren);
    // The check lists Ren's subscriptions ('active'), slowly; meanwhile it's cancelled, and told.
    const listings = () =>
      asked('GET', '/v1/subscriptions').filter(
        (r) => r.params.get('customer') === subscription.customer,
      ).length;
    const before = listings();
    const release = stub.hold(`list:${subscription.customer}`);
    const check = reconcileBilling(t.ctx);
    await until(() => listings() > before);
    await deliver(
      stub.change(subscription.id, { status: 'canceled' }, 'customer.subscription.deleted'),
    );
    expect(await planOf(ren)).toBe('personal');
    release();
    await check;
    expect(await planOf(ren)).toBe('personal');
  });
});
