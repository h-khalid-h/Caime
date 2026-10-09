/**
 * An organization's own checkout (R65): its owner connects its own Stripe account on Stripe's
 * consent page; a Pay card the organization is paid by then offers paying by card, on a Checkout
 * Session made on the organization's account; the card is marked paid only from what Stripe
 * says when asked, whether the payer came back or the webhook named the card.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stripeSignature } from '../src/lib/stripe';
import { type Client, createTestApp, signup, type TestApp } from './helpers';
import { type ConnectStub, connectStub, STUB_KEY } from './stripe-connect-stub';

const SECRET = 'whsec_connect_0123456789';
let stub: ConnectStub;
let t: TestApp;
let noor: Client; // owns the clinic
let omar: Client; // on its team, not an admin
let lina: Client; // its customer
let orgId: string;
let convo: string;
let card: string;

const ask = (amount: number) =>
  omar.req('POST', `/v1/conversations/${convo}/messages`, {
    clientId: uuidv4(),
    kind: 'kit',
    payload: {
      kit: 'payment_request',
      fields: { direction: 'ask', amount: { value: amount, currency: 'EGP' }, note: 'Cleaning' },
    },
  });
const hook = (event: object, secret = SECRET) => {
  const body = JSON.stringify(event);
  return t.app.inject({
    method: 'POST',
    url: '/v1/checkout/stripe/webhook',
    payload: body,
    headers: {
      'content-type': 'application/json',
      'stripe-signature': stripeSignature(secret, body, Math.floor(t.clock.now.getTime() / 1000)),
    },
  });
};
/** Back from Stripe in the owner's own browser (its session), unless said otherwise. */
const back = (query: string, as: Client | null = noor) =>
  t.app.inject({
    method: 'GET',
    url: `/v1/checkout/stripe/return?${query}`,
    ...(as ? { headers: { authorization: `Bearer ${as.token}` } } : {}),
  });

beforeAll(async () => {
  stub = await connectStub();
  t = await createTestApp({
    STRIPE_SECRET_KEY: STUB_KEY,
    STRIPE_API_BASE: stub.url,
    STRIPE_CONNECT_BASE: stub.url,
    STRIPE_CONNECT_CLIENT_ID: 'ca_test_0123456789',
    STRIPE_CONNECT_WEBHOOK_SECRET: SECRET,
    PUBLIC_URL: 'https://caime.example',
  });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  convo = (await lina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  stub.accounts.set('acct_nile', { chargesEnabled: false });
});
afterAll(async () => {
  await t.close();
  await stub.close();
});

describe('connecting the organization’s own account (R65)', () => {
  it('only its owner connects, through Stripe’s page, once per state', async () => {
    expect((await noor.get(`/v1/orgs/${orgId}/checkout`)).checkout).toEqual({
      available: true,
      connected: null,
    });
    expect((await omar.req('GET', `/v1/orgs/${orgId}/checkout`)).statusCode).toBe(404);
    expect((await omar.req('POST', `/v1/orgs/${orgId}/checkout/connect`)).statusCode).toBe(404);
    const { url } = await noor.post(`/v1/orgs/${orgId}/checkout/connect`, {});
    const consent = new URL(url);
    expect(consent.origin + consent.pathname).toBe(`${stub.url}/oauth/authorize`);
    expect(consent.searchParams.get('client_id')).toBe('ca_test_0123456789');
    expect(consent.searchParams.get('redirect_uri')).toBe(
      'https://caime.example/v1/checkout/stripe/return',
    );
    const state = consent.searchParams.get('state') ?? '';
    // A state nobody made goes nowhere in particular.
    const forged = await back(`state=${'x'.repeat(32)}&code=${stub.codeFor('acct_nile')}`);
    expect(forged.headers.location).toBe('https://caime.example/');
    // Someone else's browser, or none, finishing the owner's consent connects nothing.
    expect(
      (await back(`state=${state}&code=${stub.codeFor('acct_nile')}`, omar)).headers.location,
    ).toBe('https://caime.example/o/nile.dental/setup?checkout=failed');
    const { url: url2 } = await noor.post(`/v1/orgs/${orgId}/checkout/connect`, {});
    const state2 = new URL(url2).searchParams.get('state') ?? '';
    expect(
      (await back(`state=${state2}&code=${stub.codeFor('acct_nile')}`, null)).headers.location,
    ).toBe('https://caime.example/o/nile.dental/setup?checkout=failed');
    const { url: url3 } = await noor.post(`/v1/orgs/${orgId}/checkout/connect`, {});
    const state3 = new URL(url3).searchParams.get('state') ?? '';
    const done = await back(`state=${state3}&code=${stub.codeFor('acct_nile')}`);
    expect(done.statusCode).toBe(303);
    expect(done.headers.location).toBe(
      'https://caime.example/o/nile.dental/setup?checkout=connected',
    );
    // A state is used once.
    expect((await back(`state=${state3}&code=${stub.codeFor('acct_nile')}`)).headers.location).toBe(
      'https://caime.example/',
    );
    const view = (await noor.get(`/v1/orgs/${orgId}/checkout`)).checkout;
    expect(view.connected).toMatchObject({ account: '…nile', chargesEnabled: false, live: false });
    expect(JSON.stringify(view)).not.toContain('acct_nile');
  });

  it('a Pay card offers cards only once Stripe says the account takes them', async () => {
    const before = (await ask(400.5)).json().message.payload;
    expect(before.payTo).toBeUndefined();
    stub.accounts.set('acct_nile', { chargesEnabled: true });
    const refreshed = await noor.post(`/v1/orgs/${orgId}/checkout/refresh`, {});
    expect(refreshed.checkout.connected.chargesEnabled).toBe(true);
    const asked = await ask(400.5);
    expect(asked.statusCode).toBe(201);
    expect(asked.json().message.payload.payTo).toMatchObject({
      name: 'Nile Dental',
      orgId,
      checkout: true,
      methods: [],
    });
    card = asked.json().message.id;
  });
});

describe('paying by card (R65)', () => {
  it('the payer opens a session on the organization’s account; the team can’t', async () => {
    expect((await omar.req('POST', `/v1/messages/${card}/checkout`)).statusCode).toBe(403);
    const { url } = await lina.post(`/v1/messages/${card}/checkout`, {});
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.test\/cs_/);
    const made = stub.requests.filter(
      (r) => r.method === 'POST' && r.path === '/v1/checkout/sessions',
    );
    expect(made).toHaveLength(1);
    const [made1] = made;
    expect(made1?.headers['stripe-account']).toBe('acct_nile');
    expect(made1?.params.get('line_items[0][price_data][unit_amount]')).toBe('40050');
    expect(made1?.params.get('line_items[0][price_data][currency]')).toBe('egp');
    expect(made1?.params.get('metadata[caime_message]')).toBe(card);
    expect(made1?.params.get('success_url')).toBe(
      `https://caime.example/c/${convo}?checkout=${card}`,
    );
    // Asked again, the same session.
    expect((await lina.post(`/v1/messages/${card}/checkout`, {})).url).toBe(url);
    expect(stub.sessions.size).toBe(1);
  });

  it('is paid only when Stripe says so, whatever an event claims', async () => {
    const [session] = [...stub.sessions.values()];
    const open = await lina.post(`/v1/messages/${card}/checkout/check`, {});
    expect(open.status).toBe('open');
    expect(open.message.payload.state).toBe('requested');
    // A signed event that claims it's paid, while Stripe says it isn't: nothing moves.
    const claim = await hook({
      type: 'checkout.session.completed',
      account: 'acct_nile',
      data: {
        object: { id: session?.id, payment_status: 'paid', metadata: { caime_message: card } },
      },
    });
    expect(claim.statusCode).toBe(200);
    expect((await lina.post(`/v1/messages/${card}/checkout/check`, {})).message.payload.state).toBe(
      'requested',
    );
    const event = stub.pay(session?.id ?? '');
    expect((await hook(event, 'whsec_someone_else_0000')).statusCode).toBe(400);
    expect((await hook(event)).statusCode).toBe(200);
    const paid = await lina.post(`/v1/messages/${card}/checkout/check`, {});
    expect(paid.status).toBe('paid');
    expect(paid.message.payload.state).toBe('paid');
    expect(paid.message.payload.checkout.status).toBe('paid');
    // A paid card isn't paid twice.
    expect((await lina.req('POST', `/v1/messages/${card}/checkout`)).statusCode).toBe(403);
  });

  it('one session is ever payable: a payment not yet settled is settled, never replaced; an old one ends first; a card settled otherwise ends its session', async () => {
    const sessionFor = (messageId: string, not?: string) =>
      [...stub.sessions.values()].find(
        (s) => s.params.get('metadata[caime_message]') === messageId && s.id !== not,
      )!;
    const second = (await ask(120)).json().message.id;
    await lina.post(`/v1/messages/${second}/checkout`, {});
    const a = sessionFor(second);
    // Paid on Stripe's page, the tab closed before the return, the webhook not here yet: asking
    // for a session again settles it rather than replacing it, and nobody pays twice.
    stub.pay(a.id);
    const again = await lina.req('POST', `/v1/messages/${second}/checkout`);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.message).toBe('This card has been paid already.');
    expect(
      (await lina.post(`/v1/messages/${second}/checkout/check`, {})).message.payload.state,
    ).toBe('paid');
    // A session of the payer's own from a day ago ends at Stripe before a new one starts.
    const third = (await ask(60)).json().message.id;
    const old = (await lina.post(`/v1/messages/${third}/checkout`, {})).url;
    const b = sessionFor(third);
    t.clock.advance(21 * 3_600_000);
    const fresh = (await lina.post(`/v1/messages/${third}/checkout`, {})).url;
    expect(fresh).not.toBe(old);
    expect(b.status).toBe('expired');
    const c = sessionFor(third, b.id);
    expect(c.status).toBe('open');
    // Settled another way (sent in cash, say): its session ends, and a card is never paid twice.
    expect((await lina.req('POST', `/v1/messages/${third}/kit`, { to: 'sent' })).statusCode).toBe(
      200,
    );
    expect(c.status).toBe('expired');
    expect((await lina.req('POST', `/v1/messages/${third}/checkout`)).statusCode).toBe(403);
  });

  it('disconnected, cards aren’t offered and Stripe forgets Caime’s access', async () => {
    expect((await omar.req('DELETE', `/v1/orgs/${orgId}/checkout`)).statusCode).toBe(404);
    await noor.req('DELETE', `/v1/orgs/${orgId}/checkout`);
    expect(
      stub.requests.some(
        (r) => r.path === '/oauth/deauthorize' && r.params.get('stripe_user_id') === 'acct_nile',
      ),
    ).toBe(true);
    expect((await noor.get(`/v1/orgs/${orgId}/checkout`)).checkout.connected).toBeNull();
    expect((await ask(90)).json().message.payload.payTo).toBeUndefined();
  });
});
