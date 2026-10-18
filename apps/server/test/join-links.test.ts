/**
 * Join links (M16 C3e, review 2026-10-17 §1 H5): a group's or a space's owner or admins hand out a
 * link, and a signed-in adult who opens it is in, reading what was said before, so a group comes
 * over from another app in one message. The token is shown once and kept as its hash; a link is
 * open until it runs out, is taken back, or its maker stops running the place. Whoever comes in by
 * one is a stranger to the people there, so the under-18 rules (R29) are a meeting guest's, and a
 * refusal reads the same whatever the reason.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimJoinLink } from '../src/lib/join-links';
import { productMetrics } from '../src/lib/product-metrics';
import { KEPT_DAYS, sweepRecords } from '../src/lib/retention';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let dir: string;
let noor: Client;
let omar: Client;
let lina: Client;
let club: string;
const PAGE = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const DAY = 86_400_000;

const tokenOf = (url: string) => url.split('/g/')[1] ?? '';
const visit = (url: string) => t.app.inject({ method: 'GET', url, headers: { accept: PAGE } });
const group = async (owner: Client, title: string, memberIds: string[] = []) =>
  (await owner.post('/v1/conversations', { kind: 'group', title, memberIds })).conversation
    .id as string;
const linkTo = async (who: Client, path: string) => {
  const made = await who.post(`${path}/join-links`, {});
  return { ...made, token: tokenOf(made.url) } as {
    link: { id: string; uses: number; by: string | null };
    url: string;
    token: string;
  };
};
const connect = async (a: Client, b: Client) => {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
};
const asAge = (id: string, birthDate: string) =>
  t.ctx.db.updateTable('users').set({ birth_date: birthDate }).where('id', '=', id).execute();
const inIt = async (conversationId: string) =>
  (
    await t.ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', conversationId)
      .where('left_at', 'is', null)
      .execute()
  ).map((p) => p.user_id);
const linesIn = async (conversationId: string, event: string) =>
  t.ctx.db
    .selectFrom('messages')
    .select(['sender_id', 'payload'])
    .where('conversation_id', '=', conversationId)
    .where('kind', '=', 'system')
    .where(sql<boolean>`payload->>'event' = ${event}`)
    .execute();
const usesOf = async (id: string) =>
  (
    await t.ctx.db
      .selectFrom('join_links')
      .select('uses')
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
  ).uses;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'caime-join-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' });
  // Accounts and events take the database's clock: this one starts at the same time.
  t.clock.set(new Date().toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad', handle: 'noor' });
  omar = await signup(t, { displayName: 'Omar Farouk', handle: 'omar' });
  lina = await signup(t, { displayName: 'Lina Stranger', handle: 'lina' });
  await connect(noor, omar);
  club = await group(noor, 'Book club', [omar.user.id]);
  await noor.post(`/v1/conversations/${club}/messages`, {
    clientId: uuidv4(),
    body: 'We read Dune next.',
  });
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('a link to a group', () => {
  let token: string;
  let linkId: string;
  let topic: string;

  it('is made by its owner or admins, its token shown once and kept only as its hash', async () => {
    // Someone in it who doesn't run it is told so; anyone else, as if it isn't there.
    const member = await omar.req('POST', `/v1/conversations/${club}/join-links`, {});
    expect(member.statusCode).toBe(403);
    expect(member.json().error.message).toBe('Only admins can add people.');
    expect((await lina.req('POST', `/v1/conversations/${club}/join-links`, {})).statusCode).toBe(
      404,
    );
    const made = await linkTo(noor, `/v1/conversations/${club}`);
    expect(made.url).toMatch(/^https:\/\/caime\.example\/g\/g_[A-Za-z0-9_-]{43}$/);
    expect(made.link).toMatchObject({ uses: 0, by: 'Noor Haddad' });
    token = made.token;
    linkId = made.link.id;
    // Listed for whoever runs it, without its token; nobody else sees the list.
    const listed = await noor.get(`/v1/conversations/${club}/join-links`);
    expect(listed.links.map((l: { id: string }) => l.id)).toEqual([linkId]);
    expect(JSON.stringify(listed)).not.toContain(token);
    expect((await omar.req('GET', `/v1/conversations/${club}/join-links`)).statusCode).toBe(403);
    expect((await lina.req('GET', `/v1/conversations/${club}/join-links`)).statusCode).toBe(404);
    // The database has its hash alone.
    const row = await t.ctx.db
      .selectFrom('join_links')
      .selectAll()
      .where('id', '=', linkId)
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.token_hash.length).toBe(32);
    expect(row.conversation_id).toBe(club);
    // Everyone in it is told a link lets people in from now on.
    const told = await linesIn(club, 'link_made');
    expect(told).toHaveLength(1);
    expect(told[0]?.payload).toMatchObject({ by: 'Noor Haddad' });
    expect(t.ctx.metrics.joinLinks.get({ target: 'group', outcome: 'made' })).toBeGreaterThan(0);
  });

  it('reads to a visitor as a page without the app, naming nobody in it', async () => {
    const page = await visit(`/g/${token}`);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<meta name="caime-page" content="join-link">');
    expect(page.body).toContain('<meta name="robots" content="noindex">');
    expect(page.body).toContain('<h1>Noor Haddad invites you to “Book club”</h1>');
    expect(page.body).toContain('an invitation to a group');
    expect(page.body).toContain('<dt class="mono">People</dt><dd>2 people</dd>');
    expect(page.body).toContain('you read what was said there before you came');
    expect(page.body).toContain(`href="/sign-up?link=${encodeURIComponent(`/g/${token}`)}"`);
    expect(page.body).toContain(`href="/sign-in?link=${encodeURIComponent(`/g/${token}`)}"`);
    expect(page.body).not.toContain('Omar');
    expect(page.body).not.toContain('Dune');
    expect(page.body).not.toContain('entry-abc.js');
    // A token nobody has, or of the wrong shape: the invite isn't open, never a handle's page.
    const gone = await visit(`/g/g_${'x'.repeat(43)}`);
    expect(gone.statusCode).toBe(404);
    expect(gone.body).toContain('<h1>This invite isn’t open</h1>');
    expect((await visit('/g/short')).statusCode).toBe(404);
  });

  it('lets a signed-in adult in with one tap, into its topics and its history', async () => {
    topic = (await noor.post(`/v1/conversations/${club}/topics`, { title: 'Picks' }))
      .conversationId;
    const karim = await signup(t, { displayName: 'Karim Saleh' });
    const open = await karim.get(`/v1/join-links/${token}`);
    expect(open.link).toEqual({
      target: 'group',
      name: 'Book club',
      purpose: null,
      spaceKind: null,
      memberCount: 2,
      org: null,
      invitedBy: 'Noor Haddad',
      member: false,
      expiresAt: expect.any(String),
      approval: false,
      asked: null,
    });
    expect(JSON.stringify(open)).not.toContain(omar.user.id);
    const joined = await karim.post(`/v1/join-links/${token}/accept`);
    expect(joined).toEqual({ asked: false, conversationId: club, spaceId: null, already: false });
    // In it, and in its topic, reading what was said before they came.
    expect(await inIt(club)).toContain(karim.user.id);
    expect(await inIt(topic)).toContain(karim.user.id);
    const history = await karim.get(`/v1/conversations/${club}/messages`);
    expect(JSON.stringify(history)).toContain('We read Dune next.');
    // Its people see who joined, by their own doing.
    const lines = await linesIn(club, 'member_joined');
    expect(lines.at(-1)).toMatchObject({
      sender_id: karim.user.id,
      payload: { userId: karim.user.id, name: 'Karim Saleh' },
    });
    // Twice is once, and the link counts the one.
    expect(await karim.post(`/v1/join-links/${token}/accept`)).toEqual({
      asked: false,
      conversationId: club,
      spaceId: null,
      already: true,
    });
    expect((await karim.get(`/v1/join-links/${token}`)).link.member).toBe(true);
    expect(await usesOf(linkId)).toBe(1);
    // An account made for the link is its maker's to have brought (R1's rule).
    const row = await t.ctx.db
      .selectFrom('users')
      .select('invited_by')
      .where('id', '=', karim.user.id)
      .executeTakeFirstOrThrow();
    expect(row.invited_by).toBe(noor.user.id);
    expect(t.ctx.metrics.joinLinks.get({ target: 'group', outcome: 'joined' })).toBeGreaterThan(0);
  });

  it('counts an account that was here before as no one’s to have brought', async () => {
    const old = await signup(t, { displayName: 'Old Hand' });
    await t.ctx.db
      .updateTable('users')
      .set({ created_at: new Date('2025-01-01T00:00:00Z') })
      .where('id', '=', old.user.id)
      .execute();
    await old.post(`/v1/join-links/${token}/accept`);
    const row = await t.ctx.db
      .selectFrom('users')
      .select('invited_by')
      .where('id', '=', old.user.id)
      .executeTakeFirstOrThrow();
    expect(row.invited_by).toBeNull();
    expect(await usesOf(linkId)).toBe(2);
  });

  it('opens nothing once taken back, and only whoever runs it takes it back', async () => {
    const made = await linkTo(noor, `/v1/conversations/${club}`);
    const path = `/v1/conversations/${club}/join-links/${made.link.id}`;
    expect((await omar.req('DELETE', path)).statusCode).toBe(403);
    expect((await lina.req('DELETE', path)).statusCode).toBe(404);
    await noor.del(path);
    const late = await signup(t, {});
    expect((await late.req('GET', `/v1/join-links/${made.token}`)).statusCode).toBe(404);
    expect((await late.req('POST', `/v1/join-links/${made.token}/accept`)).statusCode).toBe(404);
    expect((await visit(`/g/${made.token}`)).statusCode).toBe(404);
    expect((await noor.req('DELETE', path)).statusCode).toBe(404);
    expect(await inIt(club)).not.toContain(late.user.id);
    const listed = await noor.get(`/v1/conversations/${club}/join-links`);
    expect(listed.links.map((l: { id: string }) => l.id)).not.toContain(made.link.id);
  });

  it('runs out after its days, and is forgotten a while after', async () => {
    const made = await linkTo(noor, `/v1/conversations/${club}`);
    const late = await signup(t, {});
    const kept = async () =>
      (
        await t.ctx.db
          .selectFrom('join_links')
          .select('id')
          .where('id', '=', made.link.id)
          .execute()
      ).length;
    t.clock.advance(31 * DAY);
    try {
      expect((await late.req('GET', `/v1/join-links/${made.token}`)).statusCode).toBe(404);
      const listed = await noor.get(`/v1/conversations/${club}/join-links`);
      expect(listed.links.map((l: { id: string }) => l.id)).not.toContain(made.link.id);
      await sweepRecords(t.ctx);
      expect(await kept()).toBe(1);
      t.clock.advance(KEPT_DAYS.spentInvites * DAY);
      await sweepRecords(t.ctx);
      expect(await kept()).toBe(0);
    } finally {
      t.clock.advance(-(31 + KEPT_DAYS.spentInvites) * DAY);
    }
  });

  it('opens nothing once its maker no longer runs the group', async () => {
    await noor.patch(`/v1/conversations/${club}/members/${omar.user.id}`, { role: 'admin' });
    const made = await linkTo(omar, `/v1/conversations/${club}`);
    const late = await signup(t, {});
    expect((await late.get(`/v1/join-links/${made.token}`)).link.invitedBy).toBe('Omar Farouk');
    await noor.patch(`/v1/conversations/${club}/members/${omar.user.id}`, { role: 'member' });
    expect((await late.req('GET', `/v1/join-links/${made.token}`)).statusCode).toBe(404);
    expect((await late.req('POST', `/v1/join-links/${made.token}/accept`)).statusCode).toBe(404);
    expect((await visit(`/g/${made.token}`)).statusCode).toBe(404);
  });
});

describe('where a link may lead', () => {
  it('is never a private group, a topic, a space’s conversation or a meeting’s group', async () => {
    const refusal = async (path: string) => {
      const res = await noor.req('POST', `${path}/join-links`, {});
      expect(res.statusCode).toBe(403);
      expect(res.json().error.message).toBe('Join links aren’t available here.');
    };
    // A private group's messages are sealed for the devices its people chose.
    const sealed = await group(noor, 'Sealed', [omar.user.id]);
    const before = await linkTo(noor, `/v1/conversations/${sealed}`);
    await t.ctx.db
      .updateTable('conversations')
      .set({ privacy_class: 'private' })
      .where('id', '=', sealed)
      .execute();
    await refusal(`/v1/conversations/${sealed}`);
    // A link made before it was sealed opens nothing now.
    expect((await lina.req('GET', `/v1/join-links/${before.token}`)).statusCode).toBe(404);
    // A topic has its group's people; a space's conversation, its space's.
    const picks = (await noor.post(`/v1/conversations/${club}/topics`, { title: 'Later' }))
      .conversationId;
    await refusal(`/v1/conversations/${picks}`);
    const { space } = await noor.post('/v1/spaces', { name: 'Haddads', kind: 'family' });
    await refusal(`/v1/conversations/${space.generalId}`);
    // A meeting's group holds its guests (R84).
    const meeting = await group(noor, 'Quarterly', [omar.user.id]);
    const sent = await noor.post(`/v1/conversations/${meeting}/messages`, {
      clientId: uuidv4(),
      body: 'See you there',
    });
    await t.ctx.db
      .insertInto('meeting_spaces')
      .values({
        message_id: sent.message.id,
        conversation_id: meeting,
        copy_client_id: uuidv4(),
        created_by: noor.user.id,
      })
      .execute();
    await refusal(`/v1/conversations/${meeting}`);
  });

  it('keeps to ten open at once, and to the room in it', async () => {
    const busy = await group(noor, 'Busy');
    const made = [];
    for (let i = 0; i < 10; i++) made.push(await linkTo(noor, `/v1/conversations/${busy}`));
    const eleventh = await noor.req('POST', `/v1/conversations/${busy}/join-links`, {});
    expect(eleventh.statusCode).toBe(400);
    expect(eleventh.json().error.message).toBe('10 links are open: take one back first.');
    await noor.del(`/v1/conversations/${busy}/join-links/${made[0]?.link.id}`);
    await linkTo(noor, `/v1/conversations/${busy}`);
    // A link lets nobody into a place that's full, and spends nothing trying.
    const full = Array.from({ length: 256 }, () => uuidv4());
    const id = made[1]?.link.id as string;
    await expect(
      t.ctx.db.transaction().execute((trx) => claimJoinLink(trx, id, full, t.ctx.now())),
    ).rejects.toThrow('It’s full: 256 people are in it.');
    expect(await usesOf(id)).toBe(0);
  });

  it('can start from a group with nobody else in it yet', async () => {
    const alone = await noor.post('/v1/conversations', { kind: 'group', title: 'Just starting' });
    expect(await inIt(alone.conversation.id)).toEqual([noor.user.id]);
    // A private group starts with its people, chosen.
    const sealed = await noor.req('POST', '/v1/conversations', {
      kind: 'group',
      title: 'Sealed from the start',
      private: true,
    });
    expect(sealed.statusCode).toBe(400);
    expect(sealed.json().error.message).toBe('memberIds: Add at least one person.');
  });
});

describe('under 18 (R29)', () => {
  it('lets nobody under 18 in by a link, in the same words, and writes nothing', async () => {
    const made = await linkTo(noor, `/v1/conversations/${club}`);
    const teen = await signup(t, { displayName: 'Tia Teen', birthDate: '2012-05-01' });
    const res = await teen.req('POST', `/v1/join-links/${made.token}/accept`);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toBe(
      'Join links are for people 18 or over: ask someone in it to add you.',
    );
    expect(await inIt(club)).not.toContain(teen.user.id);
    expect(await usesOf(made.link.id)).toBe(0);
    expect(t.ctx.metrics.joinLinks.get({ target: 'group', outcome: 'refused' })).toBeGreaterThan(0);
    // Nor do they hand one out, for a group of their own.
    const theirs = await group(teen, 'Teen club');
    const own = await teen.req('POST', `/v1/conversations/${theirs}/join-links`, {});
    expect(own.statusCode).toBe(403);
    expect(own.json().error.message).toBe('Join links are made by people 18 or over.');
  });

  it('takes no link where someone under 18 is, and adds nobody under 18 while one is open', async () => {
    const dee = await signup(t, { displayName: 'Dee Young' });
    await connect(noor, dee);
    const family = await group(noor, 'Family');
    const { space } = await noor.post('/v1/spaces', { name: 'Cousins', kind: 'family' });
    const toGroup = await linkTo(noor, `/v1/conversations/${family}`);
    const toSpace = await linkTo(noor, `/v1/spaces/${space.id}`);
    await asAge(dee.user.id, '2012-01-01');
    try {
      // Both ways in refuse them while a link is open, in words that don't say who is under 18.
      for (const path of [
        `/v1/conversations/${family}/members`,
        `/v1/spaces/${space.id}/members`,
      ]) {
        const added = await noor.req('POST', path, { userIds: [dee.user.id] });
        expect(added.statusCode).toBe(403);
        expect(added.json().error.message).toBe('They can’t join while a link to it is open.');
      }
      expect(await inIt(family)).not.toContain(dee.user.id);
      // Once the links are taken back, they're added as anyone is.
      await noor.del(`/v1/conversations/${family}/join-links/${toGroup.link.id}`);
      await noor.del(`/v1/spaces/${space.id}/join-links/${toSpace.link.id}`);
      await noor.post(`/v1/conversations/${family}/members`, { userIds: [dee.user.id] });
      await noor.post(`/v1/spaces/${space.id}/members`, { userIds: [dee.user.id] });
      // And with them in it, neither takes a link again.
      for (const path of [`/v1/conversations/${family}`, `/v1/spaces/${space.id}`]) {
        const again = await noor.req('POST', `${path}/join-links`, {});
        expect(again.statusCode).toBe(403);
        expect(again.json().error.message).toBe('Join links aren’t available here.');
      }
    } finally {
      await asAge(dee.user.id, '1990-12-31');
    }
  });
});

describe('blocks', () => {
  it('let nobody in past a block either way with its maker, or by anyone in it', async () => {
    const made = await linkTo(noor, `/v1/conversations/${club}`);
    const refused = async (c: Client) => {
      const res = await c.req('POST', `/v1/join-links/${made.token}/accept`);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.message).toBe('This link can’t add you to it.');
      expect(await inIt(club)).not.toContain(c.user.id);
    };
    const blockedByMaker = await signup(t, {});
    await noor.post('/v1/blocks', { userId: blockedByMaker.user.id });
    await refused(blockedByMaker);
    const blockedByMember = await signup(t, {});
    await omar.post('/v1/blocks', { userId: blockedByMember.user.id });
    await refused(blockedByMember);
    const blocksMaker = await signup(t, {});
    await blocksMaker.post('/v1/blocks', { userId: noor.user.id });
    await refused(blocksMaker);
    expect(await usesOf(made.link.id)).toBe(0);
  });
});

describe('a link to a space', () => {
  it('lands its newcomer in General, as a member, told to its people', async () => {
    const { space } = await noor.post('/v1/spaces', {
      name: 'Running club',
      kind: 'community',
      purpose: 'Saturday mornings by the river',
    });
    const made = await linkTo(noor, `/v1/spaces/${space.id}`);
    expect(await linesIn(space.generalId, 'link_made')).toHaveLength(1);
    const page = await visit(`/g/${made.token}`);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<h1>Noor Haddad invites you to “Running club”</h1>');
    expect(page.body).toContain('an invitation to a space');
    expect(page.body).toContain('<dt class="mono">Kind</dt><dd>Community</dd>');
    expect(page.body).toContain('Saturday mornings by the river');
    const sam = await signup(t, { displayName: 'Sam Runner' });
    const open = await sam.get(`/v1/join-links/${made.token}`);
    expect(open.link).toMatchObject({
      target: 'space',
      name: 'Running club',
      spaceKind: 'community',
      memberCount: 1,
      member: false,
    });
    const joined = await sam.post(`/v1/join-links/${made.token}/accept`);
    expect(joined).toEqual({
      asked: false,
      conversationId: space.generalId,
      spaceId: space.id,
      already: false,
    });
    expect((await sam.get(`/v1/spaces/${space.id}`)).space.myRole).toBe('member');
    expect((await linesIn(space.generalId, 'member_joined')).at(-1)).toMatchObject({
      sender_id: sam.user.id,
    });
    // A member doesn't see its links; someone outside it isn't told it's there.
    expect((await sam.req('GET', `/v1/spaces/${space.id}/join-links`)).statusCode).toBe(403);
    expect((await lina.req('GET', `/v1/spaces/${space.id}/join-links`)).statusCode).toBe(404);
    expect(t.ctx.metrics.joinLinks.get({ target: 'space', outcome: 'joined' })).toBe(1);
  });

  it('asks in an organization’s name for one of its spaces, and closes with it archived', async () => {
    const orgId = (
      await noor.post('/v1/orgs', {
        country: 'EG',
        name: 'Nile Dental',
        handle: 'nile.dental',
        kind: 'clinic',
      })
    ).org.id;
    const { space } = await noor.post('/v1/spaces', {
      name: 'Front desk',
      kind: 'team',
      orgId,
    });
    const made = await linkTo(noor, `/v1/spaces/${space.id}`);
    const late = await signup(t, {});
    expect((await late.get(`/v1/join-links/${made.token}`)).link.org).toMatchObject({
      name: 'Nile Dental',
      handle: 'nile.dental',
    });
    const page = await visit(`/g/${made.token}`);
    expect(page.body).toContain('<h1>Nile Dental invites you to “Front desk”</h1>');
    expect(page.body).not.toContain('<dt class="mono">From</dt>');
    await t.ctx.db
      .updateTable('spaces')
      .set({ archived_at: t.ctx.now() })
      .where('id', '=', space.id)
      .execute();
    expect((await late.req('GET', `/v1/join-links/${made.token}`)).statusCode).toBe(404);
  });
});

describe('what a link costs (convention 14)', () => {
  it('reads its page and lets someone in with a bounded number of queries, whatever the size', async () => {
    const big = await group(noor, 'Big club', [omar.user.id]);
    const made = await linkTo(noor, `/v1/conversations/${big}`);
    const cost = async (run: () => Promise<unknown>) => {
      const before = t.queries();
      await run();
      return t.queries() - before;
    };
    const page = await cost(() => visit(`/g/${made.token}`));
    const first = await signup(t, {});
    const join = await cost(() => first.post(`/v1/join-links/${made.token}/accept`));
    // Twenty more in it: the page and a join cost the same.
    for (let i = 0; i < 20; i++)
      await (await signup(t, {})).post(`/v1/join-links/${made.token}/accept`);
    const pageLater = await cost(() => visit(`/g/${made.token}`));
    const last = await signup(t, {});
    const joinLater = await cost(() => last.post(`/v1/join-links/${made.token}/accept`));
    // Measured 2026-10-18: the page 7 and a join 40, with two in it or twenty-three.
    expect(pageLater).toBe(page);
    expect(joinLater).toBe(join);
    expect(page).toBeLessThanOrEqual(8);
    expect(join).toBeLessThanOrEqual(44);
  });
});

describe('what is kept of a link', () => {
  it('is in its maker’s export, never its token or who joined', async () => {
    const kept = await group(noor, 'Kept', [omar.user.id]);
    const made = await linkTo(noor, `/v1/conversations/${kept}`);
    const back = await linkTo(noor, `/v1/conversations/${kept}`);
    await noor.del(`/v1/conversations/${kept}/join-links/${back.link.id}`);
    const rae = await signup(t, { displayName: 'Rae Joiner' });
    await rae.post(`/v1/join-links/${made.token}/accept`);
    // A group they've since left goes unnamed.
    const left = await group(noor, 'Left behind', [omar.user.id]);
    await linkTo(noor, `/v1/conversations/${left}`);
    await noor.del(`/v1/conversations/${left}/members/${noor.user.id}`);
    const exported = await noor.get('/v1/me/export');
    const mine = exported.joinLinks.filter((l: { name: string | null }) => l.name === 'Kept');
    expect(mine).toHaveLength(2);
    expect(mine).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to: 'group', joined: 1, takenBackAt: null }),
        expect.objectContaining({ to: 'group', joined: 0, takenBackAt: expect.any(String) }),
      ]),
    );
    expect(JSON.stringify(exported.joinLinks)).not.toContain('Left behind');
    expect(
      exported.joinLinks.filter((l: { name: string | null }) => l.name === null).length,
    ).toBeGreaterThan(0);
    expect(JSON.stringify(exported.joinLinks)).not.toMatch(/g_[A-Za-z0-9_-]{43}/);
    expect(JSON.stringify(exported.joinLinks)).not.toContain('Rae');
  });

  it('counts for the product’s metrics: made, joined, and joined by someone new', async () => {
    const read = async () => {
      // The window ends now, by the database's clock, where the events were written.
      t.clock.set(new Date(Date.now() + 60_000).toISOString());
      return (await productMetrics(t.ctx, 30)).growth.joinLinks;
    };
    const before = await read();
    const made = await linkTo(noor, `/v1/conversations/${club}`);
    const fresh = await signup(t, {});
    await fresh.post(`/v1/join-links/${made.token}/accept`);
    const old = await signup(t, {});
    await t.ctx.db
      .updateTable('users')
      .set({ created_at: new Date('2025-01-01T00:00:00Z') })
      .where('id', '=', old.user.id)
      .execute();
    await old.post(`/v1/join-links/${made.token}/accept`);
    const after = await read();
    expect(after.made - before.made).toBe(1);
    expect(after.joined - before.joined).toBe(2);
    expect(after.newPeople - before.newPeople).toBe(1);
  });
});
