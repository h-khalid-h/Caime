import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Mail, memoryMailer } from '../src/lib/email';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const HOUR = 3_600_000;
let t: TestApp;
let mail: ReturnType<typeof memoryMailer>;
let noor: Client;

const last = (): Mail => {
  const m = mail.outbox.at(-1);
  if (!m) throw new Error('no mail went out');
  return m;
};
const codeIn = (text: string) => /is (\d{6})\./.exec(text)?.[1] ?? '';
const linkIn = (text: string) => /https?:\/\/\S+/.exec(text)?.[0] ?? '';

beforeAll(async () => {
  mail = memoryMailer();
  t = await createTestApp({}, { mail });
  noor = await signup(t, { displayName: 'Noor Haddad', email: 'noor@example.com' });
  await t.ctx.flush();
});
afterAll(async () => {
  await t.close();
});

describe('confirming an address (R48)', () => {
  it('sends six digits at sign-up, and the right ones confirm it', async () => {
    expect(mail.outbox).toHaveLength(1);
    expect(last()).toMatchObject({ to: 'noor@example.com' });
    expect(last().subject).toMatch(/^\d{6} is your Caime code$/);
    const code = codeIn(last().text);
    expect(code).toHaveLength(6);
    expect((await noor.get('/v1/auth/session')).user.emailVerified).toBe(false);
    const wrong = await noor.req('POST', '/v1/auth/email/verify', { code: '000000' });
    expect([wrong.statusCode, wrong.json().error.code]).toEqual([400, 'wrong_code']);
    const ok = await noor.post('/v1/auth/email/verify', {
      code: ` ${code.slice(0, 3)} ${code.slice(3)} `,
    });
    expect(ok.user.emailVerified).toBe(true);
    // Once confirmed, there's nothing to send, and the old code is gone.
    const again = await noor.req('POST', '/v1/auth/email/send');
    expect(again.statusCode).toBe(409);
    expect((await noor.req('POST', '/v1/auth/email/verify', { code })).statusCode).toBe(400);
  });

  it('a new code replaces the last, runs out in a day, and gives up after ten wrong tries', async () => {
    const alex = await signup(t, { displayName: 'Alex Chen', email: 'alex@example.com' });
    await t.ctx.flush();
    const first = codeIn(last().text);
    await alex.post('/v1/auth/email/send');
    await t.ctx.flush();
    const second = codeIn(last().text);
    expect(mail.outbox).toHaveLength(3);
    expect((await alex.req('POST', '/v1/auth/email/verify', { code: first })).statusCode).toBe(
      first === second ? 200 : 400,
    );
    if (first !== second) {
      for (let i = 0; i < 10; i++)
        await alex.req('POST', '/v1/auth/email/verify', { code: '999999' });
      const spent = await alex.req('POST', '/v1/auth/email/verify', { code: second });
      expect([spent.statusCode, spent.json().error.code]).toEqual([400, 'code_expired']);
      await alex.post('/v1/auth/email/send');
      await t.ctx.flush();
      t.clock.advance(25 * HOUR);
      const late = await alex.req('POST', '/v1/auth/email/verify', { code: codeIn(last().text) });
      expect(late.json().error.code).toBe('code_expired');
    }
  });
});

describe('a forgotten password (R48)', () => {
  it('answers the same for any address, mails a link to an account\u2019s, and the link works once', async () => {
    const before = mail.outbox.length;
    const nobody = await noor.req('POST', '/v1/auth/reset', { email: 'nobody@example.com' });
    expect(nobody.statusCode).toBe(200);
    await t.ctx.flush();
    expect(mail.outbox).toHaveLength(before);
    const ask = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/reset',
      payload: { email: 'noor@example.com' },
    });
    expect(ask.statusCode).toBe(200);
    await t.ctx.flush();
    expect(mail.outbox).toHaveLength(before + 1);
    expect(last().subject).toBe('Reset your Caime password');
    const link = linkIn(last().text);
    expect(link).toMatch(/^http:\/\/localhost:8787\/reset\?token=[\w-]{40,}$/);
    const token = new URL(link).searchParams.get('token') ?? '';

    // Signed in here with the new password; the old session and password are gone.
    const done = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/reset/confirm',
      payload: { token, newPassword: 'a brand new passphrase', client: 'native' },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json().user.emailVerified).toBe(true);
    expect(done.json().token).toBeTruthy();
    expect((await noor.req('GET', '/v1/auth/session')).statusCode).toBe(401);
    const login = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        identifier: 'noor@example.com',
        password: 'a brand new passphrase',
        client: 'native',
      },
    });
    expect(login.statusCode).toBe(200);
    const twice = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/reset/confirm',
      payload: { token, newPassword: 'another passphrase here', client: 'native' },
    });
    expect([twice.statusCode, twice.json().error.code]).toEqual([400, 'invalid_reset']);
  });

  it('a link runs out in an hour', async () => {
    await t.app.inject({
      method: 'POST',
      url: '/v1/auth/reset',
      payload: { email: 'noor@example.com' },
    });
    await t.ctx.flush();
    const token = new URL(linkIn(last().text)).searchParams.get('token') ?? '';
    t.clock.advance(HOUR + 60_000);
    const late = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/reset/confirm',
      payload: { token, newPassword: 'yet another passphrase', client: 'native' },
    });
    expect(late.json().error.code).toBe('invalid_reset');
  });
});

describe('without a mail server', () => {
  it('sign-up sends nothing, and a reset says to use a recovery code', async () => {
    const quiet = await createTestApp();
    try {
      const sam = await signup(quiet, { displayName: 'Sam Rivera' });
      const r = await quiet.app.inject({
        method: 'POST',
        url: '/v1/auth/reset',
        payload: { email: 'sam@example.com' },
      });
      expect([r.statusCode, r.json().error.code]).toEqual([503, 'email_unavailable']);
      expect((await sam.req('POST', '/v1/auth/email/send')).statusCode).toBe(503);
    } finally {
      await quiet.close();
    }
  });
});
