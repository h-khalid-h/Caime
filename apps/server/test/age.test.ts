/**
 * Age assurance (M16 B7): a check begun on the provider's page, its answer heard twice (the
 * signed notice and the person's return) and applied once, the standing core's rules make of it
 * (a document wins, an under-18 holds for its year, retrying a face lifts nothing), the triggers
 * that ask for one where a provider is set (starting an organization, selling, writing first to
 * a stranger), and nothing at all where none is.
 */
import { MINOR_HOLD_DAYS } from '@caime/core/age-assurance';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { assertAgeChecked } from '../src/lib/age';
import { buildExport } from '../src/lib/export';
import { processorsFor } from '../src/lib/processors';
import { KEPT_DAYS, sweepRecords } from '../src/lib/retention';
import { minorOf } from '../src/lib/users';
import { AGEMIN_ASSET, AGEMIN_SECRET, type AgeminStub, ageminStub, otherKey } from './agemin-stub';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const DAY = 86_400_000;
let stub: AgeminStub;
let t: TestApp;

const env = (extra: Record<string, string> = {}) => ({
  AGE_PROVIDER: 'agemin',
  AGEMIN_ASSET_ID: AGEMIN_ASSET,
  AGEMIN_SECRET_KEY: AGEMIN_SECRET,
  AGEMIN_WEBHOOK_PUBLIC_KEY: stub.publicKeyPem.replace(/\n/g, '\\n'),
  AGEMIN_API_URL: stub.url,
  AGEMIN_VERIFY_URL: 'https://verify.agemin.test',
  ...extra,
});

const notify = (app: TestApp, n: ReturnType<AgeminStub['notice']>) =>
  app.app.inject({
    method: 'POST',
    url: '/v1/age/webhook/agemin',
    headers: n.headers,
    payload: n.body,
  });

/** A check begun, and its reference read back from the provider's address. */
const begin = async (c: Client, back: 'web' | 'app' = 'web') => {
  const { url } = await c.post<{ url: string }>('/v1/me/age-check', { back });
  const ref = new URL(url).searchParams.get('reference_id') as string;
  return { url, ref };
};

const org = (c: Client, handle: string) =>
  c.req('POST', '/v1/orgs', { country: 'EG', name: 'Nile Tiles', handle, kind: 'shop' });

beforeAll(async () => {
  stub = await ageminStub();
  t = await createTestApp(env());
});
afterAll(async () => {
  await t.close();
  await stub.close();
});

describe('without a provider (M16 B7)', () => {
  it('asks nobody, offers nothing, and changes nothing', async () => {
    const plain = await createTestApp({});
    try {
      const noor = await signup(plain);
      const me = (await noor.get('/v1/me')).user;
      expect(me).toMatchObject({ ageCheck: null, ageCheckOffered: false });
      const res = await noor.req('POST', '/v1/me/age-check', { back: 'web' });
      expect([res.statusCode, res.json().error.code]).toEqual([503, 'age_check_unavailable']);
      expect((await org(noor, 'plaintiles')).statusCode).toBe(201);
      expect(processorsFor(plain.ctx.config).map((p) => p.id)).not.toContain('age');
    } finally {
      await plain.close();
    }
  });

  it('refuses a provider without its keys, and a trigger it doesn’t know, at start', () => {
    const base = { DATABASE_URL: 'postgres://x@localhost/x' };
    expect(() => loadConfig({ ...base, AGE_PROVIDER: 'agemin' })).toThrow(/AGEMIN_ASSET_ID/);
    expect(() => loadConfig({ ...base, AGE_CHECK_TRIGGERS: 'org,dating' })).toThrow(/dating/);
  });
});

describe('a check, its notice and its return (M16 B7)', () => {
  it('asks before an organization is started, then lets the checked adult through', async () => {
    const sam = await signup(t);
    expect((await sam.get('/v1/me')).user).toMatchObject({ ageCheck: null, ageCheckOffered: true });
    const refused = await org(sam, 'samstiles');
    expect([refused.statusCode, refused.json().error.code]).toEqual([403, 'age_check_needed']);
    expect(refused.json().error.details).toEqual({ trigger: 'org' });

    const { url, ref } = await begin(sam);
    const page = new URL(url);
    expect(`${page.origin}${page.pathname}`).toBe(
      `https://verify.agemin.test/start/${AGEMIN_ASSET}`,
    );
    const base = t.ctx.config.PUBLIC_URL.replace(/\/+$/, '');
    expect(page.searchParams.get('success_url')).toBe(`${base}/v1/age/return?ref=${ref}&end=done`);
    expect(page.searchParams.get('cancel_url')).toBe(`${base}/v1/age/return?ref=${ref}&end=cancel`);
    // Nothing of the person rides to the provider: a reference, a language, where to come back.
    expect([...page.searchParams.keys()].sort()).toEqual([
      'cancel_url',
      'error_url',
      'locale',
      'mode',
      'reference_id',
      'success_url',
    ]);

    const heard = await notify(t, stub.notice(ref, 'adult'));
    expect(heard.statusCode).toBe(200);
    const me = (await sam.get('/v1/me')).user;
    expect(me.ageCheck).toMatchObject({ outcome: 'adult', method: 'estimate', holdsUntil: null });
    expect(me.minor).toBe(false);
    // Heard again (a retry, or the return after it): applied once.
    await notify(t, stub.notice(ref, 'adult'));
    const audits = await t.ctx.db
      .selectFrom('audit_log')
      .select(['action', 'metadata'])
      .where('action', '=', 'age.checked')
      .where('target', '=', sam.user.id)
      .execute();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toEqual({
      check: ref,
      provider: 'agemin',
      outcome: 'adult',
      method: 'estimate',
    });
    expect((await org(sam, 'samstiles')).statusCode).toBe(201);
  });

  it('reads the outcome back from the provider on return, and lands where the check began', async () => {
    const lina = await signup(t);
    const web = await begin(lina);
    stub.results.set(web.ref, {
      passed: true,
      is_adult: true,
      verification_status: 'pass',
      confidence: 'high',
    });
    const back = await t.app.inject({
      method: 'GET',
      url: `/v1/age/return?ref=${web.ref}&end=done`,
    });
    expect(back.statusCode).toBe(303);
    const base = t.ctx.config.PUBLIC_URL.replace(/\/+$/, '');
    expect(back.headers.location).toBe(`${base}/settings/security?age=adult`);
    // The lookup carried the secret key; nothing else asked the provider for this reference.
    expect(stub.requests.filter((r) => r.path.endsWith(web.ref)).map((r) => r.auth)).toEqual([
      `Bearer ${AGEMIN_SECRET}`,
    ]);
    expect((await lina.get('/v1/me')).user.ageCheck).toMatchObject({ outcome: 'adult' });

    const phone = await begin(lina, 'app');
    const cancelled = await t.app.inject({
      method: 'GET',
      url: `/v1/age/return?ref=${phone.ref}&end=cancel`,
    });
    expect(cancelled.headers.location).toBe('caime://age-checked?age=cancel');
    // Not answered yet: said to be on its way, nothing changed.
    const pending = await t.app.inject({
      method: 'GET',
      url: `/v1/age/return?ref=${phone.ref}&end=done`,
    });
    expect(pending.headers.location).toBe('caime://age-checked?age=waiting');
    const nobody = await t.app.inject({
      method: 'GET',
      url: '/v1/age/return?ref=00000000-0000-0000-0000-000000000000&end=done',
    });
    expect(nobody.headers.location).toBe(`${base}/settings/security?age=waiting`);
  });

  it('turns away a notice signed with another key, and one for a check that isn’t Caime’s', async () => {
    const omar = await signup(t);
    const { ref } = await begin(omar);
    const forged = await notify(t, stub.notice(ref, 'adult', { key: otherKey() }));
    expect(forged.statusCode).toBe(400);
    const unsigned = await t.app.inject({
      method: 'POST',
      url: '/v1/age/webhook/agemin',
      payload: stub.notice(ref, 'adult').body,
      headers: {},
    });
    // The body's own `jwt` is the same signed copy; without either, nothing is read.
    const bare = { ...(stub.notice(ref, 'adult').body as Record<string, unknown>) };
    delete bare.jwt;
    const none = await t.app.inject({
      method: 'POST',
      url: '/v1/age/webhook/agemin',
      payload: bare,
    });
    expect([unsigned.statusCode, none.statusCode]).toEqual([200, 400]);
    const stranger = await notify(
      t,
      stub.notice('00000000-0000-0000-0000-000000000001', 'underage'),
    );
    expect(stranger.statusCode).toBe(200);
    // Only the properly signed one (the body's copy) counted.
    expect((await omar.get('/v1/me')).user.ageCheck).toMatchObject({ outcome: 'adult' });
  });
});

describe('the standing (M16 B7)', () => {
  it('under 18 by a check holds for a year whatever was declared; a face retried lifts nothing, a document does', async () => {
    const rami = await signup(t, { birthDate: '1990-01-01' });
    const first = await begin(rami);
    await notify(t, stub.notice(first.ref, 'underage'));
    let me = (await rami.get('/v1/me')).user;
    expect(me.minor).toBe(true);
    expect(me.ageCheck.outcome).toBe('minor');
    expect(new Date(me.ageCheck.holdsUntil).getTime() - t.ctx.now().getTime()).toBeGreaterThan(
      (MINOR_HOLD_DAYS - 1) * DAY,
    );
    // The under-18 rules follow at once: nothing to everyone, never found by an adult.
    expect(me.privacy.discoverByEmail).toBe(false);
    const adult = await signup(t);
    const found = await adult.get(`/v1/people/search?q=${encodeURIComponent(rami.user.handle)}`);
    expect(found.results.map((r: { person: { id: string } }) => r.person.id)).not.toContain(
      rami.user.id,
    );
    // A later face that reads older lifts nothing, in the same check or a new one.
    await notify(t, stub.notice(first.ref, 'adult'));
    const again = await begin(rami);
    await notify(t, stub.notice(again.ref, 'adult'));
    expect((await rami.get('/v1/me')).user.minor).toBe(true);
    // A document does.
    const doc = await begin(rami);
    await notify(t, stub.notice(doc.ref, 'adult', { document: true }));
    me = (await rami.get('/v1/me')).user;
    expect(me).toMatchObject({ minor: false });
    expect(me.ageCheck).toMatchObject({ outcome: 'adult', method: 'document', holdsUntil: null });
  });

  it('a refused attempt (a spoof) changes nothing but its own row', async () => {
    const dana = await signup(t);
    const { ref } = await begin(dana);
    await notify(t, stub.notice(ref, 'spoof'));
    expect((await dana.get('/v1/me')).user).toMatchObject({ ageCheck: null, minor: false });
    const row = await t.ctx.db
      .selectFrom('age_checks')
      .select(['outcome', 'error'])
      .where('id', '=', ref)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ outcome: 'failed', error: 'spoof_aegis' });
  });

  it('an estimate of under 18 lets go after its year; a day allows three checks', async () => {
    const yara = await signup(t);
    const { ref } = await begin(yara);
    await notify(t, stub.notice(ref, 'underage'));
    expect((await yara.get('/v1/me')).user.minor).toBe(true);
    await begin(yara);
    await begin(yara);
    const fourth = await yara.req('POST', '/v1/me/age-check', { back: 'web' });
    expect([fourth.statusCode, fourth.json().error.code]).toEqual([429, 'rate_limited']);
    const was = t.clock.now.toISOString();
    t.clock.advance((MINOR_HOLD_DAYS + 1) * DAY);
    try {
      const row = await t.ctx.db
        .selectFrom('users')
        .select(['birth_date', 'time_zone', 'age_minor_until', 'age_check'])
        .where('id', '=', yara.user.id)
        .executeTakeFirstOrThrow();
      expect([row.age_check, minorOf(row, t.ctx.now())]).toEqual(['minor', false]);
      // Not checked 18 or over: a trigger asks again.
      await expect(assertAgeChecked(t.ctx, yara.user.id, 'org')).rejects.toMatchObject({
        code: 'age_check_needed',
      });
      // And the row goes after its year; the account keeps what it found.
      await sweepRecords(t.ctx);
      const left = await t.ctx.db
        .selectFrom('age_checks')
        .select('id')
        .where('user_id', '=', yara.user.id)
        .execute();
      expect(left).toEqual([]);
      expect(KEPT_DAYS.ageChecks).toBe(365);
    } finally {
      t.clock.set(was);
    }
  });

  it('is in the person’s export, with every check they made', async () => {
    const zein = await signup(t);
    const { ref } = await begin(zein);
    await notify(t, stub.notice(ref, 'adult'));
    const data = await buildExport(t.ctx, zein.user.id, t.ctx.now());
    expect(data.account.ageCheck).toMatchObject({ outcome: 'adult', method: 'estimate' });
    expect(data.ageChecks).toEqual([
      expect.objectContaining({ provider: 'agemin', outcome: 'adult', method: 'estimate' }),
    ]);
  });
});

describe('the triggers (M16 B7)', () => {
  it('asks before a first message request and a priced item, never someone under 18', async () => {
    const hana = await signup(t);
    const stranger = await signup(t);
    const asked = await hana.req('POST', '/v1/conversations', {
      kind: 'direct',
      userId: stranger.user.id,
    });
    expect([asked.statusCode, asked.json().error?.details]).toEqual([403, { trigger: 'stranger' }]);
    const priced = await hana.req('PUT', '/v1/me/booking', {
      booking: null,
      items: [
        {
          id: 'lesson',
          name: 'Arabic lesson',
          price: { value: 300, currency: 'EGP' },
          unit: 'minutes',
          minutes: 60,
          capacity: 1,
          maxQuantity: 1,
          audience: 'public',
          providers: null,
          askTopic: false,
        },
      ],
    });
    expect(priced.json().error?.details).toEqual({ trigger: 'paid' });
    const { ref } = await begin(hana);
    await notify(t, stub.notice(ref, 'adult'));
    expect(
      (await hana.req('POST', '/v1/conversations', { kind: 'direct', userId: stranger.user.id }))
        .statusCode,
    ).toBe(201);
    // Someone under 18 isn't asked to prove it: the under-18 rules answer for them.
    const teen = await signup(t, { birthDate: '2011-01-01' });
    await expect(assertAgeChecked(t.ctx, teen.user.id, 'stranger')).resolves.toBeUndefined();
  });

  it('asks only where AGE_CHECK_TRIGGERS says', async () => {
    const some = await createTestApp(env({ AGE_CHECK_TRIGGERS: 'paid' }));
    try {
      const nour = await signup(some);
      expect((await org(nour, 'nourtiles')).statusCode).toBe(201);
      const other = await signup(some);
      expect(
        (await nour.req('POST', '/v1/conversations', { kind: 'direct', userId: other.user.id }))
          .statusCode,
      ).toBe(201);
      expect(processorsFor(some.ctx.config).find((p) => p.id === 'age')?.name).toBe(
        'Bynn Intelligence (Agemin)',
      );
    } finally {
      await some.close();
    }
  });
});
