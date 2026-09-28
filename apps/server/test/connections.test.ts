import { describeRelationshipEvent } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sarah: Client;

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, {
    displayName: 'Hassan Khalid',
    handle: 'hassan',
    email: 'hassan@datac.io',
  });
  sarah = await signup(t, {
    displayName: 'Sarah Smith',
    handle: 'sarahs',
    email: 'sarah@datac.io',
  });
});
afterAll(async () => {
  await t.close();
});

describe('find → connect → classify (the wedge, PRD §11, W1)', () => {
  let requestId: string;

  it('finds people by handle and by name', async () => {
    const byHandle = await hassan.get('/v1/people/search?q=@sarahs');
    expect(byHandle.results[0].person).toMatchObject({
      handle: 'sarahs',
      displayName: 'Sarah Smith',
    });
    expect(byHandle.results[0].connection.state).toBe('none');
    const byName = await hassan.get('/v1/people/search?q=sarah%20smit');
    expect(byName.results.map((r: any) => r.person.handle)).toContain('sarahs');
  });

  it('sends a request with shared context and a private classification', async () => {
    const res = await hassan.post('/v1/connections/requests', {
      toUserId: sarah.user.id,
      context: { sphere: 'work', orgName: 'DATA C' },
      relationship: { sphere: 'work', role: 'manager', orgName: 'DATA C' },
    });
    expect(res.status).toBe('requested');
    requestId = res.requestId;
  });

  it('the recipient sees the context, never the requester’s classification (PRD §52, §62)', async () => {
    const { requests } = await sarah.get('/v1/connections/requests?direction=incoming');
    expect(requests).toHaveLength(1);
    expect(requests[0].context).toMatchObject({ label: 'Work', orgName: 'DATA C' });
    expect(JSON.stringify(requests)).not.toMatch(/manager/i);
    const notes = await t.ctx.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', sarah.user.id)
      .execute();
    expect(notes.map((n) => n.title)).toContain('Hassan Khalid wants to connect with you');
  });

  it('accepting without classifying works (R4) and opens the general conversation', async () => {
    const res = await sarah.post(`/v1/connections/requests/${requestId}/accept`, {});
    expect(res.status).toBe('connected');
    expect(res.conversationId).toBeTruthy();
    const mine = await hassan.get('/v1/connections');
    expect(mine.connections[0]).toMatchObject({ conversationId: res.conversationId });
    expect(mine.connections[0].relationships[0]).toMatchObject({
      sphere: 'work',
      role: 'manager',
      label: 'Manager · DATA C',
      shared: false,
    });
    const hers = await sarah.get('/v1/connections');
    expect(hers.connections[0].relationships).toEqual([]);
  });

  it('suggests a classification from the request context — a suggestion, not a fact (R12)', async () => {
    const { suggestions } = await sarah.get(`/v1/suggestions?subjectUserId=${hassan.user.id}`);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ kind: 'relationship', title: 'Work · DATA C' });
    expect(suggestions[0].rationale).toBe(
      'Hassan Khalid described how you know each other as Work · DATA C.',
    );
    const accepted = await sarah.post(`/v1/suggestions/${suggestions[0].id}/accept`, {
      relationship: { sphere: 'work', role: 'direct_report', orgName: 'DATA C' },
    });
    expect(accepted.accepted.view).toMatchObject({ label: 'Direct report · DATA C' });
    // A resolved suggestion does not come back.
    expect(
      (await sarah.get(`/v1/suggestions?subjectUserId=${hassan.user.id}`)).suggestions,
    ).toEqual([]);
  });

  it('the same email domain suggests colleagues to the side that has not classified', async () => {
    const { suggestions } = await hassan.get(`/v1/suggestions?subjectUserId=${sarah.user.id}`);
    // Hassan already classified Sarah when requesting, so nothing is suggested to him.
    expect(suggestions).toEqual([]);
  });

  it('nothing about Hassan’s label leaks through Sarah’s view of him', async () => {
    const profile = await sarah.get(`/v1/people/${hassan.user.id}`);
    expect(profile.relationships[0]).toMatchObject({ role: 'direct_report' });
    expect(profile.mutual).toBeNull();
    expect(JSON.stringify(profile)).not.toMatch(/"manager"/);
  });

  it('mutual confirmation needs both sides to share (PRD §53, R6)', async () => {
    const h = await hassan.get(`/v1/people/${sarah.user.id}`);
    await hassan.patch(`/v1/relationships/${h.relationships[0].id}`, { shared: true });
    expect((await hassan.get(`/v1/people/${sarah.user.id}`)).mutual).toBeNull();
    const s = await sarah.get(`/v1/people/${hassan.user.id}`);
    await sarah.patch(`/v1/relationships/${s.relationships[0].id}`, { shared: true });
    const after = await hassan.get(`/v1/people/${sarah.user.id}`);
    expect(after.mutual).toEqual({ fit: 'complementary', theirLabel: 'Direct report · DATA C' });
  });

  it('the relationship profile answers "who is this to me" (PRD §67)', async () => {
    const p = await hassan.get(`/v1/people/${sarah.user.id}`);
    expect(p.connection.state).toBe('connected');
    expect(p.conversations[0]).toMatchObject({ title: 'General', isGeneral: true });
    expect(p.summary).toEqual({
      messages: 0,
      files: 0,
      links: 0,
      decisions: 0,
      openActions: 0,
      waiting: 0,
      contexts: [],
      rhythm: null,
      lastTalkedAt: null,
      theirAsks: 0,
      myAsks: 0,
      privacy: 'standard',
    });
    expect(p.person.trust.label).toBe('Known to you');
  });
});

describe('relationships evolve without losing history (PRD §13)', () => {
  it('a change supersedes; end reads "Former"; restore brings it back', async () => {
    const p = await hassan.get(`/v1/people/${sarah.user.id}`);
    const first = p.relationships[0];
    const changed = await hassan.patch(`/v1/relationships/${first.id}`, { role: 'colleague' });
    expect(changed.relationship).toMatchObject({
      label: 'Colleague · DATA C',
      shared: true,
      isPrimary: true,
    });
    expect(changed.relationship.id).not.toBe(first.id);
    const ended = await hassan.post(`/v1/relationships/${changed.relationship.id}/end`);
    expect(ended.relationship.label).toBe('Former colleague · DATA C');
    const restored = await hassan.post(`/v1/relationships/${changed.relationship.id}/restore`);
    expect(restored.relationship.status).toBe('active');
    const history = await hassan.get(`/v1/people/${sarah.user.id}/relationships`);
    expect(history.history.map((r: any) => r.status)).toEqual(['superseded', 'active']);
    // One line per thing that happened: the change is one event, not an addition plus a change.
    expect(history.events.map((e: any) => e.kind)).toEqual([
      'created',
      'shared',
      'changed',
      'ended',
      'restored',
    ]);
    expect(history.events.map((e: any) => describeRelationshipEvent(e, 'Sarah')).slice(2)).toEqual([
      '“Manager · DATA C” became “Colleague · DATA C”',
      '“Colleague · DATA C” ended',
      'Restored “Colleague · DATA C”',
    ]);
  });

  it('a person can hold more than one relationship; one is primary', async () => {
    const added = await hassan.post('/v1/relationships', {
      userId: sarah.user.id,
      sphere: 'friend',
      role: 'friend',
    });
    expect(added.relationship.isPrimary).toBe(false);
    await hassan.post(`/v1/relationships/${added.relationship.id}/primary`);
    const p = await hassan.get(`/v1/people/${sarah.user.id}`);
    expect(p.relationships[0]).toMatchObject({ sphere: 'friend', isPrimary: true });
    expect(p.relationships).toHaveLength(2);
  });

  it('family roles that do not end are archived instead', async () => {
    const lina = await signup(t, { displayName: 'Lina' });
    const req = await hassan.post('/v1/connections/requests', {
      toUserId: lina.user.id,
      relationship: { sphere: 'family', role: 'sibling' },
    });
    await lina.post(`/v1/connections/requests/${req.requestId}/accept`, {});
    const p = await hassan.get(`/v1/people/${lina.user.id}`);
    const res = await hassan.req('POST', `/v1/relationships/${p.relationships[0].id}/end`);
    expect(res.statusCode).toBe(400);
    expect(
      (await hassan.post(`/v1/relationships/${p.relationships[0].id}/archive`)).relationship.status,
    ).toBe('archived');
  });

  it('rejects roles that do not belong to the sphere, and accepts custom ones (R28)', async () => {
    const bad = await hassan.req('POST', '/v1/relationships', {
      userId: sarah.user.id,
      sphere: 'family',
      role: 'manager',
    });
    expect(bad.statusCode).toBe(400);
    const custom = await hassan.post('/v1/relationships', {
      userId: sarah.user.id,
      sphere: 'other',
      roleLabel: 'Climbing partner',
    });
    expect(custom.relationship.label).toBe('Climbing partner');
  });
});

describe('privacy by relationship (PRD §34)', () => {
  it('status visible to family only hides it from a work contact', async () => {
    // A status's emoji is one whole emoji, never words or half of one.
    for (const statusEmoji of ['ab', '🌴🌴', '🧑‍\ud83d'])
      expect((await sarah.req('PATCH', '/v1/me', { statusEmoji })).statusCode).toBe(400);
    expect((await sarah.patch('/v1/me', { statusEmoji: '👩🏽‍💻' })).user.statusEmoji).toBe(
      '👩🏽‍💻',
    );
    await sarah.patch('/v1/me', { statusEmoji: null });
    await sarah.patch('/v1/me', { statusText: 'At the beach' });
    const put = await sarah.req('PUT', '/v1/me/privacy', {
      fields: { status: { kind: 'spheres', spheres: ['family'] } },
    });
    expect(put.statusCode).toBe(200);
    const asHassan = await hassan.get(`/v1/people/${sarah.user.id}`);
    expect(asHassan.person.statusText).toBeNull();
    const mom = await signup(t, { displayName: 'Mona' });
    const r = await sarah.post('/v1/connections/requests', {
      toUserId: mom.user.id,
      relationship: { sphere: 'family', role: 'parent' },
    });
    await mom.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    expect((await mom.get(`/v1/people/${sarah.user.id}`)).person.statusText).toBe('At the beach');
  });
});

describe('requests: decline, cancel, mutual intent, blocks', () => {
  it('declines silently and enforces a cooldown; mutual requests connect at once', async () => {
    const a = await signup(t);
    const b = await signup(t);
    const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
    await b.post(`/v1/connections/requests/${r.requestId}/decline`);
    const again = await a.req('POST', '/v1/connections/requests', { toUserId: b.user.id });
    expect(again.statusCode).toBe(429);
    expect(again.json().error.code).toBe('recently_declined');
    // b changes their mind and asks a instead; a asking back connects immediately.
    const r2 = await b.post('/v1/connections/requests', { toUserId: a.user.id });
    expect(r2.status).toBe('requested');
    const back = await a.post('/v1/connections/requests', { toUserId: b.user.id });
    expect(back.status).toBe('connected');
  });

  it('a blocked person cannot find, see or request you', async () => {
    const x = await signup(t, { displayName: 'Xavier Stalker', handle: 'xavier' });
    await t.ctx.db
      .insertInto('blocks')
      .values({ blocker_id: sarah.user.id, blocked_id: x.user.id })
      .execute();
    expect((await x.get('/v1/people/search?q=sarahs')).results).toEqual([]);
    expect((await x.req('GET', `/v1/people/${sarah.user.id}`)).statusCode).toBe(404);
    expect(
      (await x.req('POST', '/v1/connections/requests', { toUserId: sarah.user.id })).statusCode,
    ).toBe(403);
  });
});

describe('teen protections (R29)', () => {
  it('adults cannot find teens in search or request them without a shared connection', async () => {
    const teen = await signup(t, {
      displayName: 'Tess Teen',
      handle: 'tessteen',
      birthDate: '2010-12-31',
    });
    const adult = await signup(t, { displayName: 'Adam Adult' });
    expect((await adult.get('/v1/people/search?q=tessteen')).results).toEqual([]);
    const res = await adult.req('POST', '/v1/connections/requests', { toUserId: teen.user.id });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('not_accepting_requests');
    const otherTeen = await signup(t, { displayName: 'Omar Teen', birthDate: '2011-12-31' });
    expect((await otherTeen.get('/v1/people/search?q=tessteen')).results).toHaveLength(1);
  });

  it('finds someone from their 18th birthday, where they are, and not a day before', async () => {
    const was = t.clock.now.toISOString();
    // 05:00 on 1 June in Tokyo, still 31 May in New York.
    t.clock.set('2026-05-31T20:00:00.000Z');
    try {
      const adult = await signup(t, { displayName: 'Ada Searcher' });
      const born = (handle: string, timeZone: string) =>
        signup(t, { displayName: 'Turning Eighteen', handle, birthDate: '2008-06-01', timeZone });
      await born('eighteen.tokyo', 'Asia/Tokyo');
      await born('eighteen.york', 'America/New_York');
      // A zone kept from before zones were checked, which Postgres doesn't know, reads as UTC
      // (still 31 May) rather than failing everyone's search.
      const mars = await born('eighteen.mars', 'UTC');
      await t.ctx.db
        .updateTable('users')
        .set({ time_zone: 'Mars/Olympus' })
        .where('id', '=', mars.user.id)
        .execute();
      const found = (await adult.get('/v1/people/search?q=eighteen')).results.map(
        (r: { person: { handle: string } }) => r.person.handle,
      );
      expect(found).toEqual(['eighteen.tokyo']);
    } finally {
      t.clock.set(was);
    }
  });
});

describe('policies (R11)', () => {
  it('lists defaults in words and explains how a person is treated', async () => {
    const { policies } = await hassan.get('/v1/policies');
    const vendor = policies.find((p: any) => p.scope.sphere === 'vendor');
    expect(vendor.description).toBe('Quiet unless important · Follow up after 48 h');
    const forSarah = await hassan.get(`/v1/policies/for/${sarah.user.id}`);
    expect(forSarah.description).toBe('Always notify');
  });

  it('a per-person rule overrides the sphere', async () => {
    const conn = (await hassan.get('/v1/connections')).connections.find(
      (c: any) => c.person.id === sarah.user.id,
    );
    await hassan.post('/v1/policies', {
      scope: { connectionId: conn.connectionId },
      settings: { notify: 'mute', priority: 'quiet' },
    });
    expect((await hassan.get(`/v1/policies/for/${sarah.user.id}`)).description).toBe(
      'Muted · Quiet',
    );
  });

  it('a scope has one rule, a person’s is for your own connection, and what they inherit shows', async () => {
    const conn = (await hassan.get('/v1/connections')).connections.find(
      (c: any) => c.person.id === sarah.user.id,
    );
    const before = (await hassan.get('/v1/policies')).policies.length;
    // The same person again is their rule, changed: never a second one.
    const again = await hassan.req('POST', '/v1/policies', {
      scope: { connectionId: conn.connectionId },
      settings: { aiTone: 'professional' },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().existing).toBe(true);
    const { policies } = await hassan.get('/v1/policies');
    expect(policies).toHaveLength(before);
    const theirs = policies.find((p: any) => p.scope.connectionId === conn.connectionId);
    expect(again.json().id).toBe(theirs.id);
    expect(theirs.settings).toEqual({ notify: 'mute', priority: 'quiet', aiTone: 'professional' });
    // The same kind of relationship again, named: the one rule, now with a name.
    const vendor = policies.find((p: any) => p.scope.sphere === 'vendor' && !p.scope.role);
    const named = await hassan.post('/v1/policies', {
      name: 'My vendors',
      scope: { sphere: 'vendor' },
      settings: {},
    });
    expect(named.id).toBe(vendor.id);
    const after = (await hassan.get('/v1/policies')).policies;
    expect(after).toHaveLength(before);
    expect(after.find((p: any) => p.id === vendor.id)).toMatchObject({
      name: 'My vendors',
      settings: vendor.settings,
    });
    // Someone else's connection isn't yours to make a rule for.
    const other = await signup(t, { displayName: 'Olga Other' });
    const theirConn = (await sarah.get('/v1/connections')).connections.find(
      (c: any) => c.person.id === hassan.user.id,
    );
    expect(theirConn.connectionId).toBe(conn.connectionId);
    const foreign = await other.req('POST', '/v1/policies', {
      scope: { connectionId: conn.connectionId },
      settings: { notify: 'always' },
    });
    expect(foreign.statusCode).toBe(404);
    expect(
      (
        await other.req('PATCH', `/v1/policies/${theirs.id}`, {
          settings: { notify: 'always' },
        })
      ).statusCode,
    ).toBe(404);
    // What they'd get without a rule of their own: their relationship's.
    const forSarah = await hassan.get(`/v1/policies/for/${sarah.user.id}`);
    expect(forSarah.policy.notify).toBe('mute');
    expect(forSarah.inherited.notify).toBe('always');
    expect(forSarah.inherited.sources.some((s: any) => s.level === 'connection')).toBe(false);
  });

  it('two devices making the same rule at once make one; a rule can’t be moved onto another', async () => {
    const zed = await signup(t, { displayName: 'Zed Twice' });
    const asked = await hassan.post('/v1/connections/requests', { toUserId: zed.user.id });
    await zed.post(`/v1/connections/requests/${asked.requestId}/accept`, {});
    const conn = (await hassan.get('/v1/connections')).connections.find(
      (c: any) => c.person.id === zed.user.id,
    );
    const scope = { connectionId: conn.connectionId };
    const [a, b] = await Promise.all([
      hassan.req('POST', '/v1/policies', { scope, settings: { notify: 'mute' } }),
      hassan.req('POST', '/v1/policies', { scope, settings: { priority: 'quiet' } }),
    ]);
    expect(a.json().id).toBe(b.json().id);
    const mine = (await hassan.get('/v1/policies')).policies.filter(
      (p: any) => p.scope.connectionId === conn.connectionId,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].settings).toEqual({ notify: 'mute', priority: 'quiet' });
    // Two changes to it at once both hold: neither is written over a copy read before the other.
    await Promise.all([
      hassan.patch(`/v1/policies/${mine[0].id}`, { settings: { aiTone: 'friendly' } }),
      hassan.patch(`/v1/policies/${mine[0].id}`, { settings: { allowUrgent: false } }),
      hassan.patch(`/v1/policies/${mine[0].id}`, { settings: { followUpHours: 48 } }),
    ]);
    expect(
      (await hassan.get('/v1/policies')).policies.find((p: any) => p.id === mine[0].id).settings,
    ).toEqual({
      notify: 'mute',
      priority: 'quiet',
      aiTone: 'friendly',
      allowUrgent: false,
      followUpHours: 48,
    });
    // Two resets at once leave the defaults once.
    const before = (await hassan.get('/v1/policies')).policies.filter(
      (p: any) => !p.scope.connectionId,
    ).length;
    await Promise.all([hassan.post('/v1/policies/reset'), hassan.post('/v1/policies/reset')]);
    const after = (await hassan.get('/v1/policies')).policies;
    expect(after.filter((p: any) => !p.scope.connectionId)).toHaveLength(before);
    // A rule moved onto a scope another rule has is refused.
    const friend = after.find((p: any) => p.scope.sphere === 'friend' && !p.scope.role);
    const vendor = after.find((p: any) => p.scope.sphere === 'vendor' && !p.scope.role);
    const moved = await hassan.req('PATCH', `/v1/policies/${vendor.id}`, {
      scope: { sphere: 'friend' },
    });
    expect(moved.statusCode).toBe(409);
    expect(moved.json().error.code).toBe('rule_exists');
    expect(
      (await hassan.get('/v1/policies')).policies.find((p: any) => p.id === friend.id),
    ).toMatchObject({ scope: { sphere: 'friend' } });
  });

  it('each rule reads as it applies, and the work week moves the rules that keep to it', async () => {
    // An account in Egypt works Sunday to Thursday.
    const wes = await signup(t, {
      displayName: 'Wes Week',
      timeZone: 'Africa/Cairo',
      locale: 'ar-EG',
    });
    const rules = async () => (await wes.get('/v1/policies')).policies as any[];
    const find = (all: any[], sphere: string, role?: string) =>
      all.find((p) => p.scope.sphere === sphere && (p.scope.role ?? undefined) === role);
    const first = await rules();
    expect(find(first, 'work').settings.schedule.days).toEqual([0, 1, 2, 3, 4]);
    // A manager's rule keeps to Work's hours, and says so; a new rule for clients, to customers'.
    expect(find(first, 'work', 'manager').description).toMatch(/^Notify Sun.Thu 08:00.20:00 · /);
    const clients = await wes.post('/v1/policies', {
      scope: { sphere: 'customer', role: 'client' },
      settings: {},
    });
    expect((await rules()).find((p) => p.id === clients.id).description).toMatch(/^Notify Sun.Thu/);
    // A rule with days of its own keeps them.
    await wes.post('/v1/policies', {
      scope: { sphere: 'friend' },
      settings: { notify: 'schedule', schedule: { days: [5, 6], start: '10:00', end: '22:00' } },
    });
    await wes.patch('/v1/me', { workweek: [1, 2, 3, 4, 5] });
    const moved = await rules();
    for (const sphere of ['work', 'customer', 'professional'])
      expect(find(moved, sphere).settings.schedule.days, sphere).toEqual([1, 2, 3, 4, 5]);
    expect(find(moved, 'friend').settings.schedule.days).toEqual([5, 6]);
    expect(find(moved, 'work', 'manager').description).toMatch(/^Notify Mon.Fri 08:00.20:00 · /);
  });
});

describe('where someone is known from (PRD §11)', () => {
  it('is one organization however it’s typed, and offered to pick next time', async () => {
    // Hassan knows Sarah from DATA C (above); Omar he types as " data   c ": the same place.
    const omar = await signup(t, { displayName: 'Omar Farouk' });
    const req = await hassan.post('/v1/connections/requests', {
      toUserId: omar.user.id,
      relationship: { sphere: 'work', role: 'colleague', orgName: ' data   c ' },
    });
    await omar.post(`/v1/connections/requests/${req.requestId}/accept`, {});
    const [first] = (await hassan.get(`/v1/people/${omar.user.id}`)).relationships;
    expect(first.label).toBe('Colleague · DATA C');
    // Changed to it in another case, nothing changes: no new version of the relationship.
    const same = await hassan.patch(`/v1/relationships/${first.id}`, { orgName: 'Data C' });
    expect(same.relationship).toMatchObject({ id: first.id, orgName: 'DATA C' });
    // Offered to pick, with how many people they know there; one organization in search.
    const { organizations } = await hassan.get('/v1/relationships/taxonomy');
    expect(organizations).toEqual([{ name: 'DATA C', people: 2 }]);
    expect((await hassan.get('/v1/search?q=data')).results.organizations).toEqual([
      { name: 'DATA C', people: 2 },
    ]);
    // Even two spellings kept from before are one there.
    await t.ctx.db
      .updateTable('relationships')
      .set({ org_name: 'Data c' })
      .where('owner_id', '=', hassan.user.id)
      .where('subject_id', '=', omar.user.id)
      .execute();
    const found = (await hassan.get('/v1/search?q=data')).results.organizations;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ name: expect.stringMatching(/^data c$/i), people: 2 });
  });

  it('their own organization comes first, as it’s written there', async () => {
    await hassan.post('/v1/orgs', {
      name: 'Nile Labs',
      handle: 'nilelabs',
      kind: 'business',
      country: 'EG',
    });
    const zein = await signup(t, { displayName: 'Zein Adel' });
    const req = await hassan.post('/v1/connections/requests', {
      toUserId: zein.user.id,
      relationship: { sphere: 'work', role: 'colleague', orgName: 'NILE LABS' },
    });
    await zein.post(`/v1/connections/requests/${req.requestId}/accept`, {});
    expect((await hassan.get(`/v1/people/${zein.user.id}`)).relationships[0].label).toBe(
      'Colleague · Nile Labs',
    );
    const { organizations } = await hassan.get('/v1/relationships/taxonomy');
    expect(organizations[0]).toEqual({ name: 'Nile Labs', people: 1 });
    expect(organizations.map((o: any) => o.name.toLowerCase())).toEqual(['nile labs', 'data c']);
    // Nobody else's.
    expect((await zein.get('/v1/relationships/taxonomy')).organizations).toEqual([]);
  });
});
