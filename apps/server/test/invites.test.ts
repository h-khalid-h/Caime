import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KEPT_DAYS, sweepRecords } from '../src/lib/retention';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let dir: string;
let noor: Client;
let sam: Client;
let alex: Client;
const PAGE = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'caime-invites-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' });
  // Accounts are stamped by the database's clock: the test's runs from real time too.
  t.clock.set(new Date().toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad', handle: 'noor' });
  sam = await signup(t, { displayName: 'Sam Rivera', handle: 'sam' });
  alex = await signup(t, { displayName: 'Alex Chen', handle: 'alex' });
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

const visit = (url: string) => t.app.inject({ method: 'GET', url, headers: { accept: PAGE } });

describe('invite links (R1)', () => {
  let token: string;
  let inviteId: string;

  it('makes a link with a private label and a context to show, and lists it', async () => {
    const { invite } = await noor.post('/v1/invites', {
      relationship: { sphere: 'work', role: 'colleague', orgName: 'DATA C' },
      showContext: true,
      note: 'Come find me here.',
    });
    expect(invite).toMatchObject({
      url: expect.stringMatching(/^https:\/\/caime\.example\/i\/[A-Za-z0-9_-]{22}$/),
      relationship: { sphere: 'work', role: 'colleague', orgName: 'DATA C', source: 'invite' },
      context: { sphere: 'work', label: 'Work', orgName: 'DATA C' },
      note: 'Come find me here.',
      uses: 0,
    });
    token = invite.token;
    inviteId = invite.id;
    const { invites } = await noor.get('/v1/invites');
    expect(invites.map((i: { id: string }) => i.id)).toEqual([inviteId]);
    // Without a label, nothing is shown; with the switch off, the label stays private.
    const plain = (await noor.post('/v1/invites', {})).invite;
    expect([plain.relationship, plain.context]).toEqual([null, null]);
    const quiet = (
      await noor.post('/v1/invites', {
        relationship: { sphere: 'family', role: 'sibling' },
        showContext: false,
      })
    ).invite;
    expect(quiet.relationship.sphere).toBe('family');
    expect(quiet.context).toBeNull();
  });

  it('reads to a visitor as a page without the app, and as JSON to anyone with the token', async () => {
    const page = await visit(`/i/${token}`);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<meta name="caime-page" content="invite">');
    expect(page.body).toContain('<meta name="robots" content="noindex">');
    expect(page.body).toContain('<h1>Noor Haddad invited you</h1>');
    // The same sheet as a person's page: a masthead, and the facts as mono-labelled rows.
    expect(page.body).toContain('<main class="pub pub-sheet" lang="en" dir="ltr">');
    expect(page.body).toContain('<span class="mono">an invitation</span>');
    expect(page.body).toContain('<dt class="mono">from</dt><dd>Noor Haddad</dd>');
    expect(page.body).toContain('Work · DATA C');
    expect(page.body).toContain('Come find me here.');
    expect(page.body).toContain(`href="/sign-up?link=${encodeURIComponent(`/i/${token}`)}"`);
    expect(page.body).not.toContain('entry-abc.js');
    // Never the label: "colleague" is Noor's own word for whoever joins.
    expect(page.body.toLowerCase()).not.toContain('colleague');
    const json = await t.app.inject({ method: 'GET', url: `/v1/invites/${token}` });
    expect(json.statusCode).toBe(200);
    expect(json.json().invite).toEqual({
      inviter: { id: noor.user.id, handle: 'noor', displayName: 'Noor Haddad', avatarUrl: null },
      context: { sphere: 'work', label: 'Work', orgName: 'DATA C' },
      note: 'Come find me here.',
      mine: false,
      conversationId: null,
    });
    expect((await noor.get(`/v1/invites/${token}`)).invite.mine).toBe(true);
    // A token nobody has is nobody's page.
    expect((await visit('/i/nobodyhasthistoken000000')).statusCode).toBe(404);
    expect((await sam.req('GET', '/v1/invites/nobodyhasthistoken000000')).statusCode).toBe(404);
  });

  it('opened signed in: connected at once, her label applied, the context offered, and she is told', async () => {
    const res = await sam.post(`/v1/invites/${token}/accept`);
    expect(res).toMatchObject({ status: 'connected', already: false });
    expect(res.conversationId).toBeTruthy();
    // Noor's side is classified as she said; Sam's isn't (nothing is inferred for him).
    const hers = await noor.get('/v1/connections');
    expect(hers.connections[0].relationships[0]).toMatchObject({
      sphere: 'work',
      role: 'colleague',
      orgName: 'DATA C',
      source: 'invite',
    });
    expect(hers.connections[0].conversationId).toBe(res.conversationId);
    const his = await sam.get('/v1/connections');
    expect(his.connections[0].relationships).toEqual([]);
    // The context Noor chose to show is offered to Sam, as a request's context would be.
    const offered = await sam.get(`/v1/suggestions?subjectUserId=${noor.user.id}`);
    expect(offered.suggestions[0]).toMatchObject({ kind: 'relationship', title: 'Work · DATA C' });
    // Noor is told who joined; Sam is landing in the conversation and is told nothing.
    const told = (await noor.get('/v1/notifications')).notifications;
    expect(told[0]).toMatchObject({
      kind: 'connection_accepted',
      title: 'Sam Rivera joined through your invite',
      data: { userId: sam.user.id, conversationId: res.conversationId },
    });
    expect((await sam.get('/v1/notifications')).notifications).toEqual([]);
    // Sam, a day old at most, counts as brought by Noor (PRD §82); the link counts him.
    const row = await t.ctx.db
      .selectFrom('users')
      .select('invited_by')
      .where('id', '=', sam.user.id)
      .executeTakeFirstOrThrow();
    expect(row.invited_by).toBe(noor.user.id);
    expect(
      (await noor.get('/v1/invites')).invites.find((i: { id: string }) => i.id === inviteId).uses,
    ).toBe(1);
    // Opened again: the same conversation, nothing changed.
    const again = await sam.post(`/v1/invites/${token}/accept`);
    expect(again).toEqual({ ...res, already: true });
    expect((await sam.get(`/v1/invites/${token}`)).invite.conversationId).toBe(res.conversationId);
    expect(
      (await noor.get('/v1/invites')).invites.find((i: { id: string }) => i.id === inviteId).uses,
    ).toBe(1);
  });

  it('an under-18’s link stands as a request to them for an adult they don’t know (R29)', async () => {
    const rami = await signup(t, { displayName: 'Rami Young', birthDate: '2011-12-31' });
    const lina = await signup(t, { displayName: 'Lina Young', birthDate: '2012-06-30' });
    const mona = await signup(t, { displayName: 'Mona Adult', birthDate: '1985-01-01' });
    const link = (await rami.post('/v1/invites', {})).invite.token;
    // An adult who shares nobody with Rami: a request Rami decides on, not a connection.
    const asked = await mona.post(`/v1/invites/${link}/accept`);
    expect(asked).toMatchObject({ status: 'requested' });
    expect((await mona.get('/v1/connections')).connections).toEqual([]);
    const incoming = (await rami.get('/v1/connections/requests')).requests;
    expect(incoming.map((r: { id: string }) => r.id)).toEqual([asked.requestId]);
    const told = (await rami.get('/v1/notifications')).notifications;
    expect(told[0]).toMatchObject({
      kind: 'connection_request',
      title: 'Mona Adult opened your invite link',
      data: { requestId: asked.requestId, userId: mona.user.id },
    });
    // Opened again: the same request, no second one.
    expect(await mona.post(`/v1/invites/${link}/accept`)).toEqual(asked);
    // Rami accepts: connected, as any request accepted.
    const joined = await rami.post(`/v1/connections/requests/${asked.requestId}/accept`, {});
    expect(joined.status).toBe('connected');
    // Another under-18 connects through the link at once.
    const peer = await lina.post(`/v1/invites/${link}/accept`);
    expect(peer).toMatchObject({ status: 'connected', already: false });
    // So does an adult who shares a connection with Rami now (Mona and Lina don't; Lina and Mona
    // would through Rami): Mona opening Lina's link connects, since Rami links them.
    const linasLink = (await lina.post('/v1/invites', {})).invite.token;
    const known = await mona.post(`/v1/invites/${linasLink}/accept`);
    expect(known).toMatchObject({ status: 'connected', already: false });
  });

  it('is nobody’s own to accept, and no way past a block', async () => {
    const own = await noor.req('POST', `/v1/invites/${token}/accept`);
    expect(own.statusCode).toBe(400);
    await alex.post('/v1/blocks', { userId: noor.user.id });
    const blocked = await alex.req('POST', `/v1/invites/${token}/accept`);
    expect(blocked.statusCode).toBe(403);
    await alex.del(`/v1/blocks/${noor.user.id}`);
  });

  it('an account older than a day joins without being counted as brought', async () => {
    t.clock.advance(2 * 86_400_000);
    const res = await alex.post(`/v1/invites/${token}/accept`);
    expect(res.already).toBe(false);
    const row = await t.ctx.db
      .selectFrom('users')
      .select('invited_by')
      .where('id', '=', alex.user.id)
      .executeTakeFirstOrThrow();
    expect(row.invited_by).toBeNull();
  });

  it('taken back, it opens nothing; run out, the same; and spent links are swept', async () => {
    const dana = await signup(t, { displayName: 'Dana Ali', handle: 'dana' });
    expect(await noor.del(`/v1/invites/${inviteId}`)).toEqual({ ok: true });
    expect((await noor.req('DELETE', `/v1/invites/${inviteId}`)).statusCode).toBe(404);
    expect((await visit(`/i/${token}`)).statusCode).toBe(404);
    expect((await dana.req('POST', `/v1/invites/${token}/accept`)).statusCode).toBe(404);
    const fresh = (await noor.post('/v1/invites', {})).invite;
    t.clock.advance(31 * 86_400_000);
    expect((await dana.req('GET', `/v1/invites/${fresh.token}`)).statusCode).toBe(404);
    expect((await noor.get('/v1/invites')).invites).toEqual([]);
    t.clock.advance(KEPT_DAYS.spentInvites * 86_400_000);
    await sweepRecords(t.ctx);
    const left = await t.ctx.db.selectFrom('invites').select('id').execute();
    expect(left).toEqual([]);
  });
});
