import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contactReturnOf } from '@caime/core';
import { newContactKey, openContactAccess } from '@caime/core/contact-seal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * Contacts from a Google or Microsoft account (R89): the server writes the consent link, trades
 * the provider's one-time code for an access, and hands it back sealed for the device that asked,
 * keeping nothing. A stand-in plays both providers' token endpoints.
 */
let t: TestApp;
let bare: TestApp;
let noor: Client;
let stub: Server;
let base: string;
let dir: string;
const exchanged: Array<Record<string, string>> = [];
const GIVEN = {
  access_token: 'ya29.only-for-the-device',
  expires_in: 3599,
  scope:
    'https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly',
};
let answer: { status: number; body: Record<string, unknown> } = { status: 200, body: GIVEN };

const form = (req: IncomingMessage) =>
  new Promise<Record<string, string>>((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(raw))));
  });

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    exchanged.push({ path: req.url ?? '', ...(await form(req)) });
    res.writeHead(answer.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(answer.body));
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  dir = mkdtempSync(join(tmpdir(), 'caime-contacts-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Caime</title>');
  t = await createTestApp({
    WEB_DIR: dir,
    GOOGLE_CLIENT_ID: 'google-client',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    GOOGLE_AUTH_URL: `${base}/google/auth`,
    GOOGLE_TOKEN_URL: `${base}/google/token`,
    GOOGLE_PEOPLE_API: 'https://people.example.test',
    MICROSOFT_CLIENT_ID: 'ms-client',
    MICROSOFT_CLIENT_SECRET: 'ms-secret',
    MICROSOFT_LOGIN_BASE: base,
    MICROSOFT_GRAPH_API: 'https://graph.example.test/',
  });
  bare = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
});

afterAll(async () => {
  await t.close();
  await bare.close();
  await new Promise((r) => stub.close(r));
  rmSync(dir, { recursive: true, force: true });
});

/** Starts a consent as the device would, and follows it to the provider's link. */
async function start(account: 'google' | 'microsoft', back: 'web' | 'app' = 'web') {
  const key = newContactKey();
  const { url } = await noor.post(`/v1/contacts/accounts/${account}/start`, { key, back });
  const link = new URL(url);
  return { key, link, state: link.searchParams.get('state') ?? '' };
}

/** The provider's return to the server, as a browser would follow it. */
async function back(account: string, query: Record<string, string>) {
  const res = await t.app.inject({
    method: 'GET',
    url: `/v1/contacts/accounts/${account}/back?${new URLSearchParams(query)}`,
  });
  expect(res.statusCode).toBe(303);
  expect(res.headers['cache-control']).toBe('no-store');
  const location = String(res.headers.location);
  return { location, back: contactReturnOf(location.split('#')[1] ?? '') };
}

describe('which accounts', () => {
  it('offers only the accounts this Caime has a client for, with where each is read', async () => {
    expect(await noor.get('/v1/contacts/accounts')).toEqual({
      accounts: [
        { id: 'google', api: 'https://people.example.test' },
        { id: 'microsoft', api: 'https://graph.example.test' },
      ],
    });
    const alone = await signup(bare);
    expect(await alone.get('/v1/contacts/accounts')).toEqual({ accounts: [] });
    const refused = await alone.req('POST', '/v1/contacts/accounts/google/start', {
      key: newContactKey(),
      back: 'web',
    });
    expect(refused.statusCode).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: '/v1/contacts/accounts' })).statusCode).toBe(
      401,
    );
  });

  it('says on the privacy page what is read, what is sent and what is kept', async () => {
    const page = (await t.app.inject({ method: 'GET', url: '/privacy' })).body.replace(/\s+/g, ' ');
    expect(page).toContain('sends only their email addresses');
    expect(page).toContain('nothing of them is kept');
    expect(page).toContain('access that lasts an hour');
    expect(page).toContain('including the Limited Use requirements');
  });

  it('lets the web app read those APIs and nothing else', async () => {
    const page = await t.app.inject({
      method: 'GET',
      url: '/connect',
      headers: { accept: 'text/html' },
    });
    const csp = String(page.headers['content-security-policy']);
    expect(csp).toContain('https://people.example.test');
    expect(csp).toContain('https://graph.example.test');
    expect(csp).not.toContain('googleapis.com');
  });
});

describe('a consent', () => {
  it('asks Google for the contacts alone, online, the account chosen each time', async () => {
    const { link } = await start('google');
    expect(`${link.origin}${link.pathname}`).toBe(`${base}/google/auth`);
    expect(Object.fromEntries(link.searchParams)).toEqual({
      client_id: 'google-client',
      redirect_uri: 'http://localhost:8787/v1/contacts/accounts/google/back',
      response_type: 'code',
      scope:
        'https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly',
      state: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
      prompt: 'select_account',
      access_type: 'online',
    });
  });

  it('trades the code for an access sealed for the device that asked, kept nowhere', async () => {
    const { key, state } = await start('google');
    exchanged.length = 0;
    const r = await back('google', { code: 'one-time-code', state });
    expect(r.location.startsWith('http://localhost:8787/connect#contacts=google&sealed=')).toBe(
      true,
    );
    expect(exchanged).toEqual([
      {
        path: '/google/token',
        client_id: 'google-client',
        client_secret: 'google-secret',
        code: 'one-time-code',
        redirect_uri: 'http://localhost:8787/v1/contacts/accounts/google/back',
        grant_type: 'authorization_code',
      },
    ]);
    // The address it comes back on carries nothing anyone else can use.
    expect(r.location).not.toContain('ya29');
    const sealed = r.back && 'sealed' in r.back ? r.back.sealed : '';
    expect(openContactAccess(key, 'google', sealed)).toBe('ya29.only-for-the-device');
    expect(openContactAccess(newContactKey(), 'google', sealed)).toBeNull();
    // Nothing of it was kept: no row anywhere holds the access.
    const kept = await t.ctx.db.selectFrom('server_settings').select(['key']).execute();
    expect(kept.map((k) => k.key)).toEqual(['contacts.state']);
  });

  it('returns to the phone app on its own scheme, and asks Microsoft for its own tenant', async () => {
    const { key, link, state } = await start('microsoft', 'app');
    expect(`${link.origin}${link.pathname}`).toBe(`${base}/common/oauth2/v2.0/authorize`);
    expect(link.searchParams.get('response_mode')).toBe('query');
    expect(link.searchParams.get('scope')).toBe(
      'https://graph.microsoft.com/Contacts.Read https://graph.microsoft.com/People.Read',
    );
    exchanged.length = 0;
    const r = await back('microsoft', { code: 'ms-code', state });
    expect(r.location.startsWith('caime://connect#contacts=microsoft&sealed=')).toBe(true);
    expect(exchanged[0]).toEqual(
      expect.objectContaining({
        path: '/common/oauth2/v2.0/token',
        client_secret: 'ms-secret',
        scope: 'https://graph.microsoft.com/Contacts.Read https://graph.microsoft.com/People.Read',
      }),
    );
    const sealed = r.back && 'sealed' in r.back ? r.back.sealed : '';
    expect(openContactAccess(key, 'microsoft', sealed)).toBe('ya29.only-for-the-device');
    // Sealed as Microsoft's, it never opens as Google's.
    expect(openContactAccess(key, 'google', sealed)).toBeNull();
  });

  it('says why when there is nothing: declined, refused, failed or too late', async () => {
    const declined = await start('google');
    expect((await back('google', { error: 'access_denied', state: declined.state })).back).toEqual({
      account: 'google',
      error: 'denied',
    });
    // Every permission unticked on Google's screen: an access to nothing.
    answer = { status: 200, body: { access_token: 'x', scope: 'openid' } };
    const unticked = await start('google');
    expect((await back('google', { code: 'c', state: unticked.state })).back).toEqual({
      account: 'google',
      error: 'denied',
    });
    answer = { status: 400, body: { error: 'invalid_grant' } };
    const failed = await start('google', 'app');
    const f = await back('google', { code: 'used', state: failed.state });
    expect(f.location.startsWith('caime://connect#')).toBe(true);
    expect(f.back).toEqual({ account: 'google', error: 'failed' });
    answer = { status: 200, body: GIVEN };
    // A state made for one account isn't another's, a changed one isn't anyone's, and none
    // lasts beyond ten minutes: each goes back to the web app, since where it came from can't
    // be told.
    const google = await start('google', 'app');
    exchanged.length = 0;
    const crossed = await back('microsoft', { code: 'c', state: google.state });
    expect(crossed.location).toBe('http://localhost:8787/connect#contacts=microsoft&error=expired');
    const changed = `${google.state.slice(0, -2)}${google.state.endsWith('AA') ? 'BB' : 'AA'}`;
    expect((await back('google', { code: 'c', state: changed })).back).toEqual({
      account: 'google',
      error: 'expired',
    });
    t.clock.advance(11 * 60_000);
    expect((await back('google', { code: 'c', state: google.state })).back).toEqual({
      account: 'google',
      error: 'expired',
    });
    expect(exchanged).toEqual([]);
  });

  it('takes only a key of 32 bytes and a known place to return to', async () => {
    for (const body of [
      { key: 'short', back: 'web' },
      { key: newContactKey(), back: 'https://elsewhere.example' },
      { key: newContactKey(), back: 'web', extra: true },
    ]) {
      expect((await noor.req('POST', '/v1/contacts/accounts/google/start', body)).statusCode).toBe(
        400,
      );
    }
    expect(
      (
        await noor.req('POST', '/v1/contacts/accounts/yahoo/start', {
          key: newContactKey(),
          back: 'web',
        })
      ).statusCode,
    ).toBe(404);
  });
});
