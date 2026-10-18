/**
 * Keeping a meeting (M16 C3f): a meeting's guest makes it their own Caime account, and the
 * meeting, its people and what was said stay theirs, because the account is the guest they were.
 * A guest by link is handed a claim naming them, which sign-up takes for half an hour; a guest by
 * address claims their address as anyone does, by its code. Either way no guest session lives on
 * as the account's, under 18 nobody keeps one, and an address with history of its own is never
 * folded into a guest's.
 */
import { randomBytes } from 'node:crypto';
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { productMetrics } from '../src/lib/product-metrics';
import { personForAddress } from '../src/lib/provisional';
import { type Client, clientFor, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let mail: ReturnType<typeof memoryMailer>;
let ana: Client;
let ben: Client;
let convo: string;

const anon = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as never });
const handle = () => `kept${randomBytes(3).toString('hex')}`;
const codeFor = (address: string) => {
  const sent = mail.outbox.filter((m) => m.to === address).at(-1);
  expect(sent, `a code to ${address}`).toBeDefined();
  return /^(\d{6}) /.exec(sent?.subject ?? '')?.[1] ?? '';
};

async function agreed(title: string) {
  const card = (
    await ana.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: {
          title,
          start: { at: '2026-10-21T09:00:00.000Z', hasTime: true },
          durationMinutes: 30,
        },
      },
    })
  ).message as { id: string };
  await ben.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
  return card;
}

/** A guest who took their link: by link (a name only) or by address. */
async function guestIn(title: string, by: { name: string } | { email: string }) {
  const card = await agreed(title);
  const made = await ana.post(
    `/v1/messages/${card.id}/guests`,
    'email' in by ? { email: by.email, name: 'Gus Guest' } : { link: true, name: by.name },
  );
  await t.ctx.flush();
  const link =
    (made.link as string | null | undefined) ??
    mail.outbox.filter((m) => m.to === (by as { email: string }).email).at(-1)?.text ??
    '';
  const token = /\/j\/(cmg_[A-Za-z0-9_-]+)/.exec(link)?.[1] ?? '';
  const took = await anon('POST', `/v1/join/${token}`, { adult: true, client: 'native' });
  expect(took.statusCode, took.body).toBe(200);
  const space = made.space as { conversationId: string };
  const row = await t.ctx.db
    .selectFrom('participants as p')
    .innerJoin('users as u', 'u.id', 'p.user_id')
    .select('u.id')
    .where('p.conversation_id', '=', space.conversationId)
    .where('u.kind', '=', 'provisional')
    .executeTakeFirstOrThrow();
  const guest = clientFor(t, took.json().token, { id: row.id, handle: '', displayName: 'Guest' });
  return { guest, token, space, guestId: row.id };
}

const signUp = (body: Record<string, unknown>) =>
  anon('POST', '/v1/auth/signup', {
    password: 'correct horse battery',
    displayName: 'Gus Guest',
    birthDate: '1990-01-01',
    country: 'EG',
    timeZone: 'Africa/Cairo',
    client: 'native',
    ...body,
  });

beforeAll(async () => {
  mail = memoryMailer();
  t = await createTestApp({}, { mail });
  t.clock.set('2026-10-20T08:00:00Z');
  ana = await signup(t, { displayName: 'Ana Host' });
  ben = await signup(t, { displayName: 'Ben Host' });
  const r = await ana.post('/v1/connections/requests', {
    toUserId: ben.user.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  await ben.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  convo = (await ana.post('/v1/conversations', { kind: 'direct', userId: ben.user.id }))
    .conversation.id;
});
afterAll(async () => {
  await t.close();
});

describe('keeping a meeting (M16 C3f)', () => {
  it('hands a guest by link a claim, a guest by address their address, and nobody else either', async () => {
    const byLink = await guestIn('Launch review', { name: 'Lina Link' });
    const kept = await byLink.guest.post('/v1/guest/keep', {});
    expect(kept).toMatchObject({ name: 'Lina Link', email: null });
    expect(kept.claim).toMatch(/^[A-Za-z0-9_-]{32,512}$/);
    const byAddress = await guestIn('Budget review', { email: 'amal@example.com' });
    expect(await byAddress.guest.post('/v1/guest/keep', {})).toEqual({
      name: 'Gus Guest',
      email: 'amal@example.com',
      claim: null,
    });
    // A person keeps nothing this way, and nobody unsigned asks.
    expect((await ana.req('POST', '/v1/guest/keep', {})).statusCode).toBe(403);
    expect((await anon('POST', '/v1/guest/keep')).statusCode).toBe(401);
  });

  it('makes the guest by link the account: the same row, in the meeting with what was said', async () => {
    const { guest, guestId, space, token } = await guestIn('Design review', { name: 'Gus Guest' });
    await ana.post(`/v1/conversations/${space.conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body: 'Slides are in the folder.',
    });
    const { claim } = await guest.post('/v1/guest/keep', {});
    const mine = handle();
    const res = await signUp({ email: 'gus@new.example', handle: mine, keep: claim });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    expect(body.user.id).toBe(guestId);
    const row = await t.ctx.db
      .selectFrom('users')
      .select(['kind', 'email', 'handle', 'email_verified_at', 'claimed_at'])
      .where('id', '=', guestId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ kind: 'human', email: 'gus@new.example', handle: mine });
    // The address is new to Caime: confirmed by the code sent to it, as any sign-up's.
    expect(row.email_verified_at).toBeNull();
    expect(row.claimed_at).not.toBeNull();
    await t.ctx.flush();
    expect(mail.outbox.some((m) => m.to === 'gus@new.example')).toBe(true);
    // The guest's session was for the meeting alone: it ends, wherever it was.
    expect((await guest.req('GET', '/v1/me')).statusCode).toBe(401);
    // The account has the meeting, what was said before, and writes there as a person now.
    const gus = clientFor(t, body.token, body.user);
    const said = await gus.get(`/v1/conversations/${space.conversationId}/messages`);
    expect(said.messages.map((m: { body: string | null }) => m.body)).toContain(
      'Slides are in the folder.',
    );
    const wrote = await gus.req('POST', `/v1/conversations/${space.conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body: 'Thanks, see you there.',
    });
    expect(wrote.statusCode).toBe(201);
    // The audit says a meeting was kept; the link now asks them to sign in.
    const signed = await t.ctx.db
      .selectFrom('audit_log')
      .select('metadata')
      .where('actor_id', '=', guestId)
      .where('action', '=', 'auth.signup')
      .executeTakeFirstOrThrow();
    expect(signed.metadata).toMatchObject({ keptMeeting: true });
    expect((await anon('GET', `/v1/join/${token}`)).json()).toMatchObject({ signIn: true });
    // Its claim is spent: a second sign-up with it makes no account and no session.
    const again = await signUp({ email: 'other@new.example', handle: handle(), keep: claim });
    expect(again.statusCode).toBe(400);
    const others = await t.ctx.db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'other@new.example')
      .execute();
    expect(others).toHaveLength(0);
  });

  it('refuses a claim run out or changed, and keeps nobody under 18', async () => {
    const { guest, guestId } = await guestIn('Hiring sync', { name: 'Hana Late' });
    const { claim } = await guest.post('/v1/guest/keep', {});
    const changed = `${claim.slice(0, -2)}${claim.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(
      (await signUp({ email: 'hana@x.example', handle: handle(), keep: changed })).statusCode,
    ).toBe(400);
    // Under 18: a meeting's guests are strangers to each other (R29).
    const young = await signUp({
      email: 'hana@x.example',
      handle: handle(),
      keep: claim,
      // Old enough for an account where they live, not for a meeting with strangers.
      country: 'US',
      timeZone: 'America/New_York',
      birthDate: '2011-05-01',
    });
    expect(young.statusCode).toBe(403);
    expect(young.json().error.details.fields[0].path).toBe('birthDate');
    // Half an hour, then the page asks again.
    t.clock.advance(31 * 60_000);
    expect(
      (await signUp({ email: 'hana@x.example', handle: handle(), keep: claim })).statusCode,
    ).toBe(400);
    t.clock.set('2026-10-20T08:00:00Z');
    // Still the guest they were, through all of it.
    const row = await t.ctx.db
      .selectFrom('users')
      .select('kind')
      .where('id', '=', guestId)
      .executeTakeFirstOrThrow();
    expect(row.kind).toBe('provisional');
  });

  it('never folds an address with its own history into a guest, nor takes one with an account', async () => {
    const { guest } = await guestIn('Vendor call', { name: 'Vera Link' });
    const { claim } = await guest.post('/v1/guest/keep', {});
    await personForAddress(t.ctx, 'held@example.com', 'Held');
    const held = await signUp({ email: 'held@example.com', handle: handle(), keep: claim });
    expect(held.statusCode).toBe(409);
    expect(held.json().error).toMatchObject({ code: 'email_taken' });
    const taken = await signUp({ email: ben.user.email, handle: handle(), keep: claim });
    expect(taken.statusCode).toBe(409);
  });

  it('lets a guest by address keep it by its code, and their guest session ends too', async () => {
    const { guest, guestId, space } = await guestIn('Planning', { email: 'omar@example.com' });
    const mine = handle();
    const asked = await signUp({ email: 'omar@example.com', handle: mine });
    expect(asked.json().error).toMatchObject({ code: 'email_code_needed' });
    const res = await signUp({
      email: 'omar@example.com',
      handle: mine,
      emailCode: codeFor('omar@example.com'),
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().user.id).toBe(guestId);
    expect((await guest.req('GET', '/v1/me')).statusCode).toBe(401);
    const omar = clientFor(t, res.json().token, res.json().user);
    expect((await omar.req('GET', `/v1/conversations/${space.conversationId}`)).statusCode).toBe(
      200,
    );
  });

  it('counts the guests who came in, and those who kept it', async () => {
    // The tests above: six guests took their link, two of them made it their account (by link
    // and by address), all on the test's clock.
    t.clock.set('2026-10-20T09:00:00Z');
    const { guests } = (await productMetrics(t.ctx, 30)).growth;
    expect(guests).toEqual({ joined: 6, kept: 2 });
  });
});
