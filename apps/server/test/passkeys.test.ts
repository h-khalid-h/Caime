/**
 * Passkeys (R36): added after the password, listed and removed, and a way in that makes the
 * same session a password does; never for a phishing origin, another account's handle, a
 * suspended account or a challenge used once already; closed with every other way in by a
 * recovery; in the person's export without its key.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSKEYS_MAX } from '../src/lib/passkeys';
import { sweepRecords } from '../src/lib/retention';
import { type Client, createTestApp, signup, type TestApp } from './helpers';
import { softAuthenticator } from './soft-authenticator';

const ORIGIN = 'http://localhost:8787';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
let t: TestApp;
let noor: Client;

const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'POST', url, payload: payload as object, headers });

/** A passkey added to `who`'s account by `key`, the whole way through. */
async function addPasskey(who: Client, key: ReturnType<typeof softAuthenticator>) {
  const start = await who.req(
    'POST',
    '/v1/auth/passkeys/start',
    { password: 'correct horse battery' },
    { 'user-agent': MAC_CHROME },
  );
  expect(start.statusCode).toBe(200);
  const { challengeId, options } = start.json();
  const added = await who.req(
    'POST',
    '/v1/auth/passkeys',
    { challengeId, credential: key.create(options) },
    { 'user-agent': MAC_CHROME },
  );
  expect(added.statusCode, added.body).toBe(200);
  return added.json().passkey;
}

async function signInWith(key: ReturnType<typeof softAuthenticator>, as?: string, handle?: string) {
  const opts = await post('/v1/auth/passkeys/signin/options', {});
  expect(opts.statusCode).toBe(200);
  const { challengeId, options } = opts.json();
  return post('/v1/auth/passkeys/signin', {
    challengeId,
    credential: key.get(options, as, handle),
    client: 'native',
  });
}

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
});
afterAll(async () => {
  await t.close();
});

describe('passkeys (R36)', () => {
  it('are added after the password, named by the browser that made them, and listed', async () => {
    const wrong = await noor.req('POST', '/v1/auth/passkeys/start', { password: 'nope' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.code).toBe('wrong_password');
    const key = softAuthenticator(ORIGIN);
    const start = await noor.req('POST', '/v1/auth/passkeys/start', {
      password: 'correct horse battery',
    });
    const { options } = start.json();
    expect(options.rp).toEqual({ name: 'Caime', id: 'localhost' });
    expect(options.user.name).toBe(noor.user.handle);
    expect(options.authenticatorSelection).toMatchObject({ residentKey: 'required' });
    const passkey = await addPasskey(noor, key);
    expect(passkey).toMatchObject({ id: key.id, name: 'Chrome · macOS', synced: true });
    expect((await noor.get('/v1/me/passkeys')).passkeys.map((p: { id: string }) => p.id)).toEqual([
      key.id,
    ]);
    // The next one is asked not to be made on the same authenticator again.
    const next = (
      await noor.req('POST', '/v1/auth/passkeys/start', { password: 'correct horse battery' })
    ).json();
    expect(next.options.excludeCredentials.map((c: { id: string }) => c.id)).toEqual([key.id]);
    const audit = await t.ctx.db
      .selectFrom('audit_log')
      .select('target')
      .where('action', '=', 'auth.passkey_added')
      .execute();
    expect(audit.map((a) => a.target)).toContain(key.id);
  });

  it('sign in as a password does: a session, the last use kept, the audit saying how', async () => {
    const lina = await signup(t, { displayName: 'Lina Farah' });
    const key = softAuthenticator(ORIGIN);
    await addPasskey(lina, key);
    const res = await signInWith(key);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.user.id).toBe(lina.user.id);
    expect(body.token).toMatch(/^csy_/);
    const me = await t.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(me.json().user.id).toBe(lina.user.id);
    const row = await t.ctx.db
      .selectFrom('passkeys')
      .select(['counter', 'last_used_at'])
      .where('id', '=', key.id)
      .executeTakeFirstOrThrow();
    expect(Number(row.counter)).toBe(1);
    expect(row.last_used_at?.toISOString()).toBe(t.clock.now.toISOString());
    const login = await t.ctx.db
      .selectFrom('audit_log')
      .select('metadata')
      .where('action', '=', 'auth.login')
      .where('actor_id', '=', lina.user.id)
      .execute();
    expect(login.map((l) => l.metadata)).toContainEqual({ method: 'passkey' });
  });

  it('never for another origin, another account, a challenge used before or a suspended account', async () => {
    const sami = await signup(t, { displayName: 'Sami Aziz' });
    const key = softAuthenticator(ORIGIN);
    await addPasskey(sami, key);
    // A page elsewhere asking for Caime's passkey gets nothing.
    const phished = await signInWith(key, 'https://caime-login.example');
    expect(phished.statusCode).toBe(401);
    expect(phished.json().error.code).toBe('invalid_credentials');
    // The authenticator says it's someone else's account: refused.
    const other = await signInWith(key, ORIGIN, Buffer.from(noor.user.id).toString('base64url'));
    expect(other.statusCode).toBe(401);
    // An answer replayed with its challenge already spent.
    const opts = (await post('/v1/auth/passkeys/signin/options', {})).json();
    const answer = key.get(opts.options);
    expect(
      (
        await post('/v1/auth/passkeys/signin', {
          challengeId: opts.challengeId,
          credential: answer,
        })
      ).statusCode,
    ).toBe(200);
    const again = await post('/v1/auth/passkeys/signin', {
      challengeId: opts.challengeId,
      credential: answer,
    });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe('passkey_failed');
    // A challenge older than its few minutes is no use either.
    const stale = (await post('/v1/auth/passkeys/signin/options', {})).json();
    t.clock.advance(6 * 60_000);
    const late = await post('/v1/auth/passkeys/signin', {
      challengeId: stale.challengeId,
      credential: key.get(stale.options),
    });
    expect(late.json().error.code).toBe('passkey_failed');
    // Suspended, the passkey opens nothing.
    await t.ctx.db
      .updateTable('users')
      .set({ suspended_at: t.clock.now })
      .where('id', '=', sami.user.id)
      .execute();
    const held = await signInWith(key);
    expect(held.statusCode).toBe(403);
    expect(held.json().error.code).toBe('suspended');
  });

  it('are removed one by one, and all of them by a recovery, which closes every way in', async () => {
    const rami = await signup(t, { displayName: 'Rami Nasser' });
    const one = softAuthenticator(ORIGIN);
    const two = softAuthenticator(ORIGIN);
    await addPasskey(rami, one);
    await addPasskey(rami, two);
    expect((await rami.req('DELETE', `/v1/me/passkeys/${one.id}`)).statusCode).toBe(200);
    expect((await rami.req('DELETE', `/v1/me/passkeys/${one.id}`)).statusCode).toBe(404);
    expect((await signInWith(one)).statusCode).toBe(401);
    // Someone else can't remove a passkey that isn't theirs.
    expect((await noor.req('DELETE', `/v1/me/passkeys/${two.id}`)).statusCode).toBe(404);
    expect((await signInWith(two)).statusCode).toBe(200);
    // In the person's export: what it's called and when, never its key.
    const exported = await rami.req('GET', '/v1/me/export');
    expect(exported.json().passkeys).toEqual([
      expect.objectContaining({ name: 'Chrome · macOS', synced: true }),
    ]);
    expect(exported.body).not.toContain('public_key');
    // A recovery code signs them in afresh and closes every other way in, passkeys included.
    const recovered = await post('/v1/auth/recover', {
      identifier: rami.user.handle,
      code: rami.recoveryCodes[0],
      newPassword: 'a whole new sentence',
      client: 'native',
    });
    expect(recovered.statusCode, recovered.body).toBe(200);
    expect((await signInWith(two)).statusCode).toBe(401);
  });

  it('stop at as many as an account keeps, and the stale challenges are swept', async () => {
    const zara = await signup(t, { displayName: 'Zara Malik' });
    await t.ctx.db
      .insertInto('passkeys')
      .values(
        Array.from({ length: PASSKEYS_MAX }, (_, i) => ({
          id: `key-${zara.user.id}-${i}`,
          user_id: zara.user.id,
          public_key: Buffer.from([1]),
        })),
      )
      .execute();
    const full = await zara.req('POST', '/v1/auth/passkeys/start', {
      password: 'correct horse battery',
    });
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe('limit');
    await post('/v1/auth/passkeys/signin/options', {});
    t.clock.advance(10 * 60_000);
    await sweepRecords(t.ctx);
    const left = await t.ctx.db
      .selectFrom('passkey_challenges')
      .select('id')
      .where('expires_at', '<', t.clock.now)
      .execute();
    expect(left).toEqual([]);
  });
});
