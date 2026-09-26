import { describeRelationshipEvent } from '@caishy/core';
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
    const teen = await signup(t, { displayName: 'Tess Teen', handle: 'tessteen', birthYear: 2010 });
    const adult = await signup(t, { displayName: 'Adam Adult' });
    expect((await adult.get('/v1/people/search?q=tessteen')).results).toEqual([]);
    const res = await adult.req('POST', '/v1/connections/requests', { toUserId: teen.user.id });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('not_accepting_requests');
    const otherTeen = await signup(t, { displayName: 'Omar Teen', birthYear: 2011 });
    expect((await otherTeen.get('/v1/people/search?q=tessteen')).results).toHaveLength(1);
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
});
