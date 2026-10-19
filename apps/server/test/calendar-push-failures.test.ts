import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv4 } from '@caime/core';
import { accountReturnOf, PUSH_TRIES } from '@caime/core/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pushAccountPlans } from '../src/lib/calendar-push';
import { ACCOUNT_ROW, countAccountHealth } from '../src/lib/connected-accounts';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * A plan a connected calendar refuses on its own (M16 G4, review 2026-10-17 §8 M): kept per
 * event, sent as it is `PUSH_TRIES` times at most while the rest go in, then left until its card
 * changes; one not taken out is let go after its tries. The person sees how many wait, /metrics
 * counts them, and the operator lists the connection by whose it is, never its address. A
 * stand-in plays Google: it refuses a tentative event whose title says "Unwritable", and every
 * removal while `refuseRemoves` is on.
 */
const METRICS = 'metrics-token-for-the-push-failures-test-01234';
const ADMIN = 'admin-token-for-the-push-failures-test-0123456789';
let t: TestApp;
let noor: Client;
let lina: Client;
let stub: Server;
let base: string;
let accountId: string;
let chat: string;
let fine: string;
let refused: string;
let refuseRemoves = false;
const writes: Array<{ method: string; summary: string | null }> = [];
const SCOPE = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.events.owned',
].join(' ');

const body = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => resolve(raw));
  });

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    const raw = await body(req);
    const p = new URL(req.url ?? '/', 'http://stub').pathname;
    const send = (status: number, value: unknown = {}) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (p === '/google/token')
      return send(200, {
        access_token: 'g-access',
        expires_in: 3599,
        refresh_token: 'g-refresh',
        scope: SCOPE,
      });
    if (p === '/google/userinfo') return send(200, { sub: 'g-1', email: 'noor@gmail.example' });
    if (p === '/gcal/freeBusy') return send(200, { calendars: { primary: { busy: [] } } });
    if (p.startsWith('/gcal/calendars/primary/events')) {
      const event = raw ? (JSON.parse(raw) as { summary?: string; status?: string }) : {};
      writes.push({ method: req.method ?? '', summary: event.summary ?? null });
      if (req.method === 'DELETE') {
        if (refuseRemoves) return send(400, { error: { message: 'Bad request' } });
        res.writeHead(204).end();
        return;
      }
      if (event.summary?.includes('Unwritable') && event.status === 'tentative')
        return send(400, { error: { message: 'Invalid value' } });
      return send(200, { id: 'kept' });
    }
    send(404);
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  t = await createTestApp({
    METRICS_TOKEN: METRICS,
    ADMIN_TOKEN: ADMIN,
    GOOGLE_CLIENT_ID: 'google-client',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    GOOGLE_AUTH_URL: `${base}/google/auth`,
    GOOGLE_TOKEN_URL: `${base}/google/token`,
    GOOGLE_USERINFO_URL: `${base}/google/userinfo`,
    GOOGLE_CALENDAR_API: `${base}/gcal`,
  });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  const r = await noor.post('/v1/connections/requests', { toUserId: lina.user.id });
  chat = (await lina.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
  const { url } = await noor.post('/v1/me/accounts/google/start', {
    uses: ['calendar', 'plans'],
    back: 'web',
  });
  const state = new URL(url).searchParams.get('state') ?? '';
  const back = await t.app.inject({
    method: 'GET',
    url: `/v1/accounts/google/back?${new URLSearchParams({ code: 'one-time', state })}`,
  });
  const claim = accountReturnOf(String(back.headers.location).split('#')[1] ?? '');
  if (!claim || !('claim' in claim)) throw new Error('no claim');
  accountId = (await noor.post('/v1/me/accounts/google/claim', { claim: claim.claim })).account.id;
  await runDueJobs(t.ctx);
});

afterAll(async () => {
  await t.close();
  await new Promise((r) => stub.close(r));
});

const row = () =>
  t.ctx.db
    .selectFrom('connected_accounts')
    .select(ACCOUNT_ROW)
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();
const push = async () => pushAccountPlans(t.ctx, await row());
const plans = async () =>
  (await noor.get('/v1/me/accounts')).accounts
    .find((a: { id: string }) => a.id === accountId)
    .health.find((h: { use: string }) => h.use === 'plans');
const meeting = async (title: string) =>
  (
    await noor.post(`/v1/conversations/${chat}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: {
          title,
          start: {
            at: new Date(t.clock.now.getTime() + 2 * 86_400_000).toISOString(),
            hasTime: true,
          },
          durationMinutes: 30,
        },
      },
    })
  ).message.id as string;
const asked = (words: string) => writes.filter((w) => w.summary?.includes(words)).length;

describe('a plan a connected calendar refuses on its own (M16 G4)', () => {
  it('never holds up the rest, and waits for its card to change after its tries', async () => {
    fine = await meeting('Lunch with Lina');
    refused = await meeting('Unwritable thing');
    await push();
    expect(asked('Lunch with Lina')).toBe(1);
    expect(asked('Unwritable thing')).toBe(1);
    // The rest went in, and the plans worked: one refusal is the event's, not the account's.
    expect(await plans()).toMatchObject({ failure: null, stuck: 0 });
    for (let i = 1; i < PUSH_TRIES; i++) await push();
    expect(asked('Unwritable thing')).toBe(PUSH_TRIES);
    expect(asked('Lunch with Lina')).toBe(1);
    expect(await plans()).toMatchObject({ failure: null, stuck: 1 });
    // Its tries spent, it isn't asked again as it is.
    await push();
    expect(asked('Unwritable thing')).toBe(PUSH_TRIES);
    const kept = await t.ctx.db
      .selectFrom('calendar_push_failures')
      .select(['status', 'attempts'])
      .where('account_id', '=', accountId)
      .execute();
    expect(kept).toEqual([{ status: 400, attempts: PUSH_TRIES }]);
    // Theirs to see in their export, beside what was written.
    const exported = (await noor.req('GET', '/v1/me/export')).json();
    expect(exported.refusedByYourCalendars).toEqual([
      expect.objectContaining({
        event: `meeting-${refused}@caime`,
        answer: 400,
        tries: PUSH_TRIES,
      }),
    ]);
  });

  it('is counted for /metrics and listed for the operator, never by its address', async () => {
    await countAccountHealth(t.ctx);
    const m = (
      await t.app.inject({ url: '/metrics', headers: { authorization: `Bearer ${METRICS}` } })
    ).body;
    expect(m).toMatch(/^caime_calendar_plans_stuck 1$/m);
    expect(
      (await t.app.inject({ url: '/v1/admin/connections' })).statusCode,
    ).toBeGreaterThanOrEqual(401);
    const listed = await t.app.inject({
      url: '/v1/admin/connections',
      headers: { authorization: `Bearer ${ADMIN}` },
    });
    expect(listed.statusCode).toBe(200);
    const view = listed.json();
    expect(view.stuck).toBe(1);
    expect(view.failing).toEqual([
      expect.objectContaining({
        id: accountId,
        provider: 'google',
        handle: noor.user.handle,
        state: 'connected',
        plans: expect.objectContaining({ stuck: 1, failure: null }),
      }),
    ]);
    expect(view.counts).toEqual(
      expect.arrayContaining([{ use: 'plans', health: 'working', count: 1 }]),
    );
    expect(listed.body).not.toContain('noor@gmail.example');
    expect(listed.body).not.toContain('Unwritable');
    const audited = await t.ctx.db
      .selectFrom('audit_log')
      .select('metadata')
      .where('action', '=', 'admin.connections_viewed')
      .execute();
    expect(audited).toEqual([{ metadata: { count: 1, operator: 'operator' } }]);
  });

  it('is written again once its card changes, and the count clears', async () => {
    await lina.post(`/v1/messages/${refused}/kit`, { to: 'accepted' });
    await push();
    expect(asked('Unwritable thing')).toBe(PUSH_TRIES + 1);
    expect(await plans()).toMatchObject({ stuck: 0 });
    expect(
      await t.ctx.db
        .selectFrom('calendar_push_failures')
        .select('uid')
        .where('account_id', '=', accountId)
        .execute(),
    ).toEqual([]);
  });

  it('lets go of one it can’t take out after its tries, leaving it there', async () => {
    refuseRemoves = true;
    await noor.req('DELETE', `/v1/messages/${fine}`);
    const removals = () => writes.filter((w) => w.method === 'DELETE').length;
    for (let i = 0; i < PUSH_TRIES; i++) await push();
    expect(removals()).toBe(PUSH_TRIES);
    // Let go: no longer kept as written, nor asked again.
    await push();
    await push();
    expect(removals()).toBe(PUSH_TRIES);
    const left = await t.ctx.db
      .selectFrom('calendar_pushes')
      .select('uid')
      .where('account_id', '=', accountId)
      .execute();
    expect(left.map((l) => l.uid)).toEqual([`meeting-${refused}@caime`]);
    expect(
      await t.ctx.db
        .selectFrom('calendar_push_failures')
        .select('uid')
        .where('account_id', '=', accountId)
        .execute(),
    ).toEqual([]);
    refuseRemoves = false;
  });
});
