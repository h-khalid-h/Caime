import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientFor, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

const base = {
  email: 'sarah@example.com',
  password: 'correct horse battery',
  displayName: 'Sarah Smith',
  handle: 'sarah',
  birthYear: 1990,
  timeZone: 'Africa/Cairo',
  locale: 'ar-EG',
  client: 'native',
};

describe('sign-up', () => {
  it('creates an account with local defaults, recovery codes and a session', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/v1/auth/signup', payload: base });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toMatchObject({
      handle: 'sarah',
      displayName: 'Sarah Smith',
      timeZone: 'Africa/Cairo',
      region: 'EG',
      minor: false,
    });
    expect(body.user.workweek).toEqual([0, 1, 2, 3, 4]); // Sunday–Thursday in Egypt (R31)
    expect(body.recoveryCodes).toHaveLength(10);
    expect(body.token).toMatch(/^csy_/);
    const policies = await t.ctx.db
      .selectFrom('relationship_policies')
      .selectAll()
      .where('user_id', '=', body.user.id)
      .execute();
    expect(policies.length).toBeGreaterThan(8);
  });

  it('rejects taken emails and handles with a helpful message', async () => {
    const dup = await t.app.inject({ method: 'POST', url: '/v1/auth/signup', payload: base });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('email_taken');
    const dupHandle = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...base, email: 'other@example.com' },
    });
    expect(dupHandle.json().error.code).toBe('handle_taken');
  });

  it('enforces the minimum age conservatively (R29)', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...base, email: 'kid@example.com', handle: 'kid', birthYear: 2014 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('too_young');
  });

  it('gives teen accounts protective privacy defaults (R29)', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...base, email: 'teen@example.com', handle: 'teen', birthYear: 2010 },
    });
    expect(res.statusCode).toBe(201);
    const u = res.json().user;
    expect(u.minor).toBe(true);
    expect(u.privacy.discoverByEmail).toBe(false);
    expect(u.privacy.messageRequests).toBe('shared_connections');
  });

  it('validates input with field-level messages', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...base, email: 'x', handle: 'a' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details.fields.map((f: { path: string }) => f.path)).toEqual(
      expect.arrayContaining(['email', 'handle']),
    );
  });
});

describe('handle availability', () => {
  it('works before sign-up and offers a free alternative when taken', async () => {
    const check = async (handle: string) =>
      (
        await t.app.inject({ method: 'GET', url: `/v1/me/handle-available?handle=${handle}` })
      ).json();
    expect(await check('nobody.has.this')).toEqual({
      available: true,
      reason: null,
      suggestion: null,
    });
    const taken = await check(base.handle);
    expect(taken).toMatchObject({ available: false, reason: 'That handle is taken.' });
    expect(taken.suggestion).toMatch(new RegExp(`^${base.handle.slice(0, 26)}\\d+$`));
    expect((await check(taken.suggestion)).available).toBe(true);
    expect(await check('a')).toMatchObject({ available: false, suggestion: null });
  });
});

describe('sign-in and sessions', () => {
  it('signs in by email or @handle and rejects wrong passwords without saying which part was wrong', async () => {
    const byHandle = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { identifier: '@Sarah', password: base.password, client: 'native' },
    });
    expect(byHandle.statusCode).toBe(200);
    const wrong = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { identifier: 'sarah@example.com', password: 'nope nope nope', client: 'native' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.message).toBe('That email or handle and password don’t match.');
    const unknown = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { identifier: 'ghost', password: 'nope nope nope', client: 'native' },
    });
    expect(unknown.json().error.message).toBe(wrong.json().error.message);
  });

  it('web sessions use an httpOnly cookie and require the CSRF header on writes', async () => {
    const login = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { identifier: 'sarah', password: base.password, client: 'web' },
    });
    expect(login.json().token).toBeNull();
    const cookie = login.cookies.find((c) => c.name === 'caishy_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    const session = await t.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      cookies: { caishy_session: cookie.value },
    });
    expect(session.statusCode).toBe(200);
    const noHeader = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      cookies: { caishy_session: cookie.value },
    });
    expect(noHeader.statusCode).toBe(403);
    expect(noHeader.json().error.code).toBe('csrf');
    const withHeader = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      cookies: { caishy_session: cookie.value },
      headers: { 'x-caishy-client': 'web' },
    });
    expect(withHeader.statusCode).toBe(200);
    const after = await t.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      cookies: { caishy_session: cookie.value },
    });
    expect(after.statusCode).toBe(401);
    // The stale cookie is cleared, and with no cookie at all the answer is "signed out", not an error.
    expect(after.cookies.find((c) => c.name === 'caishy_session')?.value).toBe('');
    const anonymous = await t.app.inject({ method: 'GET', url: '/v1/auth/session' });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json()).toEqual({ user: null, session: null });
  });

  it('lists and revokes devices; changing the password signs out other devices', async () => {
    const a = await signup(t);
    const second = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        identifier: a.user.handle,
        password: 'correct horse battery',
        client: 'native',
        deviceName: 'Tablet',
      },
    });
    const b = clientFor(t, second.json().token, a.user);
    const { sessions } = await a.get('/v1/auth/sessions');
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    await a.post('/v1/auth/password', {
      currentPassword: 'correct horse battery',
      newPassword: 'another good passphrase',
    });
    expect((await b.req('GET', '/v1/auth/session')).statusCode).toBe(401);
    expect((await a.req('GET', '/v1/auth/session')).statusCode).toBe(200);
  });
});

describe('recovery without email', () => {
  it('a recovery code resets the password once, and only once', async () => {
    const u = await signup(t);
    const code = u.recoveryCodes[0]!;
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/recover',
      payload: {
        identifier: u.user.handle,
        code: code.toLowerCase().replace('-', ' '),
        newPassword: 'a brand new passphrase',
        client: 'native',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().recoveryCodesLeft).toBe(9);
    expect((await u.req('GET', '/v1/auth/session')).statusCode).toBe(401);
    const again = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/recover',
      payload: {
        identifier: u.user.handle,
        code,
        newPassword: 'yet another passphrase',
        client: 'native',
      },
    });
    expect(again.statusCode).toBe(400);
  });
});
