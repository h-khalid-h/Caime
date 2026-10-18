import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { accountReturnOf } from '@caime/core/accounts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { storedServerKey } from '../src/lib/server-keys';
import { DATABASE_VAULT_KEY, vaultKid } from '../src/lib/vault-keys';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const VAULT_KEY = randomBytes(32);

/**
 * Connected accounts (R90): a Google or Microsoft account connected once, its calendar's busy
 * times read and kept as times alone, and those times holding the person's bookable slots. A
 * stand-in plays both providers: their token, identity, calendar and revocation endpoints.
 */
let t: TestApp;
let bare: TestApp;
let noor: Client;
let omar: Client;
let lina: Client;
let stub: Server;
let base: string;

interface Seen {
  path: string;
  auth?: string;
  form?: Record<string, string>;
  json?: unknown;
}
const seen: Seen[] = [];
/** What the stand-in answers to the next token request, by provider; null is the default. */
const token: { google: Record<string, unknown> | null; microsoft: Record<string, unknown> | null } =
  { google: null, microsoft: null };
let googleBusy: Array<{ start: string; end: string }> = [];

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
    const entry: Seen = { path: url.pathname, auth: req.headers.authorization };
    if (req.headers['content-type']?.includes('form')) {
      entry.form = Object.fromEntries(new URLSearchParams(raw));
    } else if (raw) entry.json = JSON.parse(raw);
    seen.push(entry);
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (url.pathname === '/google/token') {
      const grant = entry.form?.grant_type;
      return send(
        token.google?.error ? 400 : 200,
        token.google ?? {
          access_token: grant === 'refresh_token' ? 'g-access-2' : 'g-access-1',
          expires_in: 3599,
          ...(grant === 'authorization_code'
            ? {
                refresh_token: 'g-refresh',
                scope:
                  'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.freebusy',
              }
            : {}),
        },
      );
    }
    if (url.pathname === '/google/userinfo')
      return send(200, { sub: 'g-123', email: 'Noor@Gmail.example' });
    if (url.pathname === '/gcal/freeBusy')
      return send(200, { calendars: { primary: { busy: googleBusy } } });
    if (url.pathname === '/google/revoke') return send(200, {});
    if (url.pathname.endsWith('/oauth2/v2.0/token'))
      return send(
        token.microsoft?.error ? 400 : 200,
        token.microsoft ?? {
          access_token: 'm-access',
          expires_in: 3599,
          refresh_token: `m-refresh-${seen.length}`,
          scope: 'openid email offline_access User.Read Calendars.ReadBasic',
        },
      );
    if (url.pathname === '/graph/v1.0/me')
      return send(200, { id: 'm-456', mail: null, userPrincipalName: 'omar@work.example' });
    if (url.pathname === '/graph/v1.0/me/calendarView') {
      if (!url.searchParams.has('page'))
        return send(200, {
          value: [
            {
              start: { dateTime: '2026-10-01T06:30:00.0000000' },
              end: { dateTime: '2026-10-01T07:00:00.0000000' },
              showAs: 'busy',
            },
            {
              start: { dateTime: '2026-10-01T07:00:00.0000000' },
              end: { dateTime: '2026-10-01T08:00:00.0000000' },
              showAs: 'free',
            },
          ],
          '@odata.nextLink': `${base}/graph/v1.0/me/calendarView?page=2`,
        });
      return send(200, {
        value: [
          {
            start: { dateTime: '2026-10-01T08:00:00.0000000' },
            end: { dateTime: '2026-10-01T08:30:00.0000000' },
            showAs: 'tentative',
          },
          {
            start: { dateTime: '2026-10-01T06:00:00.0000000' },
            end: { dateTime: '2026-10-01T09:00:00.0000000' },
            showAs: 'busy',
            isCancelled: true,
          },
        ],
      });
    }
    send(404, {});
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  t = await createTestApp({
    GOOGLE_CLIENT_ID: 'google-client',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    GOOGLE_AUTH_URL: `${base}/google/auth`,
    GOOGLE_TOKEN_URL: `${base}/google/token`,
    GOOGLE_USERINFO_URL: `${base}/google/userinfo`,
    GOOGLE_CALENDAR_API: `${base}/gcal`,
    GOOGLE_REVOKE_URL: `${base}/google/revoke`,
    MICROSOFT_CLIENT_ID: 'ms-client',
    MICROSOFT_CLIENT_SECRET: 'ms-secret',
    MICROSOFT_LOGIN_BASE: base,
    MICROSOFT_GRAPH_API: `${base}/graph`,
    // Sealed with the environment's key, never the database's (M16 B5).
    VAULT_KEY: VAULT_KEY.toString('base64'),
  });
  bare = await createTestApp();
  // Thursday 1 October 2026, 05:00Z: 08:00 in Cairo.
  t.clock.set('2026-10-01T05:00:00Z');
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  const set = await noor.req('PUT', '/v1/me/booking', { booking: HOURS, items: [LESSON] });
  expect(set.statusCode, set.body).toBe(200);
});

afterAll(async () => {
  await t.close();
  await bare.close();
  await new Promise((r) => stub.close(r));
});

const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  // Sunday to Thursday, 09:00–12:00 Cairo (06:00–09:00Z).
  days: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
  leadMinutes: 60,
  horizonDays: 14,
};
const LESSON = {
  id: 'lesson',
  name: 'Arabic lesson',
  price: null,
  unit: 'minutes',
  minutes: 60,
  capacity: 1,
  maxQuantity: 1,
  audience: 'public',
  providers: null,
  askTopic: false,
};
const window = 'from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z';
const times = (view: { slots: string[] }) => view.slots.map((s) => s.slice(11, 16));

/** Starts a connection as the app would, and follows the provider's return to its claim. */
async function connect(who: Client, provider: 'google' | 'microsoft', back: 'web' | 'app' = 'web') {
  const { url } = await who.post(`/v1/me/accounts/${provider}/start`, {
    uses: ['calendar'],
    back,
  });
  const link = new URL(url);
  return { link, state: link.searchParams.get('state') ?? '' };
}

async function returnFrom(provider: string, query: Record<string, string>) {
  const res = await t.app.inject({
    method: 'GET',
    url: `/v1/accounts/${provider}/back?${new URLSearchParams(query)}`,
  });
  expect(res.statusCode).toBe(303);
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers['referrer-policy']).toBe('no-referrer');
  const location = String(res.headers.location);
  return { location, back: accountReturnOf(location.split('#')[1] ?? '') };
}

describe('connected accounts (R90)', () => {
  it('offers the providers this Caime has a client for, and nothing without one', async () => {
    expect(await noor.get('/v1/me/accounts')).toEqual({
      accounts: [],
      offered: ['google', 'microsoft'],
      // Google's files need its picker's key, which this Caime doesn't have.
      usesOffered: { google: ['calendar', 'plans'], microsoft: ['calendar', 'plans', 'files'] },
    });
    const alone = await signup(bare);
    expect((await alone.get('/v1/me/accounts')).offered).toEqual([]);
    expect(
      (await alone.req('POST', '/v1/me/accounts/google/start', { uses: ['calendar'], back: 'web' }))
        .statusCode,
    ).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: '/v1/me/accounts' })).statusCode).toBe(401);
  });

  it('asks Google for busy times alone, offline, and returns a claim only its asker redeems', async () => {
    const { link, state } = await connect(noor, 'google');
    expect(link.origin + link.pathname).toBe(`${base}/google/auth`);
    // Busy times, and the list of calendars so each of the person's own is read (R96).
    expect(link.searchParams.get('scope')).toBe(
      'openid email https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    );
    expect(link.searchParams.get('access_type')).toBe('offline');
    expect(link.searchParams.get('redirect_uri')).toBe(
      'http://localhost:8787/v1/accounts/google/back',
    );
    const { location, back } = await returnFrom('google', { code: 'one-time', state });
    expect(location.startsWith('http://localhost:8787/settings/apps#account=google&claim=')).toBe(
      true,
    );
    // The fragment carries no token a reader could use.
    expect(location).not.toContain('g-refresh');
    expect(location).not.toContain('g-access');
    if (!back || !('claim' in back)) throw new Error('no claim');
    // Someone else holding the link can't finish it.
    const stolen = await lina.req('POST', '/v1/me/accounts/google/claim', { claim: back.claim });
    expect(stolen.statusCode).toBe(403);
    const { account } = await noor.post('/v1/me/accounts/google/claim', { claim: back.claim });
    expect(account).toMatchObject({
      provider: 'google',
      email: 'noor@gmail.example',
      uses: ['calendar'],
      state: 'connected',
      syncedAt: null,
      // The list of calendars wasn't granted: the main one alone is read until connected again.
      mainCalendarOnly: true,
    });
    // Nothing secret is answered or kept in the clear.
    const row = await t.ctx.db
      .selectFrom('connected_accounts')
      .select(['refresh_sealed', 'refresh_kid'])
      .where('id', '=', account.id)
      .executeTakeFirstOrThrow();
    expect(Buffer.from(row.refresh_sealed).toString()).not.toContain('g-refresh');
    // Sealed with VAULT_KEY and named by its id; the database holds no key that opens it.
    expect(row.refresh_kid).toBe(vaultKid(VAULT_KEY));
    expect(await storedServerKey(t.ctx, DATABASE_VAULT_KEY)).toBeNull();
  });

  it('keeps when Noor is busy there, and Noor’s slots are never offered over it', async () => {
    expect(times(await lina.get(`/v1/people/${noor.user.id}/slots?${window}&item=lesson`))).toEqual(
      ['06:00', '06:30', '07:00', '07:30', '08:00'],
    );
    googleBusy = [{ start: '2026-10-01T07:00:00Z', end: '2026-10-01T07:45:00Z' }];
    seen.length = 0;
    await runDueJobs(t.ctx);
    const asked = seen.find((s) => s.path === '/gcal/freeBusy');
    expect(asked?.auth).toBe('Bearer g-access-2');
    expect(asked?.json).toMatchObject({ items: [{ id: 'primary' }] });
    const kept = await t.ctx.db
      .selectFrom('external_busy')
      .select(['start_at', 'end_at'])
      .where('user_id', '=', noor.user.id)
      .execute();
    expect(kept.map((k) => [k.start_at.toISOString(), k.end_at.toISOString()])).toEqual([
      ['2026-10-01T07:00:00.000Z', '2026-10-01T07:45:00.000Z'],
    ]);
    expect((await noor.get('/v1/me/accounts')).accounts[0].syncedAt).not.toBeNull();
    expect(times(await lina.get(`/v1/people/${noor.user.id}/slots?${window}&item=lesson`))).toEqual(
      ['06:00', '08:00'],
    );
  });

  it('reads Microsoft page by page, leaving out free and cancelled times', async () => {
    const { link, state } = await connect(omar, 'microsoft');
    expect(link.searchParams.get('scope')).toBe(
      'openid email offline_access User.Read Calendars.ReadBasic',
    );
    const { back } = await returnFrom('microsoft', { code: 'one-time', state });
    if (!back || !('claim' in back)) throw new Error('no claim');
    const { account } = await omar.post('/v1/me/accounts/microsoft/claim', { claim: back.claim });
    expect(account.email).toBe('omar@work.example');
    const sealed = async () =>
      (
        await t.ctx.db
          .selectFrom('connected_accounts')
          .select('refresh_sealed')
          .where('id', '=', account.id)
          .executeTakeFirstOrThrow()
      ).refresh_sealed;
    const before = await sealed();
    await runDueJobs(t.ctx);
    const kept = await t.ctx.db
      .selectFrom('external_busy')
      .select(['start_at', 'end_at'])
      .where('user_id', '=', omar.user.id)
      .orderBy('start_at')
      .execute();
    expect(kept.map((k) => [k.start_at.toISOString(), k.end_at.toISOString()])).toEqual([
      ['2026-10-01T06:30:00.000Z', '2026-10-01T07:00:00.000Z'],
      ['2026-10-01T08:00:00.000Z', '2026-10-01T08:30:00.000Z'],
    ]);
    // Microsoft hands a new refresh token with each access: the new one replaces the kept one.
    expect(Buffer.compare(before, await sealed())).not.toBe(0);
  });

  it('an organization never offers a provider’s time they’re busy in elsewhere', async () => {
    const orgId = (
      await noor.post('/v1/orgs', {
        country: 'EG',
        name: 'Nile Lessons',
        handle: 'nile.lessons',
        kind: 'school',
      })
    ).org.id;
    const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
    await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
    const set = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
      booking: HOURS,
      items: [{ ...LESSON, id: 'trial', minutes: 30, providers: [omar.user.id] }],
    });
    expect(set.statusCode, set.body).toBe(200);
    // Omar is busy 06:30–07:00 and 08:00–08:30 in Omar’s Microsoft calendar.
    expect(times(await lina.get(`/v1/orgs/${orgId}/slots?${window}&item=trial`))).toEqual([
      '06:00',
      '07:00',
      '07:30',
      '08:30',
    ]);
  });

  it('says why when there is no connection: refused, a permission unticked, too late', async () => {
    const denied = await connect(noor, 'google');
    expect(
      (await returnFrom('google', { error: 'access_denied', state: denied.state })).back,
    ).toEqual({ provider: 'google', error: 'denied' });
    // Calendar unticked on Google's screen: nothing to connect for.
    token.google = {
      access_token: 'g-access-x',
      refresh_token: 'g-refresh-x',
      scope: 'openid https://www.googleapis.com/auth/userinfo.email',
    };
    const unticked = await connect(noor, 'google');
    expect((await returnFrom('google', { code: 'one-time', state: unticked.state })).back).toEqual({
      provider: 'google',
      error: 'denied',
    });
    token.google = null;
    const late = await connect(noor, 'google', 'app');
    t.clock.advance(11 * 60_000);
    const { location, back } = await returnFrom('google', { code: 'one-time', state: late.state });
    expect(back).toEqual({ provider: 'google', error: 'expired' });
    expect(location.startsWith('http://localhost:8787/')).toBe(true);
    t.clock.set('2026-10-01T05:00:00Z');
    // A phone's return goes back to the app.
    const phone = await connect(noor, 'google', 'app');
    const fromPhone = await returnFrom('google', { code: 'one-time', state: phone.state });
    expect(fromPhone.location.startsWith('caime://settings/apps#account=google&claim=')).toBe(true);
  });

  it('asks to be connected again when the provider refuses, and stops holding time', async () => {
    const [account] = (await noor.get('/v1/me/accounts')).accounts;
    // The access in memory has lapsed and Google refuses the refresh (revoked there).
    t.clock.advance(2 * 3_600_000);
    token.google = { error: 'invalid_grant' };
    await noor.post(`/v1/me/accounts/${account.id}/sync`, {});
    await runDueJobs(t.ctx);
    token.google = null;
    expect((await noor.get('/v1/me/accounts')).accounts[0].state).toBe('reconnect');
    const left = await t.ctx.db
      .selectFrom('external_busy')
      .select('account_id')
      .where('account_id', '=', account.id)
      .execute();
    expect(left).toEqual([]);
    t.clock.set('2026-10-01T05:00:00Z');
  });

  it('lists the accounts in the export, never their permission', async () => {
    const data = await noor.get('/v1/me/export');
    expect(data.connectedAccounts).toEqual([
      expect.objectContaining({
        provider: 'google',
        email: 'noor@gmail.example',
        uses: ['calendar'],
      }),
    ]);
    expect(JSON.stringify(data)).not.toContain('refresh');
  });

  it('disconnects: Google is told, and what was read goes with it', async () => {
    const [account] = (await omar.get('/v1/me/accounts')).accounts;
    expect((await lina.req('DELETE', `/v1/me/accounts/${account.id}`)).statusCode).toBe(404);
    await omar.req('DELETE', `/v1/me/accounts/${account.id}`);
    expect((await omar.get('/v1/me/accounts')).accounts).toEqual([]);
    const busy = await t.ctx.db
      .selectFrom('external_busy')
      .select('user_id')
      .where('user_id', '=', omar.user.id)
      .execute();
    expect(busy).toEqual([]);
    const [g] = (await noor.get('/v1/me/accounts')).accounts;
    seen.length = 0;
    await noor.req('DELETE', `/v1/me/accounts/${g.id}`);
    expect(seen.find((s) => s.path === '/google/revoke')?.form).toEqual({ token: 'g-refresh' });
  });

  it('is for adults, and says on the privacy page what is read and kept', async () => {
    const young = await signup(t, { birthDate: '2012-01-01' });
    expect(
      (await young.req('POST', '/v1/me/accounts/google/start', { uses: ['calendar'], back: 'web' }))
        .statusCode,
    ).toBe(403);
    const page = (await t.app.inject({ method: 'GET', url: '/privacy' })).body.replace(/\s+/g, ' ');
    expect(page).toContain('the start and end of each busy time for the next 90 days');
    expect(page).toContain('never an event&rsquo;s title, its people or its place');
  });
});
