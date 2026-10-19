/**
 * An organization's say over its members' own apps (M16 G3, review 2026-10-17 §8 H4): a token
 * acting as someone on its team who doesn't run it (a personal token here; a bridge and an app
 * someone let in are the same grant) is kept from its conversations until its owner or an admin
 * lets them in: the team's side of its customer threads, its spaces, a thread written as it. The
 * person's own conversations stay theirs, a customer's side stays the customer's, its owner and
 * admins decide for themselves, and Caime's own app is never asked. Accounts, automations and
 * rules write audit rows.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owns Nile Dental
let omar: Client; // on its team
let lina: Client; // its customer
let karim: Client; // owns Acme Supply
let nileId: string;
let acmeId: string;
let own: string; // Omar and Noor's own one-to-one
let linaConvo: string; // Lina's thread with Nile Dental
let generalId: string; // Nile Dental's space's General
let spaceTask: string;
let ownTask: string;
let omarToken: string;
let noorToken: string;
let linaToken: string;

const CLOSED = 'This organization keeps its conversations from its members’ own apps.';
const SCOPES = ['messages:read', 'messages:write', 'actions:read', 'actions:write'];

const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const tokenOf = async (c: Client) =>
  (await c.req('POST', '/v1/me/tokens', { name: 'Zapier', scopes: SCOPES, days: 30 })).json()
    .token as string;
/** A request made with a token rather than a session. */
const as = (
  token: string,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  body?: Record<string, unknown>,
) =>
  t.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(body ? { payload: body } : {}),
  });
const inboxIds = async (token: string) =>
  ((await as(token, 'GET', '/v1/inbox?view=all')).json().conversations as Array<{ id: string }>)
    .map((c) => c.id)
    .sort();
const found = async (token: string, q: string) =>
  ((await as(token, 'GET', `/v1/search?q=${encodeURIComponent(q)}`)).json().results.messages ??
    []) as Array<{ conversationId: string }>;
const taskIds = async (token: string) =>
  ((await as(token, 'GET', '/v1/tasks?view=todo')).json().tasks as Array<{ id: string }>).map(
    (x) => x.id,
  );
const audited = (action: string) =>
  t.ctx.db
    .selectFrom('audit_log')
    .select(['actor_id', 'target', 'metadata'])
    .where('action', '=', action)
    .orderBy('seq')
    .execute();

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  karim = await signup(t, { displayName: 'Karim Nasser' });
  const org = (who: Client, name: string, handle: string) =>
    who.post('/v1/orgs', { country: 'EG', name, handle, kind: 'clinic' });
  nileId = (await org(noor, 'Nile Dental', 'nile.dental')).org.id;
  acmeId = (await org(karim, 'Acme Supply', 'acme.supply')).org.id;
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  own = (await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
  await noor.post(`/v1/orgs/${nileId}/members`, { userIds: [omar.user.id] });
  linaConvo = (await lina.post(`/v1/orgs/${nileId}/conversations`, {})).conversationId;
  await send(lina, linaConvo, 'Can I move my cleaning to Thursday?');
  const { space } = await noor.post('/v1/spaces', {
    name: 'Front desk',
    kind: 'team',
    orgId: nileId,
    memberIds: [omar.user.id],
  });
  generalId = space.generalId;
  await send(noor, generalId, 'The radiograph room is booked on Thursday.');
  await send(omar, own, 'Lunch at one? The radiograph talk is after.');
  spaceTask = (await omar.post('/v1/tasks', { title: 'Order film', conversationId: generalId }))
    .task.id;
  ownTask = (await omar.post('/v1/tasks', { title: 'Call the lab' })).task.id;
  omarToken = await tokenOf(omar);
  noorToken = await tokenOf(noor);
  linaToken = await tokenOf(lina);
});

afterAll(async () => {
  await t.close();
});

describe('an organization’s say over its members’ own apps (M16 G3)', () => {
  it('keeps its conversations from a team member’s own token by default', async () => {
    for (const url of [
      `/v1/conversations/${generalId}`,
      `/v1/conversations/${generalId}/messages`,
      `/v1/conversations/${linaConvo}`,
      `/v1/conversations/${linaConvo}/messages`,
    ]) {
      const refused = await as(omarToken, 'GET', url);
      expect(refused.statusCode, url).toBe(403);
      expect(refused.json().error).toMatchObject({ code: 'org_apps_closed', message: CLOSED });
    }
    const written = await as(omarToken, 'POST', `/v1/conversations/${generalId}/messages`, {
      clientId: uuidv4(),
      body: 'Sent from my Zap',
    });
    expect(written.json().error.code).toBe('org_apps_closed');
    // His own conversations are his: read and written as ever.
    expect((await as(omarToken, 'GET', `/v1/conversations/${own}/messages`)).statusCode).toBe(200);
    // The inbox, search and actions leave the organization's out, rather than refusing.
    expect(await inboxIds(omarToken)).not.toContain(generalId);
    expect(await inboxIds(omarToken)).toContain(own);
    expect((await found(omarToken, 'radiograph')).map((m) => m.conversationId)).toEqual([own]);
    expect(await taskIds(omarToken)).toEqual([ownTask]);
    expect(
      (await as(omarToken, 'POST', '/v1/tasks', { title: 'Sneak', conversationId: generalId }))
        .statusCode,
    ).toBe(403);
    expect(
      (await as(omarToken, 'PATCH', `/v1/tasks/${spaceTask}`, { status: 'done' })).statusCode,
    ).toBe(403);
    expect(
      (await as(omarToken, 'PATCH', `/v1/tasks/${ownTask}`, { title: 'Call the lab today' }))
        .statusCode,
    ).toBe(200);
    // A conversation he isn't in answers as it always has: nothing said of it.
    expect((await as(omarToken, 'GET', `/v1/conversations/${uuidv4()}`)).statusCode).toBe(404);
  });

  it('never asks Caime’s own app, its owner’s own token, or its customer’s', async () => {
    // Omar in Caime itself: everything, as before.
    expect((await omar.req('GET', `/v1/conversations/${generalId}/messages`)).statusCode).toBe(200);
    expect(
      ((await omar.get('/v1/inbox?view=all')).conversations as Array<{ id: string }>).map(
        (c) => c.id,
      ),
    ).toContain(generalId);
    // Noor runs it: her apps are her choice.
    expect((await as(noorToken, 'GET', `/v1/conversations/${generalId}/messages`)).statusCode).toBe(
      200,
    );
    expect((await as(noorToken, 'GET', `/v1/conversations/${linaConvo}/messages`)).statusCode).toBe(
      200,
    );
    // Lina's side of her thread is hers.
    expect((await as(linaToken, 'GET', `/v1/conversations/${linaConvo}/messages`)).statusCode).toBe(
      200,
    );
    expect(await inboxIds(linaToken)).toContain(linaConvo);
  });

  it('lets them in when its owner or an admin says so, and the audit log says who', async () => {
    expect((await omar.req('PATCH', `/v1/orgs/${nileId}`, { memberApps: true })).statusCode).toBe(
      403,
    );
    expect((await omar.get(`/v1/orgs/${nileId}`)).org.memberApps).toBe(false);
    const { org } = await noor.patch(`/v1/orgs/${nileId}`, { memberApps: true });
    expect(org.memberApps).toBe(true);
    // The team knows; nobody else is told.
    expect((await omar.get(`/v1/orgs/${nileId}`)).org.memberApps).toBe(true);
    expect((await lina.get(`/v1/orgs/${nileId}`)).org.memberApps).toBeNull();
    expect(await audited('org.member_apps_set')).toEqual([
      { actor_id: noor.user.id, target: nileId, metadata: { on: true } },
    ]);

    expect((await as(omarToken, 'GET', `/v1/conversations/${generalId}/messages`)).statusCode).toBe(
      200,
    );
    expect((await as(omarToken, 'GET', `/v1/conversations/${linaConvo}`)).statusCode).toBe(200);
    expect(await inboxIds(omarToken)).toContain(generalId);
    expect((await found(omarToken, 'radiograph')).map((m) => m.conversationId).sort()).toEqual(
      [generalId, own].sort(),
    );
    expect((await taskIds(omarToken)).sort()).toEqual([ownTask, spaceTask].sort());

    // Saying the same again writes nothing; off again is written.
    await noor.patch(`/v1/orgs/${nileId}`, { memberApps: true });
    await noor.patch(`/v1/orgs/${nileId}`, { memberApps: false });
    expect((await audited('org.member_apps_set')).map((r) => r.metadata)).toEqual([
      { on: true },
      { on: false },
    ]);
    expect((await as(omarToken, 'GET', `/v1/conversations/${generalId}`)).statusCode).toBe(403);
  });

  it('keeps a thread written as the organization (R64) the same way', async () => {
    // Made an admin, Omar writes to Acme as Nile Dental; his own apps reach it while he runs it.
    await noor.req('PATCH', `/v1/orgs/${nileId}/members/${omar.user.id}`, { role: 'admin' });
    const asNile = (await omar.post(`/v1/orgs/${acmeId}/conversations`, { asOrgId: nileId }))
      .conversationId as string;
    await send(omar, asNile, 'Ten boxes of gloves, please.');
    expect((await as(omarToken, 'GET', `/v1/conversations/${asNile}/messages`)).statusCode).toBe(
      200,
    );
    expect((await as(omarToken, 'GET', `/v1/conversations/${generalId}`)).statusCode).toBe(200);
    // Back on the team without running it: the thread is Nile Dental's, and kept from his apps.
    await noor.req('PATCH', `/v1/orgs/${nileId}/members/${omar.user.id}`, { role: 'agent' });
    expect((await as(omarToken, 'GET', `/v1/conversations/${asNile}/messages`)).statusCode).toBe(
      403,
    );
    expect(await inboxIds(omarToken)).not.toContain(asNile);
    expect((await omar.req('GET', `/v1/conversations/${asNile}/messages`)).statusCode).toBe(200);
  });

  it('writes audit rows for automations and rules, never what they say', async () => {
    const { id } = await omar.post('/v1/automations', {
      when: { kinds: ['document'] },
      collection: 'Lab reports',
    });
    await omar.patch(`/v1/automations/${id}`, { enabled: false });
    await omar.req('DELETE', `/v1/automations/${id}`);
    expect(await audited('automation.created')).toEqual([
      { actor_id: omar.user.id, target: id, metadata: {} },
    ]);
    expect(await audited('automation.updated')).toEqual([
      { actor_id: omar.user.id, target: id, metadata: { changed: ['enabled'] } },
    ]);
    expect(await audited('automation.removed')).toEqual([
      { actor_id: omar.user.id, target: id, metadata: {} },
    ]);

    const connection = (await omar.get('/v1/connections')).connections.find(
      (c: { person: { id: string } }) => c.person.id === noor.user.id,
    ).connectionId as string;
    const made = await omar.req('POST', '/v1/policies', {
      scope: { connectionId: connection },
      settings: { notify: 'always' },
    });
    expect(made.statusCode).toBe(201);
    const rule = made.json().id as string;
    await omar.patch(`/v1/policies/${rule}`, { settings: { notify: 'important_only' } });
    await omar.req('DELETE', `/v1/policies/${rule}`);
    await omar.post('/v1/policies/reset', {});
    expect(await audited('policy.created')).toEqual([
      {
        actor_id: omar.user.id,
        target: rule,
        metadata: { scope: 'person', settings: ['notify'] },
      },
    ]);
    expect(await audited('policy.updated')).toEqual([
      { actor_id: omar.user.id, target: rule, metadata: { settings: ['notify'] } },
    ]);
    expect(await audited('policy.removed')).toEqual([
      { actor_id: omar.user.id, target: rule, metadata: {} },
    ]);
    expect(await audited('policy.reset')).toEqual([
      { actor_id: omar.user.id, target: null, metadata: {} },
    ]);
    // Whom a rule was for stays out of the log.
    expect(JSON.stringify(await audited('policy.created'))).not.toContain(connection);
  });
});
