import { createHash, randomBytes } from 'node:crypto';
import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let dev: Client; // makes the app
let noor: Client; // lets it in
let sam: Client;
let convo: string;
let clientId: string;
const REDIRECT = 'https://digest.example/callback';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}
const request = (challenge: string, extra: Record<string, string> = {}) => ({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: REDIRECT,
  scope: 'messages:read messages:write',
  state: 'xyz',
  code_challenge: challenge,
  code_challenge_method: 'S256',
  ...extra,
});
const consent = (c: Client, params: Record<string, string>) =>
  c.req('GET', `/v1/oauth/authorize?${new URLSearchParams(params)}`);
async function allow(c: Client, params: Record<string, string>) {
  const res = await c.req('POST', '/v1/oauth/authorize', { ...params, decision: 'allow' });
  expect(res.statusCode).toBe(200);
  const url = new URL(res.json().redirect);
  return { url, code: url.searchParams.get('code') ?? '' };
}
/** The token endpoint, as an OAuth library calls it: a form. */
const token = (form: Record<string, string>, headers: Record<string, string> = {}) =>
  t.app.inject({
    method: 'POST',
    url: '/v1/oauth/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    payload: new URLSearchParams(form).toString(),
  });
const as = (bearer: string, method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown) =>
  t.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${bearer}` },
    ...(body ? { payload: body as object } : {}),
  });
async function signedIn(c: Client, scope = 'messages:read messages:write') {
  const { verifier, challenge } = pkce();
  const { code } = await allow(c, request(challenge, { scope }));
  const res = await token({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    client_id: clientId,
    code_verifier: verifier,
  });
  expect(res.statusCode).toBe(200);
  return res.json() as { access_token: string; refresh_token: string; scope: string };
}

beforeAll(async () => {
  t = await createTestApp();
  dev = await signup(t, { displayName: 'Dana Developer' });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  const r = await noor.post('/v1/connections/requests', { toUserId: sam.user.id });
  convo = (await sam.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
});

afterAll(async () => {
  await t.close();
});

describe('OAuth for third-party apps (PRD §74)', () => {
  it('says where everything is, for OAuth libraries (RFC 8414)', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server',
    });
    expect(res.statusCode).toBe(200);
    const base = new URL(t.ctx.config.PUBLIC_URL).origin;
    expect(res.json()).toMatchObject({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/v1/oauth/token`,
      revocation_endpoint: `${base}/v1/oauth/revoke`,
      code_challenge_methods_supported: ['S256'],
      scopes_supported: expect.arrayContaining(['messages:read', 'messages:write']),
    });
  });

  it('a developer registers an app with where people come back to', async () => {
    const bad = await dev.req('POST', '/v1/me/oauth-apps', {
      name: 'Weekly digest',
      redirectUris: ['http://digest.example/callback'],
    });
    expect(bad.statusCode).toBe(400);
    const made = await dev.req('POST', '/v1/me/oauth-apps', {
      name: 'Weekly digest',
      website: 'https://digest.example',
      redirectUris: [REDIRECT],
    });
    expect(made.statusCode).toBe(201);
    // A public app (on a phone, in a browser) has no secret: PKCE proves it.
    expect(made.json()).toMatchObject({ app: { confidential: false }, clientSecret: null });
    clientId = made.json().app.clientId;
    expect((await dev.get('/v1/me/oauth-apps')).apps).toHaveLength(1);
  });

  it('asks the person, naming who made it and what it wants; nothing for a request that isn’t right', async () => {
    const { challenge } = pkce();
    const shown = (await consent(noor, request(challenge))).json();
    expect(shown).toEqual({
      app: {
        name: 'Weekly digest',
        website: 'https://digest.example',
        owner: { displayName: 'Dana Developer', handle: dev.user.handle },
      },
      scopes: [
        { scope: 'messages:read', label: 'Read your conversations and search them' },
        { scope: 'messages:write', label: 'Send messages as you, marked with what sent them' },
      ],
      redirectUri: REDIRECT,
      allowedBefore: false,
    });
    const refused = async (extra: Record<string, string>) =>
      (await consent(noor, request(challenge, extra))).json().error.message;
    expect(await refused({ redirect_uri: 'https://evil.example/callback' })).toBe(
      'That app didn’t register this return address.',
    );
    expect(await refused({ scope: 'messages:read account:delete' })).toBe(
      '“account:delete” isn’t something an app can ask for.',
    );
    expect(await refused({ client_id: 'app_nobody' })).toBe(
      'That app isn’t registered with Caishy.',
    );
    expect(
      (await consent(noor, request(challenge, { code_challenge_method: 'plain' }))).statusCode,
    ).toBe(400);
  });

  it('let in, it trades its code and verifier for tokens that act as the person, within what they allowed', async () => {
    const { verifier, challenge } = pkce();
    const { url, code } = await allow(noor, request(challenge));
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get('state')).toBe('xyz');
    const exchange = (v: string) =>
      token({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: v,
      });
    expect((await exchange(pkce().verifier)).json().error).toBe('invalid_grant');
    // Only where it was sent, and only by the app it was given to.
    const elsewhere = await token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://digest.example/other',
      client_id: clientId,
      code_verifier: verifier,
    });
    expect(elsewhere.json().error_description).toBe('The return address doesn’t match.');
    const other = (
      await dev.post('/v1/me/oauth-apps', { name: 'Other app', redirectUris: [REDIRECT] })
    ).app.clientId;
    const stolen = await token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: other,
      code_verifier: verifier,
    });
    expect(stolen.json().error).toBe('invalid_grant');
    const got = await exchange(verifier);
    expect(got.headers['cache-control']).toBe('no-store');
    const tokens = got.json();
    expect(tokens).toMatchObject({
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'messages:read messages:write',
    });
    expect(tokens.access_token).toMatch(/^cao_/);
    expect(tokens.refresh_token).toMatch(/^car_/);

    const sent = await as(tokens.access_token, 'POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      body: 'Your weekly digest is ready.',
    });
    expect(sent.json().message).toMatchObject({ senderId: noor.user.id, sentVia: 'Weekly digest' });
    expect((await as(tokens.access_token, 'GET', '/v1/tasks')).json().error.code).toBe(
      'token_scope',
    );
    expect(
      (await as(tokens.access_token, 'PATCH', '/v1/me', { displayName: 'x' })).json().error.code,
    ).toBe('token_route');
    // Asked again for the same, it says so.
    expect((await consent(noor, request(pkce().challenge))).json().allowedBefore).toBe(true);
  });

  it('a code works once, soon, for its own app; used again, what it gave ends', async () => {
    const { verifier, challenge } = pkce();
    const { code } = await allow(noor, request(challenge));
    const form = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    };
    const first = (await token(form)).json();
    const again = await token(form);
    expect(again.json()).toMatchObject({ error: 'invalid_grant' });
    expect((await as(first.access_token, 'GET', `/v1/conversations/${convo}`)).statusCode).toBe(
      401,
    );

    const late = pkce();
    const { code: slow } = await allow(noor, request(late.challenge));
    t.clock.advance(11 * 60_000);
    expect(
      (await token({ ...form, code: slow, code_verifier: late.verifier })).json().error_description,
    ).toBe('That code has expired.');
  });

  it('refresh tokens turn over each time, and one used twice ends the grant', async () => {
    const first = await signedIn(noor);
    const refresh = (r: string) =>
      token({ grant_type: 'refresh_token', refresh_token: r, client_id: clientId });
    const second = (await refresh(first.refresh_token)).json();
    expect(second.access_token).not.toBe(first.access_token);
    expect((await as(second.access_token, 'GET', `/v1/conversations/${convo}`)).statusCode).toBe(
      200,
    );
    // The first refresh token again: someone copied it. Both sides lose the grant.
    expect((await refresh(first.refresh_token)).json().error).toBe('invalid_grant');
    expect((await as(second.access_token, 'GET', `/v1/conversations/${convo}`)).statusCode).toBe(
      401,
    );
    expect((await refresh(second.refresh_token)).json().error).toBe('invalid_grant');
  });

  it('the person sees it and ends it; the app gives tokens back; its developer removing it ends it for everyone', async () => {
    const live = await signedIn(noor);
    const { apps } = await noor.get('/v1/me/connected-apps');
    expect(apps).toEqual([
      expect.objectContaining({
        name: 'Weekly digest',
        owner: 'Dana Developer',
        scopes: ['messages:read', 'messages:write'],
      }),
    ]);
    await noor.req('DELETE', `/v1/me/connected-apps/${apps[0].grantId}`);
    expect((await as(live.access_token, 'GET', `/v1/conversations/${convo}`)).statusCode).toBe(401);

    const given = await signedIn(noor);
    const back = await t.app.inject({
      method: 'POST',
      url: '/v1/oauth/revoke',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ token: given.refresh_token, client_id: clientId }).toString(),
    });
    expect(back.statusCode).toBe(200);
    expect((await as(given.access_token, 'GET', `/v1/conversations/${convo}`)).statusCode).toBe(
      401,
    );

    const kept = await signedIn(sam, 'messages:read');
    const mine = (await dev.get('/v1/me/oauth-apps')).apps.find(
      (a: { name: string }) => a.name === 'Weekly digest',
    );
    await dev.req('DELETE', `/v1/me/oauth-apps/${mine.id}`);
    expect((await as(kept.access_token, 'GET', `/v1/conversations/${convo}`)).statusCode).toBe(401);
  });

  it('a confidential app needs its secret; nobody under 18 lets an app in; declining sends them back', async () => {
    const made = await dev.post('/v1/me/oauth-apps', {
      name: 'Server app',
      redirectUris: [REDIRECT],
      confidential: true,
    });
    clientId = made.app.clientId;
    expect(made.clientSecret).toMatch(/^cas_/);
    const { verifier, challenge } = pkce();
    const { code } = await allow(noor, request(challenge));
    const form = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    };
    expect((await token({ ...form, client_id: clientId })).json().error).toBe('invalid_client');
    const basic = Buffer.from(`${clientId}:${made.clientSecret}`).toString('base64');
    expect((await token(form, { authorization: `Basic ${basic}` })).json().access_token).toMatch(
      /^cao_/,
    );

    const teen = await signup(t, { displayName: 'Rami Young', birthYear: 2011 });
    const minor = await teen.req('POST', '/v1/oauth/authorize', {
      ...request(pkce().challenge),
      decision: 'allow',
    });
    expect(minor.json().error.message).toBe('Apps act for people over 18.');

    const no = await noor.req('POST', '/v1/oauth/authorize', {
      ...request(pkce().challenge),
      decision: 'deny',
    });
    const url = new URL(no.json().redirect);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('code')).toBeNull();
  });

  it('only the app itself gives its tokens back; a garbled client is no client', async () => {
    const mine = (
      await dev.post('/v1/me/oauth-apps', { name: 'Digest two', redirectUris: [REDIRECT] })
    ).app.clientId;
    clientId = mine;
    const given = await signedIn(noor);
    const revoke = (form: Record<string, string>) =>
      t.app.inject({
        method: 'POST',
        url: '/v1/oauth/revoke',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams(form).toString(),
      });
    const works = async () =>
      (await as(given.access_token, 'GET', `/v1/conversations/${convo}`)).statusCode;

    // Another app holding it can't end it, and is answered as if it weren't a token.
    const other = (
      await dev.post('/v1/me/oauth-apps', { name: 'Digest three', redirectUris: [REDIRECT] })
    ).app.clientId;
    expect((await revoke({ token: given.refresh_token, client_id: other })).statusCode).toBe(200);
    expect(await works()).toBe(200);
    // No app at all: refused.
    expect((await revoke({ token: given.refresh_token })).json().error).toBe('invalid_client');
    // A Basic header that doesn't decode names no app, rather than failing.
    const garbled = await token(
      { grant_type: 'refresh_token', refresh_token: given.refresh_token },
      { authorization: `Basic ${Buffer.from('%E0%A4%A:x').toString('base64')}` },
    );
    expect(garbled.statusCode).toBe(401);
    expect(garbled.json().error).toBe('invalid_client');
    // Its own app gives it back.
    expect((await revoke({ token: given.access_token, client_id: mine })).statusCode).toBe(200);
    expect(await works()).toBe(401);
  });
});
