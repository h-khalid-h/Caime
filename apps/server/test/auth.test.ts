import { uuidv7 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashRecoveryCode, hashToken, matchRecoveryCode, recoverySalt } from '../src/lib/crypto';
import { tooMany } from '../src/lib/errors';
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
  birthDate: '1990-12-31',
  country: 'EG',
  timeZone: 'Africa/Cairo',
  locale: 'ar-EG',
  client: 'native',
};

const recover = (identifier: string, code: string) =>
  t.app.inject({
    method: 'POST',
    url: '/v1/auth/recover',
    payload: { identifier, code, newPassword: 'a brand new passphrase', client: 'native' },
  });

describe('sign-up', () => {
  it('creates an account with local defaults, recovery codes and a session', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/v1/auth/signup', payload: base });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toMatchObject({
      handle: 'sarah',
      displayName: 'Sarah Smith',
      timeZone: 'Africa/Cairo',
      country: 'EG',
      currency: 'EGP',
      birthDate: '1990-12-31',
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

  it('refuses a reserved handle in the words it uses for a taken one (R35)', async () => {
    const signUpAs = (handle: string) =>
      t.app.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: { ...base, email: `${handle.replace(/\W/g, '')}.r35@example.com`, handle },
      });
    const taken = await signUpAs(base.handle);
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({
      error: { code: 'handle_taken', message: 'That handle isn’t available.' },
    });
    const reservedOnes = ['caime', 'Caime', 'cai.me', 'caime.support', 'support', 'momo', 'you'];
    for (const handle of reservedOnes) {
      const reserved = await signUpAs(handle);
      expect(reserved.statusCode, handle).toBe(409);
      expect(reserved.json(), handle).toEqual(taken.json());
    }
    const nobody = await t.ctx.db
      .selectFrom('users')
      .select('handle')
      .where('email', 'like', '%.r35@example.com')
      .execute();
    expect(nobody).toEqual([]);
    // A name that only looks like one is someone's own.
    expect((await signUpAs('cai.mei')).statusCode).toBe(201);
  });

  it('takes the minimum age on the birthday, where they are (R29)', async () => {
    const was = t.clock.now.toISOString();
    // 05:00 on 1 June in Tokyo, still 31 May in UTC and in New York: a 13th birthday.
    t.clock.set('2026-05-31T20:00:00.000Z');
    try {
      const at = (timeZone: string, handle: string, birthDate = '2013-06-01') =>
        t.app.inject({
          method: 'POST',
          url: '/v1/auth/signup',
          payload: { ...base, email: `${handle}@example.com`, handle, birthDate, timeZone },
        });
      const york = await at('America/New_York', 'yorkteen');
      expect(york.statusCode).toBe(400);
      expect(york.json().error.code).toBe('too_young');
      const tokyo = await at('Asia/Tokyo', 'tokyoteen');
      expect(tokyo.statusCode).toBe(201);
      expect(tokyo.json().user).toMatchObject({ birthDate: '2013-06-01', minor: true });
      // A day younger, in Tokyo too.
      expect((await at('Asia/Tokyo', 'tokyokid', '2013-06-02')).json().error.code).toBe(
        'too_young',
      );
    } finally {
      t.clock.set(was);
    }
  });

  it('asks for a day that has come, and a country that is one', async () => {
    const tryWith = (patch: Record<string, unknown>, handle: string) =>
      t.app.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: { ...base, email: `${handle}@example.com`, handle, ...patch },
      });
    const cases = [
      [{ birthDate: '1990-02-30' }, 'birthDate'],
      [{ birthDate: '2099-01-01' }, 'birthDate'],
      [{ birthDate: '17/05/1990' }, 'birthDate'],
      [{ country: 'ZZ' }, 'country'],
      [{ country: undefined }, 'country'],
    ] as const;
    for (const [i, [patch, field]] of cases.entries()) {
      const res = await tryWith(patch, `wrong${i}`);
      expect(res.statusCode, JSON.stringify(patch)).toBe(400);
      expect(res.json().error.details.fields[0].path).toBe(field);
    }
  });

  it('gives teen accounts protective privacy defaults (R29)', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: { ...base, email: 'teen@example.com', handle: 'teen', birthDate: '2010-12-31' },
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

describe('where someone lives', () => {
  it('lists every country in their language, and suggests the one their device is in', async () => {
    const get = async (query: string) =>
      (await t.app.inject({ method: 'GET', url: `/v1/countries?${query}` })).json();
    const cairo = await get('locale=ar&timeZone=Africa%2FCairo');
    expect(cairo.suggested).toBe('EG');
    expect(cairo.countries).toHaveLength(250);
    expect(cairo.countries).toContainEqual({ code: 'EG', name: 'مصر' });
    // Kosovo, which ISO's own list leaves out, is there to choose; and names are as the whole tag
    // writes them (Traditional Chinese in Taiwan, European Portuguese in Portugal).
    expect((await get('locale=en')).countries).toContainEqual({ code: 'XK', name: 'Kosovo' });
    expect((await get('locale=zh-TW')).countries).toContainEqual({ code: 'US', name: '美國' });
    expect((await get('locale=zh-CN')).countries).toContainEqual({ code: 'US', name: '美国' });
    expect((await get('locale=pt-PT')).countries).toContainEqual({ code: 'IR', name: 'Irão' });
    // An English phone in Cairo is still in Cairo; an older name for a zone still counts.
    expect((await get('locale=en-US&timeZone=Africa%2FCairo')).suggested).toBe('EG');
    expect((await get('locale=en&timeZone=Asia%2FCalcutta')).suggested).toBe('IN');
    // No time zone: the language's region, if it names one.
    expect((await get('locale=en-GB')).suggested).toBe('GB');
    expect((await get('locale=en')).suggested).toBeNull();
    expect((await get('timeZone=UTC')).suggested).toBeNull();
  });

  it('moves the work week with them, unless they chose their own', async () => {
    const eg = await signup(t, { locale: 'ar-EG', timeZone: 'Africa/Cairo' });
    expect(eg.user).toMatchObject({ country: 'EG', currency: 'EGP', workweek: [0, 1, 2, 3, 4] });
    const moved = (await eg.patch('/v1/me', { country: 'DE' })).user;
    expect(moved).toMatchObject({ country: 'DE', currency: 'EUR', workweek: [1, 2, 3, 4, 5] });
    // Days of their own stay theirs.
    await eg.patch('/v1/me', { workweek: [1, 2, 3, 4] });
    expect((await eg.patch('/v1/me', { country: 'EG' })).user.workweek).toEqual([1, 2, 3, 4]);
    const nowhere = await eg.req('PATCH', '/v1/me', { country: 'ZZ' });
    expect(nowhere.statusCode).toBe(400);
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
    expect(taken).toMatchObject({ available: false, reason: 'That handle isn’t available.' });
    expect(taken.suggestion).toMatch(new RegExp(`^${base.handle.slice(0, 26)}\\d+$`));
    expect((await check(taken.suggestion)).available).toBe(true);
    expect(await check('a')).toMatchObject({ available: false, suggestion: null });
  });

  it('says a reserved handle isn’t available as it says of a taken one, and never offers one', async () => {
    const check = async (handle: string) =>
      (
        await t.app.inject({
          method: 'GET',
          url: `/v1/me/handle-available?handle=${encodeURIComponent(handle)}`,
        })
      ).json();
    const taken = await check(base.handle);
    for (const handle of ['support', 'CAIME', 'cai.me', 'caime.help', 'zuzu', 'people']) {
      const reserved = await check(handle);
      expect(reserved, handle).toMatchObject({ available: false, reason: taken.reason });
      // What it offers instead is free for anyone.
      if (reserved.suggestion) expect((await check(reserved.suggestion)).available).toBe(true);
    }
    // Every "caime" with a number after it is the product's too, so there's nothing to offer.
    expect(await check('caime')).toEqual({ ...taken, suggestion: null });
    expect((await check('support')).suggestion).toMatch(/^support\d+$/);
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
    const cookie = login.cookies.find((c) => c.name === 'caime_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    const session = await t.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      cookies: { caime_session: cookie.value },
    });
    expect(session.statusCode).toBe(200);
    const noHeader = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      cookies: { caime_session: cookie.value },
    });
    expect(noHeader.statusCode).toBe(403);
    expect(noHeader.json().error.code).toBe('csrf');
    const withHeader = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      cookies: { caime_session: cookie.value },
      headers: { 'x-caime-client': 'web' },
    });
    expect(withHeader.statusCode).toBe(200);
    const after = await t.app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      cookies: { caime_session: cookie.value },
    });
    expect(after.statusCode).toBe(401);
    // The stale cookie is cleared, and with no cookie at all the answer is "signed out", not an error.
    expect(after.cookies.find((c) => c.name === 'caime_session')?.value).toBe('');
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

  it('keeps codes only as slow hashes, salted for each account', async () => {
    const [a, b] = [await signup(t), await signup(t)];
    const kept = await t.ctx.db
      .selectFrom('recovery_codes')
      .select(['user_id', 'code_hash', 'salt'])
      .where('user_id', 'in', [a.user.id, b.user.id])
      .execute();
    expect(kept).toHaveLength(20);
    // Nothing a fast hash of a code would find.
    const fast = new Set(
      [...a.recoveryCodes, ...b.recoveryCodes].map((c) => hashToken(c).toString('hex')),
    );
    expect(kept.some((k) => fast.has(k.code_hash.toString('hex')))).toBe(false);
    const salts = new Set(kept.map((k) => k.salt.toString('hex')));
    expect(salts.size).toBe(2);
    expect(kept.every((k) => k.salt.length === 16)).toBe(true);
    // Nor can one be kept without its salt, as a fast hash was.
    await expect(
      t.ctx.db
        .insertInto('recovery_codes')
        .values({ id: uuidv7(), user_id: a.user.id, code_hash: hashToken('ABCD-2345') } as never)
        .execute(),
    ).rejects.toMatchObject({ code: '23502' });
    // A code works only for its own account.
    expect((await recover(b.user.handle, a.recoveryCodes[0]!)).statusCode).toBe(400);
    expect((await recover(a.user.handle, a.recoveryCodes[3]!)).statusCode).toBe(200);
  });

  it('makes one set of new codes at a time: two at once leave one set, under one salt', async () => {
    const u = await signup(t);
    const make = () =>
      u.req('POST', '/v1/auth/recovery-codes', { password: 'correct horse battery' });
    // While another holds the account, new codes wait for it rather than going in beside its
    // (a lock the codes' own foreign key doesn't wait for, so only the account's lock does).
    let waiting!: ReturnType<typeof make>;
    await t.ctx.db.transaction().execute(async (trx) => {
      await trx
        .selectFrom('users')
        .select('id')
        .where('id', '=', u.user.id)
        .forNoKeyUpdate()
        .execute();
      waiting = make();
      const first = await Promise.race([
        waiting.then(() => 'made'),
        new Promise((r) => setTimeout(() => r('waited'), 1500)),
      ]);
      expect(first).toBe('waited');
    });
    expect((await waiting).statusCode).toBe(200);
    const made = await Promise.all([make(), make()]);
    expect(made.map((r) => r.statusCode)).toEqual([200, 200]);
    const kept = await t.ctx.db
      .selectFrom('recovery_codes')
      .select(['salt'])
      .where('user_id', '=', u.user.id)
      .execute();
    expect(kept).toHaveLength(10);
    expect(new Set(kept.map((k) => k.salt.toString('hex'))).size).toBe(1);
  });

  it('makes one slow hash a try, whatever it finds, so its time says nothing', async () => {
    let hashes = 0;
    const counted = (code: string, salt: Buffer) => {
      hashes++;
      return hashRecoveryCode(code, salt);
    };
    const salt = recoverySalt();
    const theirs = await hashRecoveryCode('ABCD-EFGH', salt);
    const cases: Array<[Parameters<typeof matchRecoveryCode>[1], string | null]> = [
      [[], null],
      [[{ id: 'wrong', code_hash: await hashRecoveryCode('WXYZ-2345', salt), salt }], null],
      [
        [
          { id: 'other', code_hash: await hashRecoveryCode('WXYZ-2345', salt), salt },
          { id: 'this', code_hash: theirs, salt },
        ],
        'this',
      ],
    ];
    for (const [stored, found] of cases) {
      hashes = 0;
      expect(await matchRecoveryCode('abcd efgh', stored, counted)).toBe(found);
      expect(hashes).toBe(1);
    }
  });

  it('takes a code tried twice at once only once', async () => {
    const u = await signup(t);
    const code = u.recoveryCodes[1]!;
    const tries = await Promise.all([recover(u.user.handle, code), recover(u.user.handle, code)]);
    expect(tries.map((r) => r.statusCode).sort()).toEqual([200, 400]);
  });
});

describe('the password, asked again while signed in', () => {
  it('has few tries, on each route that asks, before anything else is done', async () => {
    const u = await signup(t);
    const limiter = t.ctx.limiter;
    const real = limiter.hit.bind(limiter);
    const tries: string[] = [];
    let full = false;
    limiter.hit = (key, limit, windowMs, now) => {
      if (key.startsWith('password-try:')) {
        tries.push(key);
        if (full) throw tooMany(60);
      }
      real(key, limit, windowMs, now);
    };
    try {
      const wrong = 'not my password';
      const change = { currentPassword: wrong, newPassword: 'another good passphrase' };
      expect((await u.req('POST', '/v1/auth/password', change)).statusCode).toBe(400);
      const codes = { password: wrong };
      expect((await u.req('POST', '/v1/auth/recovery-codes', codes)).statusCode).toBe(400);
      expect(tries).toEqual([`password-try:${u.user.id}`, `password-try:${u.user.id}`]);
      full = true;
      const right = { password: 'correct horse battery' };
      expect((await u.req('POST', '/v1/auth/recovery-codes', right)).statusCode).toBe(429);
      // The codes are as they were.
      expect((await recover(u.user.handle, u.recoveryCodes[0]!)).statusCode).toBe(200);
    } finally {
      delete (limiter as { hit?: unknown }).hit;
    }
  });
});
