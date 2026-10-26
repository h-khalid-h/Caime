/**
 * A child on Caime with a parent's consent (R122): where the law asks a guardian's consent (Egypt,
 * Saudi Arabia), someone from 13 signs up through their parent's family link (or alone, asking a
 * parent next: family-named.test.ts); the account waits, reaching nothing but itself, until that
 * parent agrees on it; the parent sees whom the
 * child is connected with and never a message; "not my child", a withdrawn consent or a week
 * without an answer deletes the child's account. Nobody under 13 joins, link or not.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formConnection } from '../src/lib/connections';
import { lapseUnanswered, releaseUnsupervised } from '../src/lib/family';
import { type Client, clientFor, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let parent: Client;
let dir: string;

beforeAll(async () => {
  // A web root, so a family link's address answers as the page a child's browser gets.
  dir = mkdtempSync(join(tmpdir(), 'caime-family-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' });
  parent = await signup(t, {
    displayName: 'Hassan Parent',
    country: 'EG',
    timeZone: 'Africa/Cairo',
  });
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

let n = 0;
/** A child signing up in Egypt, through a link or without one. */
async function childSignup(birthDate: string, family?: string, country = 'EG') {
  n++;
  return t.app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: {
      email: `kid${n}@example.com`,
      password: 'correct horse battery',
      displayName: `Lina ${n}`,
      handle: `kid${n}x${Date.now().toString(36)}`,
      birthDate,
      country,
      timeZone: country === 'EG' ? 'Africa/Cairo' : 'Europe/Paris',
      locale: 'ar-EG',
      client: 'native',
      ...(family ? { family } : {}),
    },
  });
}

const tokenOf = (url: string) => url.split('/family/')[1]!;

async function newLink(name = 'Lina') {
  const res = await parent.req('POST', '/v1/me/family/links', { childName: name });
  expect(res.statusCode).toBe(201);
  const body = res.json();
  return { token: tokenOf(body.url), id: body.link.id as string };
}

describe('a child joins through their parent (R122)', () => {
  it('without a link waits to ask a parent (R122 (2)), and under 13 is refused, link or not', async () => {
    const alone = await childSignup('2012-05-01');
    expect(alone.statusCode).toBe(201);
    expect(alone.json().user.waitsForParent).toBe(true);
    const younger = await childSignup('2014-01-01');
    expect(younger.statusCode).toBe(400);
    expect(younger.json().error.code).toBe('too_young');
    const { token } = await newLink();
    const tooYoung = await childSignup('2014-01-01', token);
    expect(tooYoung.statusCode).toBe(400);
    expect(tooYoung.json().error.code).toBe('too_young');
    // A link that isn't one says so, never quietly ignored.
    const made = await childSignup('2012-05-01', `fam_${'x'.repeat(43)}`);
    expect(made.statusCode).toBe(404);
  });

  it('waits for the parent, who agrees, sees whom the child knows, and never a message', async () => {
    const { token } = await newLink('Lina');
    // The link's page names whose it is and for whom, and nothing else.
    const page = await t.app.inject({ method: 'GET', url: `/v1/family/${token}` });
    expect(page.json()).toEqual({ kind: 'link', guardianName: 'Hassan Parent', childName: 'Lina' });
    // Its address is a page of its own, the app's scripts left out, kept by nobody.
    const html = await t.app.inject({
      method: 'GET',
      url: `/family/${token}`,
      headers: { accept: 'text/html' },
    });
    expect(html.statusCode).toBe(200);
    expect(html.body).toContain('Hassan Parent adds Lina to Caime');
    expect(html.body).toContain(`href="/sign-up?family=${token}"`);
    expect(html.body).not.toContain('entry-abc.js');
    expect(html.headers['cache-control']).toBe('private, no-store');
    expect(html.headers['referrer-policy']).toBe('no-referrer');

    const res = await childSignup('2012-05-01', token);
    expect(res.statusCode).toBe(201);
    const child = clientFor(t, res.json().token, res.json().user);
    // Waiting: their account and their family, nothing else; the app is told so.
    expect(res.json().user.waitsForParent).toBe(true);
    expect((await child.req('GET', '/v1/me')).json().user.waitsForParent).toBe(true);
    expect((await child.req('GET', '/v1/auth/session')).json().user.waitsForParent).toBe(true);
    const waiting = await child.req('GET', '/v1/inbox');
    expect(waiting.statusCode).toBe(403);
    expect(waiting.json().error.code).toBe('consent_waiting');
    const theirs = (await child.req('GET', '/v1/me/family')).json();
    expect(theirs.guardian).toMatchObject({
      person: { displayName: 'Hassan Parent' },
      agreed: false,
    });
    // The link is spent: nobody else signs up through it.
    expect((await childSignup('2012-06-01', token)).statusCode).toBe(404);
    // The parent is told, and sees the child waiting on them.
    await t.ctx.flush();
    const told = await t.ctx.db
      .selectFrom('notifications')
      .select('title')
      .where('user_id', '=', parent.user.id)
      .where('kind', '=', 'family')
      .execute();
    expect(told.map((x) => x.title)).toContain(
      `${child.user.displayName} joined Caime through your family link`,
    );
    const mine = (await parent.req('GET', '/v1/me/family')).json();
    expect(mine.children).toEqual([
      expect.objectContaining({
        person: expect.objectContaining({ id: child.user.id }),
        state: 'asked',
        supervised: false,
      }),
    ]);

    // The parent agrees: the two are connected, the child goes on, and the consent is kept.
    expect(
      (await parent.req('POST', `/v1/me/family/children/${child.user.id}/consent`)).statusCode,
    ).toBe(200);
    expect((await child.req('GET', '/v1/inbox')).statusCode).toBe(200);
    expect((await child.req('GET', '/v1/me')).json().user.waitsForParent).toBeUndefined();
    const kept = await t.ctx.db
      .selectFrom('guardianships')
      .select(['consented_at', 'consent_version', 'method'])
      .where('child_id', '=', child.user.id)
      .executeTakeFirstOrThrow();
    expect(kept.consented_at).not.toBeNull();
    expect(kept.consent_version).toBe('2026-10-26');
    expect(kept.method).toBe('account');
    const after = (await child.req('GET', '/v1/me/family')).json();
    expect(after.guardian.agreed).toBe(true);

    // Whom the child is connected with shows to the parent (themselves left out), never words.
    const friend = await signup(t, {
      displayName: 'Omar Friend',
      birthDate: '2012-02-02',
      country: 'FR',
      timeZone: 'Europe/Paris',
    });
    // Two 14-year-olds who don't know each other through anyone can't ask each other (R29), so
    // the connection is made as a request accepted would make it.
    await t.ctx.db
      .transaction()
      .execute((trx) => formConnection(trx, child.user.id, friend.user.id));
    const seen = (await parent.req('GET', '/v1/me/family')).json().children[0];
    expect(seen.state).toBe('agreed');
    expect(seen.supervised).toBe(true);
    expect(seen.connections.map((p: { displayName: string }) => p.displayName)).toEqual([
      'Omar Friend',
    ]);
    expect(JSON.stringify(seen)).not.toContain('"body"');

    // Withdrawn, with the parent's password: the child's account is gone.
    const wrong = await parent.req('POST', `/v1/me/family/children/${child.user.id}/withdraw`, {
      password: 'not it',
    });
    expect(wrong.statusCode).toBe(401);
    const done = await parent.req('POST', `/v1/me/family/children/${child.user.id}/withdraw`, {
      password: 'correct horse battery',
    });
    expect(done.statusCode).toBe(200);
    const gone = await t.ctx.db
      .selectFrom('users')
      .select('id')
      .where('id', '=', child.user.id)
      .executeTakeFirst();
    expect(gone).toBeUndefined();
  });

  it('"not my child" deletes what the link made, and a week unanswered does too', async () => {
    const first = await newLink('Sara');
    const res = await childSignup('2011-03-03', first.token);
    expect(res.statusCode).toBe(201);
    const stranger = res.json().user.id as string;
    expect((await parent.req('POST', `/v1/me/family/children/${stranger}/refuse`)).statusCode).toBe(
      200,
    );
    expect(
      await t.ctx.db.selectFrom('users').select('id').where('id', '=', stranger).executeTakeFirst(),
    ).toBeUndefined();

    const second = await newLink('Nour');
    const later = await childSignup('2011-04-04', second.token);
    const unanswered = later.json().user.id as string;
    t.clock.advance(8 * 86_400_000);
    // This one, and the one that signed up alone in the first test and asked nobody.
    expect(await lapseUnanswered(t.ctx)).toBe(2);
    expect(
      await t.ctx.db
        .selectFrom('users')
        .select('id')
        .where('id', '=', unanswered)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it('is an adult’s to give, a few children at most, and needs no link where 13 is the age', async () => {
    // Someone under 18 adds nobody.
    const teen = await signup(t, {
      birthDate: '2010-01-01',
      country: 'FR',
      timeZone: 'Europe/Paris',
    });
    const refused = await teen.req('POST', '/v1/me/family/links', { childName: 'Sam' });
    expect(refused.statusCode).toBe(403);
    // Where Caime's own minimum is the rule, a 14-year-old signs up as anyone does: the link
    // isn't spent and nothing waits.
    const { token } = await newLink('Adam');
    const fr = await childSignup('2012-05-01', token, 'FR');
    expect(fr.statusCode).toBe(201);
    const frChild = clientFor(t, fr.json().token, fr.json().user);
    expect((await frChild.req('GET', '/v1/inbox')).statusCode).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: `/v1/family/${token}` })).statusCode).toBe(
      200,
    );
    // Five children and open links at most.
    const open = (await parent.req('GET', '/v1/me/family')).json();
    for (let i = open.children.length + open.links.length; i < 5; i++) await newLink(`Kid ${i}`);
    const over = await parent.req('POST', '/v1/me/family/links', { childName: 'One more' });
    expect(over.statusCode).toBe(409);
    expect(over.json().error.code).toBe('limit');
    // R122's number reads from these: turned away alone, and how each link ended.
    for (const step of ['alone', 'link', 'signed_up', 'agreed', 'not_mine', 'lapsed', 'withdrawn'])
      expect(t.ctx.metrics.family.get({ step }), step).toBeGreaterThan(0);
  });

  it('waits on the parent for whom the child connects with, both ways', async () => {
    // A parent of their own, so the rest of this file's parent is left as it is.
    const mum = await signup(t, {
      displayName: 'Mona Parent',
      country: 'EG',
      timeZone: 'Africa/Cairo',
    });
    const made = await mum.req('POST', '/v1/me/family/links', { childName: 'Yara' });
    const res = await childSignup('2011-07-07', tokenOf(made.json().url));
    const child = clientFor(t, res.json().token, res.json().user);
    await mum.req('POST', `/v1/me/family/children/${child.user.id}/consent`);
    // Someone the parent knows, so they may ask the child (R29: someone shared).
    const aunt = await signup(t, {
      displayName: 'Aunt Laila',
      country: 'EG',
      timeZone: 'Africa/Cairo',
    });
    await t.ctx.db.transaction().execute((trx) => formConnection(trx, mum.user.id, aunt.user.id));

    // The aunt asks the child: it reaches the parent, never the child, first.
    const asked = await aunt.req('POST', '/v1/connections/requests', {
      toUserId: child.user.id,
      note: 'Hi Yara',
    });
    expect(asked.statusCode).toBe(201);
    const requestId = asked.json().requestId as string;
    expect((await child.req('GET', '/v1/connections/requests')).json().requests).toEqual([]);
    expect(
      (await child.req('POST', `/v1/connections/requests/${requestId}/accept`, {})).statusCode,
    ).toBe(404);
    const waiting = (await mum.req('GET', '/v1/me/family')).json().requests;
    expect(waiting).toEqual([
      expect.objectContaining({
        requestId,
        byChild: false,
        note: 'Hi Yara',
        child: expect.objectContaining({ id: child.user.id }),
        person: expect.objectContaining({ id: aunt.user.id }),
      }),
    ]);
    // Only the parent it waits on answers it.
    expect((await parent.req('POST', `/v1/me/family/requests/${requestId}/allow`)).statusCode).toBe(
      404,
    );
    expect((await mum.req('POST', `/v1/me/family/requests/${requestId}/allow`)).statusCode).toBe(
      200,
    );
    const incoming = (await child.req('GET', '/v1/connections/requests')).json().requests;
    expect(incoming.map((r: { id: string }) => r.id)).toEqual([requestId]);
    expect(
      (await child.req('POST', `/v1/connections/requests/${requestId}/accept`, {})).statusCode,
    ).toBe(200);

    // The child asks someone: it waits on the parent too, the child sees it waiting, and a no
    // tells the child and never the one asked.
    const uncle = await signup(t, {
      displayName: 'Uncle Sami',
      country: 'EG',
      timeZone: 'Africa/Cairo',
    });
    await t.ctx.db.transaction().execute((trx) => formConnection(trx, aunt.user.id, uncle.user.id));
    const theirs = await child.req('POST', '/v1/connections/requests', { toUserId: uncle.user.id });
    expect(theirs.statusCode).toBe(201);
    expect((await uncle.req('GET', '/v1/connections/requests')).json().requests).toEqual([]);
    const mine = (await child.req('GET', '/v1/me/family')).json().guardian;
    expect(mine).toMatchObject({ agreed: true, supervised: true });
    expect(mine.waiting.map((p: { id: string }) => p.id)).toEqual([uncle.user.id]);
    expect(
      (await mum.req('POST', `/v1/me/family/requests/${theirs.json().requestId}/decline`))
        .statusCode,
    ).toBe(200);
    await t.ctx.flush();
    const toldChild = await t.ctx.db
      .selectFrom('notifications')
      .select('title')
      .where('user_id', '=', child.user.id)
      .where('kind', '=', 'family')
      .execute();
    // In the child's own language (they signed up in Arabic), never the parent's.
    expect(toldChild.map((n) => n.title)).toContain('لم يوافق وليّ أمرك على التواصل مع Uncle Sami');
    const toldUncle = await t.ctx.db
      .selectFrom('notifications')
      .select('kind')
      .where('user_id', '=', uncle.user.id)
      .execute();
    expect(toldUncle).toEqual([]);

    // A link someone the child knows made connects nobody until the parent says yes either.
    const grandma = await signup(t, {
      displayName: 'Grandma Huda',
      country: 'EG',
      timeZone: 'Africa/Cairo',
    });
    await t.ctx.db
      .transaction()
      .execute((trx) => formConnection(trx, aunt.user.id, grandma.user.id));
    const { invite } = await grandma.post('/v1/invites', {});
    const opened = await child.req('POST', `/v1/invites/${invite.token}/accept`, {});
    expect(opened.json()).toMatchObject({ status: 'requested' });
    const onMum = (await mum.req('GET', '/v1/me/family')).json().requests;
    expect(onMum.map((r: { person: { id: string } }) => r.person.id)).toEqual([grandma.user.id]);
    await mum.req('POST', `/v1/me/family/requests/${opened.json().requestId}/allow`);
    const fromGrandma = (await child.req('GET', '/v1/connections/requests')).json().requests;
    expect(fromGrandma.map((r: { id: string }) => r.id)).toEqual([opened.json().requestId]);

    // A parent no longer able to answer (suspended) looks after nobody: what waited on them goes
    // on to the one asked, and the child keeps every rule for someone under 18.
    const cousin = await signup(t, {
      displayName: 'Cousin Adam',
      country: 'EG',
      timeZone: 'Africa/Cairo',
    });
    await t.ctx.db
      .transaction()
      .execute((trx) => formConnection(trx, aunt.user.id, cousin.user.id));
    const late = await cousin.req('POST', '/v1/connections/requests', { toUserId: child.user.id });
    expect(late.statusCode).toBe(201);
    await t.ctx.db
      .updateTable('users')
      .set({ suspended_at: t.ctx.now() })
      .where('id', '=', mum.user.id)
      .execute();
    expect(await releaseUnsupervised(t.ctx)).toBe(1);
    const nowIncoming = (await child.req('GET', '/v1/connections/requests')).json().requests;
    expect(nowIncoming.map((r: { id: string }) => r.id)).toContain(late.json().requestId);
  });
});
