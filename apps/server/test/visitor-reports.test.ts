/**
 * Notice and action for everyone (M16 B6, the DSA's Art. 16, 17 and 20): a visitor reports a page
 * about someone from the page itself and hears what became of it; a suspended account is told why,
 * may appeal, and may take a copy of its data, through the claim its sign-in was refused with; the
 * operator decides the appeal, and the person hears the decision.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { buildExport } from '../src/lib/export';
import { KEPT_DAYS, sweepRecords } from '../src/lib/retention';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const ADMIN = 'operator-token-for-the-visitor-reports-test-0123456789';
const METRICS = 'metrics-token-for-the-visitor-reports-test-0123456789';
const mail = memoryMailer();
let t: TestApp;
let dir: string;
let noor: Client;
let sam: Client;
const DAY = 86_400_000;

const page = (path: string) =>
  t.app.inject({
    method: 'GET',
    url: path,
    headers: { accept: 'text/html,application/xhtml+xml' },
  });
const report = (form: Record<string, string>) =>
  t.app.inject({
    method: 'POST',
    url: '/v1/public/report',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(form).toString(),
  });
const op = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: unknown) =>
  t.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${ADMIN}` },
    payload: payload as any,
  });
const login = (handle: string, password = 'correct horse battery') =>
  t.app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { identifier: handle, password, client: 'native' },
  });
const reportsAbout = async (userId: string) =>
  t.ctx.db
    .selectFrom('reports')
    .select(['id', 'reporter_id', 'reason', 'details', 'visitor_name', 'visitor_email', 'page'])
    .where('target_user_id', '=', userId)
    .orderBy('created_at')
    .execute();
const sentTo = (to: string) => mail.outbox.filter((m) => m.to === to);
const scrape = async () =>
  (
    await t.app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${METRICS}` },
    })
  ).body;

beforeAll(async () => {
  // The web app's shell, which a visitor's page is drawn into (as public-pages.test.ts has it).
  dir = mkdtempSync(join(tmpdir(), 'caime-report-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  t = await createTestApp({ ADMIN_TOKEN: ADMIN, METRICS_TOKEN: METRICS, WEB_DIR: dir }, { mail });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivers' });
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('a visitor reports a page (M16 B6)', () => {
  it('finds the form folded at the end of a person’s page', async () => {
    const html = (await page(`/@${noor.user.handle}`)).body;
    expect(html).toContain('<details class="formcard report" id="report">');
    expect(html).toContain('action="/v1/public/report"');
    expect(html).toContain(`name="handle" value="${noor.user.handle}"`);
    expect(html).toContain('value="child_safety"');
    // Opened by ?report, and its notices said on the page.
    expect((await page(`/@${noor.user.handle}?report`)).body).toContain('id="report" open');
    expect((await page(`/@${noor.user.handle}?report-error=contact`)).body).toContain(
      'Give your name and an email address we can write to',
    );
  });

  it('takes a report with who sent it, and mails them a receipt and then the decision', async () => {
    const res = await report({
      kind: 'person',
      handle: noor.user.handle,
      reason: 'harassment',
      details: 'This page insults people by name.',
      name: 'Vera Visitor',
      email: 'Vera@Example.com',
      statement: 'on',
    });
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe(`/@${noor.user.handle}?reported=1#report`);
    const [kept] = await reportsAbout(noor.user.id);
    expect(kept).toMatchObject({
      reporter_id: null,
      reason: 'harassment',
      details: 'This page insults people by name.',
      visitor_name: 'Vera Visitor',
      visitor_email: 'vera@example.com',
      page: `/@${noor.user.handle}`,
    });
    expect((await page(`/@${noor.user.handle}?reported=1`)).body).toContain(
      'Someone at Caime reads every report',
    );
    await t.ctx.flush();
    const [receipt] = sentTo('vera@example.com');
    expect(receipt?.subject).toBe('We received your report');
    expect(receipt?.text).toContain(`/@${noor.user.handle}`);
    // The operator sees whom it came from and where.
    const listed = (await op('GET', '/v1/admin/reports?status=open')).json().reports;
    expect(listed[0]).toMatchObject({
      reporter: null,
      visitor: { name: 'Vera Visitor', email: 'vera@example.com', page: `/@${noor.user.handle}` },
      person: { id: noor.user.id },
    });
    // Counted, and said to be waiting on the operator, so an alert can say so.
    const before = await scrape();
    expect(before).toContain('caime_reports_total{from="visitor",reason="harassment"} 1');
    expect(before).toContain('caime_moderation_waiting{kind="report"} 1');
    expect(before).toContain('caime_moderation_waiting{kind="child_safety"} 0');
    // Closed: the decision goes to the visitor, once.
    expect(
      (await op('PATCH', `/v1/admin/reports/${kept?.id}`, { status: 'dismissed' })).statusCode,
    ).toBe(200);
    await op('PATCH', `/v1/admin/reports/${kept?.id}`, { status: 'dismissed' });
    await t.ctx.flush();
    const decisions = sentTo('vera@example.com').filter((m) => m.subject === 'About your report');
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.text).toContain('We decided not to act on it');
    expect(decisions[0]?.text).toContain('reply to this email');
    expect(await scrape()).toContain('caime_moderation_waiting{kind="report"} 0');
  });

  it('needs a name and an address, a few words and good faith; a child’s safety needs neither', async () => {
    const base = {
      kind: 'person',
      handle: noor.user.handle,
      reason: 'spam',
      details: 'The same advert again and again.',
      name: 'Vera Visitor',
      email: 'vera@example.com',
      statement: 'on',
    };
    const refusal = async (form: Record<string, string>) =>
      new URL(`http://x${(await report(form)).headers.location}`).searchParams.get('report-error');
    const before = (await reportsAbout(noor.user.id)).length;
    expect(await refusal({ ...base, email: '' })).toBe('contact');
    expect(await refusal({ ...base, name: '' })).toBe('contact');
    expect(await refusal({ ...base, email: 'not an address' })).toBe('contact');
    expect(await refusal({ ...base, details: 'bad' })).toBe('details');
    const { statement: _unsaid, ...unsworn } = base;
    expect(await refusal(unsworn)).toBe('statement');
    expect((await reportsAbout(noor.user.id)).length).toBe(before);
    // About a child's safety, nobody need say who they are (Art. 16(2)(c)), and nothing is mailed.
    const sent = mail.outbox.length;
    const anonymous = await report({
      ...base,
      reason: 'child_safety',
      name: '',
      email: '',
    });
    expect(anonymous.headers.location).toContain('reported=1');
    const kept = await reportsAbout(noor.user.id);
    expect(kept.at(-1)).toMatchObject({
      reason: 'child_safety',
      visitor_email: null,
      visitor_name: null,
    });
    await t.ctx.flush();
    expect(mail.outbox.length).toBe(sent);
  });

  it('reports an organization’s page as the organization’s, and nobody’s page at all as nothing', async () => {
    const made = await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Tiles',
      handle: 'niletiles',
      kind: 'shop',
    });
    expect(made.org.handle).toBe('niletiles');
    expect((await page('/o/niletiles')).body).toContain('name="kind" value="org"');
    const res = await report({
      kind: 'org',
      handle: 'niletiles',
      reason: 'scam',
      details: 'Asks for payment up front by wire.',
      name: 'Vera Visitor',
      email: 'vera@example.com',
      statement: 'on',
    });
    expect(res.headers.location).toBe('/o/niletiles?reported=1#report');
    const row = await t.ctx.db
      .selectFrom('reports')
      .select(['org_id', 'target_user_id', 'page'])
      .where('org_id', '=', made.org.id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ org_id: made.org.id, target_user_id: null, page: '/o/niletiles' });
    expect(
      (
        await report({
          kind: 'person',
          handle: 'nobody-here',
          reason: 'spam',
          details: 'Somebody nobody knows.',
          statement: 'on',
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe('a suspended account: why, an appeal, its data (M16 B6)', () => {
  let claim = '';

  it('says why when suspending, and the sign-in says it back with a claim, after the password alone', async () => {
    expect(
      (await op('PUT', `/v1/admin/people/${sam.user.handle}/suspension`, { suspended: true }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await op('PUT', `/v1/admin/people/${sam.user.handle}/suspension`, {
          suspended: true,
          reason: 'Sent the same advert to dozens of strangers.',
        })
      ).statusCode,
    ).toBe(200);
    // A wrong password learns nothing of it.
    const wrong = await login(sam.user.handle, 'not the password at all');
    expect(wrong.statusCode).toBe(401);
    expect(JSON.stringify(wrong.json())).not.toContain('advert');
    const refused = await login(sam.user.handle);
    expect(refused.statusCode).toBe(403);
    const { error } = refused.json();
    expect(error.code).toBe('suspended');
    expect(error.details.reason).toBe('Sent the same advert to dozens of strangers.');
    expect(typeof error.details.claim).toBe('string');
    claim = error.details.claim;
  });

  it('appeals once at a time, and takes a copy of the data, through the claim alone', async () => {
    const sent = await t.app.inject({
      method: 'POST',
      url: '/v1/suspension/appeal',
      payload: { claim, text: 'Those were my own customers, who asked for the list.' },
    });
    expect(sent.json()).toEqual({ ok: true, already: false });
    const again = await t.app.inject({
      method: 'POST',
      url: '/v1/suspension/appeal',
      payload: { claim, text: 'Please look at it again, it was a mistake.' },
    });
    expect(again.json()).toEqual({ ok: true, already: true });
    const counted = await scrape();
    expect(counted).toContain('caime_appeals_total{outcome="made"} 1');
    expect(counted).toContain('caime_moderation_waiting{kind="appeal"} 1');
    const data = await t.app.inject({
      method: 'POST',
      url: '/v1/suspension/export',
      payload: { claim },
    });
    expect(data.statusCode).toBe(200);
    expect(data.headers['content-disposition']).toContain('caime-export-');
    expect(data.json().appeals).toEqual([
      expect.objectContaining({
        text: 'Those were my own customers, who asked for the list.',
        outcome: null,
      }),
    ]);
    // A claim changed, or none, opens nothing.
    const forged = await t.app.inject({
      method: 'POST',
      url: '/v1/suspension/export',
      payload: { claim: `${claim.slice(0, -4)}AAAA` },
    });
    expect(forged.statusCode).toBe(403);
  });

  it('the operator upholds with a note, then lifts a later appeal; the person hears both and is back in', async () => {
    const waiting = (await op('GET', '/v1/admin/appeals')).json().appeals;
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({
      person: { id: sam.user.id, suspended: true },
      reason: 'Sent the same advert to dozens of strangers.',
      body: 'Those were my own customers, who asked for the list.',
      outcome: null,
    });
    const upheld = await op('POST', `/v1/admin/appeals/${waiting[0].id}`, {
      decision: 'uphold',
      note: 'They had not asked: three of them reported it.',
    });
    expect(upheld.json().appeal).toMatchObject({ outcome: 'upheld' });
    const twice = await op('POST', `/v1/admin/appeals/${waiting[0].id}`, { decision: 'lift' });
    expect([twice.statusCode, twice.json().error.code]).toEqual([409, 'appeal_decided']);
    await t.ctx.flush();
    const samMail = sentTo(sam.user.email as string);
    expect(samMail.at(-1)).toMatchObject({ subject: 'About your appeal' });
    expect(samMail.at(-1)?.text).toContain('They had not asked: three of them reported it.');
    expect(samMail.at(-1)?.text).toContain('out-of-court dispute settlement body');
    // A new appeal, lifted: in again with the same password, and the claim opens nothing more.
    await t.app.inject({
      method: 'POST',
      url: '/v1/suspension/appeal',
      payload: { claim, text: 'I have stopped, and I will only write to people who ask.' },
    });
    const [next] = (await op('GET', '/v1/admin/appeals')).json().appeals;
    await op('POST', `/v1/admin/appeals/${next.id}`, { decision: 'lift' });
    expect((await login(sam.user.handle)).statusCode).toBe(200);
    await t.ctx.flush();
    expect(sentTo(sam.user.email as string).at(-1)).toMatchObject({
      subject: 'Your Caime account is back',
    });
    expect(
      (await t.app.inject({ method: 'POST', url: '/v1/suspension/export', payload: { claim } }))
        .statusCode,
    ).toBe(403);
    const audits = await t.ctx.db
      .selectFrom('audit_log')
      .select(['action', 'metadata'])
      .where('action', 'in', ['moderation.appeal_upheld', 'moderation.appeal_lifted'])
      .orderBy('seq')
      .execute();
    expect(audits.map((a) => a.action)).toEqual([
      'moderation.appeal_upheld',
      'moderation.appeal_lifted',
    ]);
    expect(audits[0]?.metadata).toMatchObject({ operator: 'operator' });
    const counted = await scrape();
    expect(counted).toContain('caime_appeals_total{outcome="upheld"} 1');
    expect(counted).toContain('caime_appeals_total{outcome="lifted"} 1');
    expect(counted).toContain('caime_moderation_waiting{kind="appeal"} 0');
  });

  it('a suspension from a report reads as what it was for; decided appeals go after half a year', async () => {
    const r = await noor.post('/v1/reports', {
      userId: sam.user.id,
      reason: 'harassment',
      details: 'Keeps writing after I asked them to stop.',
    });
    expect(r.ok).toBe(true);
    const [open] = (await op('GET', '/v1/admin/reports?status=open'))
      .json()
      .reports.filter((x: any) => x.reporter?.id === noor.user.id);
    await op('POST', `/v1/admin/reports/${open.id}/suspend`, {});
    const refused = (await login(sam.user.handle)).json();
    expect(refused.error.details.reason).toBe(
      'Reported for: Harassment or bullying. Caime looked and upheld the report.',
    );
    const data = (await buildExport(t.ctx, sam.user.id, t.ctx.now())) as any;
    expect(data.appeals.map((a: any) => a.outcome)).toEqual(['upheld', 'lifted']);
    const count = async () => (await t.ctx.db.selectFrom('appeals').select('id').execute()).length;
    expect(await count()).toBe(2);
    t.clock.advance((KEPT_DAYS.decidedAppeals + 1) * DAY);
    await sweepRecords(t.ctx);
    expect(await count()).toBe(0);
  });
});
