import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { accountReturnOf } from '@caime/core/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pushAccountPlans } from '../src/lib/calendar-push';
import { ACCOUNT_ROW, countAccountHealth, markReconnect } from '../src/lib/connected-accounts';
import { syncAccountCalendar } from '../src/lib/external-busy';
import { runDueJobs } from '../src/lib/jobs';
import { providerProbes } from '../src/lib/provider-health';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * How each use of a connected account is doing (M16 G2, review 2026-10-17 §8 H3): the busy read
 * and the plan push each keep when they last worked and why their last try failed, so a good read
 * never hides a failing push; a provider that asks Caime to wait is left alone until then; a
 * network blip or Caime's own client turned away never blames the person's account; a grant
 * that's gone asks to be connected again and says so once; and Google's sign-in is probed. A
 * stand-in plays Google, told how to answer by `mode`.
 */
const METRICS = 'metrics-token-for-the-account-health-test-0123';
let t: TestApp;
let noor: Client;
let stub: Server;
let base: string;
let accountId: string;
const asked: string[] = [];
const mode = {
  token: 'ok' as 'ok' | 'grant' | 'client' | 'down',
  busy: 'ok' as 'ok' | 'limited' | 'rate403' | 'down',
  events: 'ok' as 'ok' | 'limited' | 'refused' | 'down',
};
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
    const url = new URL(req.url ?? '/', 'http://stub');
    const p = url.pathname;
    asked.push(`${req.method} ${p}`);
    const send = (status: number, value: unknown = {}, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(value));
    };
    if (p === '/google/token') {
      const form = new URLSearchParams(raw);
      if (mode.token === 'down') return res.destroy();
      if (mode.token === 'client') return send(401, { error: 'invalid_client' });
      // The probe's refresh token, or one revoked at the provider.
      if (form.get('refresh_token') === 'caime-health-probe' || mode.token === 'grant')
        return send(400, { error: 'invalid_grant' });
      return send(200, {
        access_token: 'g-access',
        expires_in: 3599,
        refresh_token: 'g-refresh',
        scope: SCOPE,
      });
    }
    if (p === '/google/userinfo') return send(200, { sub: 'g-1', email: 'noor@gmail.example' });
    if (p === '/gcal/freeBusy') {
      if (mode.busy === 'limited') return send(429, {}, { 'retry-after': '120' });
      if (mode.busy === 'rate403')
        return send(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } });
      if (mode.busy === 'down') return send(503);
      return send(200, { calendars: { primary: { busy: [] } } });
    }
    if (p.startsWith('/gcal/calendars/primary/events')) {
      if (mode.events === 'limited') return send(429, {}, { 'retry-after': '300' });
      if (mode.events === 'refused')
        return send(403, { error: { errors: [{ reason: 'forbidden' }] } });
      if (mode.events === 'down') return send(503);
      res.writeHead(204).end();
      return;
    }
    send(404);
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  t = await createTestApp({
    METRICS_TOKEN: METRICS,
    GOOGLE_CLIENT_ID: 'google-client',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    GOOGLE_AUTH_URL: `${base}/google/auth`,
    GOOGLE_TOKEN_URL: `${base}/google/token`,
    GOOGLE_USERINFO_URL: `${base}/google/userinfo`,
    GOOGLE_CALENDAR_API: `${base}/gcal`,
  });
  noor = await signup(t, { displayName: 'Noor Haddad' });
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
const view = async () =>
  (await noor.get('/v1/me/accounts')).accounts.find((a: { id: string }) => a.id === accountId);
const healthOf = async (use: 'calendar' | 'plans') =>
  (await view()).health.find((h: { use: string }) => h.use === use);
let written = 0;
/** An event Caime wrote there that's no longer wanted, so the next push takes it out. */
const somethingToTakeOut = () =>
  t.ctx.db
    .insertInto('calendar_pushes')
    .values({
      account_id: accountId,
      user_id: noor.user.id,
      uid: `gone-${++written}`,
      event_id: `ev${written}`,
      start_at: new Date(t.clock.now.getTime() + 86_400_000),
      end_at: new Date(t.clock.now.getTime() + 90_000_000),
      holds: true,
      fingerprint: 'x',
      pushed_at: t.clock.now,
    })
    .execute();
/** The access renewed from now on: what was kept in memory has run out. */
const accessRunsOut = () => t.clock.advance(3_600_000);

describe('connected accounts that say how each use is doing (M16 G2)', () => {
  it('a failing push never hides behind a good read, and a good read never clears it', async () => {
    expect(await view()).toMatchObject({ state: 'connected' });
    expect((await healthOf('calendar')).workedAt).not.toBeNull();
    const pushedBefore = (await row()).pushed_at;
    await somethingToTakeOut();
    mode.events = 'down';
    await pushAccountPlans(t.ctx, await row());
    mode.events = 'ok';
    expect(await healthOf('plans')).toMatchObject({ failure: 'unanswered' });
    // Not put in step: when it last was stays as it was.
    expect((await row()).pushed_at).toEqual(pushedBefore);
    expect(await view()).toMatchObject({ state: 'failing' });
    // A good read says so for the calendar alone.
    expect(await syncAccountCalendar(t.ctx, await row())).toBe(true);
    expect(await healthOf('calendar')).toMatchObject({ failure: null });
    expect(await healthOf('plans')).toMatchObject({ failure: 'unanswered' });
    expect(await view()).toMatchObject({ state: 'failing' });
    // The push working again clears its own.
    await pushAccountPlans(t.ctx, await row());
    expect(await healthOf('plans')).toMatchObject({ failure: null, failedAt: null });
    expect((await healthOf('plans')).workedAt).toBe(t.clock.now.toISOString());
    expect(await view()).toMatchObject({ state: 'connected' });
  });

  it('a provider that asks Caime to wait is left alone until then, a refusal said apart', async () => {
    mode.busy = 'limited';
    expect(await syncAccountCalendar(t.ctx, await row())).toBe(false);
    mode.busy = 'ok';
    expect(await healthOf('calendar')).toMatchObject({ failure: 'limited' });
    expect((await row()).rest_until).toEqual(new Date(t.clock.now.getTime() + 120_000));
    // Nothing is asked of it meanwhile: neither a read nor a push.
    const before = asked.length;
    expect(await syncAccountCalendar(t.ctx, await row())).toBe(false);
    await somethingToTakeOut();
    await pushAccountPlans(t.ctx, await row());
    expect(asked.slice(before)).toEqual([]);
    t.clock.advance(121_000);
    expect(await syncAccountCalendar(t.ctx, await row())).toBe(true);
    expect(await healthOf('calendar')).toMatchObject({ failure: null });
    // Google's own 403 for a rate is a wait too, never a connection gone.
    mode.busy = 'rate403';
    await syncAccountCalendar(t.ctx, await row());
    mode.busy = 'ok';
    expect(await view()).toMatchObject({ state: 'failing' });
    expect(await healthOf('calendar')).toMatchObject({ failure: 'limited' });
    t.clock.advance(6 * 60_000);
    // A push the provider refuses says so, and its wait is an hour's, not the sweep's every look.
    mode.events = 'refused';
    await pushAccountPlans(t.ctx, await row());
    mode.events = 'ok';
    expect(await healthOf('plans')).toMatchObject({ failure: 'refused' });
    expect(await syncAccountCalendar(t.ctx, await row())).toBe(true);
    await pushAccountPlans(t.ctx, await row());
    expect(await view()).toMatchObject({ state: 'connected' });
  });

  it('a network blip or Caime’s own client turned away never blames the account', async () => {
    accessRunsOut();
    mode.token = 'client';
    expect(await syncAccountCalendar(t.ctx, await row())).toBe(false);
    mode.token = 'down';
    await somethingToTakeOut();
    await pushAccountPlans(t.ctx, await row());
    mode.token = 'ok';
    expect((await row()).state).toBe('connected');
    expect(await healthOf('calendar')).toMatchObject({ failure: 'unanswered' });
    expect(await healthOf('plans')).toMatchObject({ failure: 'unanswered' });
    const told = await t.ctx.db
      .selectFrom('notifications')
      .select('id')
      .where('user_id', '=', noor.user.id)
      .where('kind', '=', 'account')
      .execute();
    expect(told).toEqual([]);
  });

  it('counts each use by how it last went, for /metrics', async () => {
    await countAccountHealth(t.ctx);
    const m = (
      await t.app.inject({ url: '/metrics', headers: { authorization: `Bearer ${METRICS}` } })
    ).body;
    expect(m).toMatch(/^caime_connected_accounts\{health="failing",use="calendar"\} 1$/m);
    expect(m).toMatch(/^caime_connected_accounts\{health="failing",use="plans"\} 1$/m);
  });

  it('probes Google’s sign-in: there and taking Caime’s client, or not', async () => {
    const google = providerProbes(t.ctx).find((p) => p.id === 'google');
    expect(google?.name).toBe('Google');
    await expect(google?.check()).resolves.toBeUndefined();
    mode.token = 'client';
    await expect(google?.check()).rejects.toThrow(/401 invalid_client/);
    mode.token = 'ok';
    // Microsoft isn't configured here, so it isn't probed.
    expect(providerProbes(t.ctx).some((p) => p.id === 'microsoft')).toBe(false);
  });

  it('a grant that’s gone asks to be connected again, and says so once', async () => {
    accessRunsOut();
    mode.token = 'grant';
    expect(await syncAccountCalendar(t.ctx, await row())).toBe(false);
    mode.token = 'ok';
    expect(await view()).toMatchObject({ state: 'reconnect' });
    await markReconnect(t.ctx, accountId);
    const told = await t.ctx.db
      .selectFrom('notifications')
      .select(['kind', 'level', 'title', 'data'])
      .where('user_id', '=', noor.user.id)
      .where('kind', '=', 'account')
      .execute();
    expect(told).toEqual([
      {
        kind: 'account',
        level: 'attention',
        title: 'Google needs connecting again',
        data: { account: accountId },
      },
    ]);
    // Nothing is asked of a connection waiting for its person.
    const before = asked.length;
    await pushAccountPlans(t.ctx, await row());
    expect(asked.slice(before)).toEqual([]);
  });
});
