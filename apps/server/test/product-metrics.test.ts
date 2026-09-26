import { uuidv4, uuidv7 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const ADMIN = 'operator-token-for-product-metrics-0123456789';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let t: TestApp;
let noor: Client;
let sam: Client;
let ivy: Client;
let cara: Client;
let dm: string;

const say = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });

beforeAll(async () => {
  t = await createTestApp({ ADMIN_TOKEN: ADMIN });
  // Sign-ups, requests and labels take the database's clock: start this one at the same time.
  const t0 = new Date();
  t.clock.set(t0.toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  ivy = await signup(t, { displayName: 'Ivy Stone' });
  cara = await signup(t, { displayName: 'Cara Customer' });

  // Noor asks Sam, saying how she knows him; Sam accepts. Ivy asks Noor, who declines.
  const r = await noor.post('/v1/connections/requests', {
    toUserId: sam.user.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  dm = (await sam.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
  const ivys = await ivy.post('/v1/connections/requests', { toUserId: noor.user.id });
  await noor.post(`/v1/connections/requests/${ivys.requestId}/decline`, {});

  t.clock.advance(2 * HOUR);
  await say(noor, dm, 'Hi Sam');
  t.clock.advance(HOUR);
  await say(sam, dm, 'Hi Noor');

  // A customer writes to Noor's organization and waits a quarter of an hour.
  const org = (await noor.post('/v1/orgs', { name: 'Tiles', handle: 'tiles.pm', kind: 'shop' }))
    .org;
  t.clock.advance(HOUR);
  const { conversationId } = await cara.post(`/v1/orgs/${org.id}/conversations`);
  await say(cara, conversationId, 'Do you have tiles?');
  t.clock.advance(15 * 60_000);
  await say(noor, conversationId, 'Yes');

  // Sam is still here a week on.
  t.clock.set(new Date(t0.getTime() + 8 * DAY).toISOString());
  await say(sam, dm, 'Still there?');

  // Needs you asked Noor something she answered, and one she said didn't need her.
  await say(sam, dm, 'Can you send me the plan?');
  await say(noor, dm, 'Here it is.');
  await noor.post(`/v1/conversations/${dm}/dismiss`, {});
  // Three searches in the app: two opened something, after 4 and 10 seconds.
  for (const outcome of [
    { found: true, ms: 4_000 },
    { found: true, ms: 10_000 },
    { found: false, ms: 20_000 },
  ])
    await noor.post('/v1/search/outcome', outcome);
  // Ivy came through Noor's link, Cara through the shop's.
  await t.ctx.db
    .updateTable('users')
    .set({ invited_by: noor.user.id })
    .where('id', '=', ivy.user.id)
    .execute();
  await t.ctx.db
    .updateTable('users')
    .set({ invited_by_org: org.id })
    .where('id', '=', cara.user.id)
    .execute();

  // Tasks, suggestions, notifications and AI calls, exactly (the flows above made some too,
  // some of them after their response).
  await t.ctx.flush();
  for (const table of ['tasks', 'suggestions', 'notifications', 'ai_runs'] as const)
    await t.ctx.db.deleteFrom(table).execute();
  const first = await t.ctx.db
    .selectFrom('messages')
    .select('id')
    .where('conversation_id', '=', dm)
    .where('kind', '<>', 'system')
    .orderBy('seq')
    .executeTakeFirstOrThrow();
  const at = new Date(t0.getTime() + 5 * DAY);
  const task = (
    owner: Client,
    assignee: Client | null,
    status: string,
    messageId: string | null,
  ) => ({
    id: uuidv7(),
    owner_id: owner.user.id,
    assignee_id: assignee?.user.id ?? null,
    title: 'Something to do',
    status: status as 'open',
    conversation_id: dm,
    message_id: messageId,
    created_at: at,
  });
  await t.ctx.db
    .insertInto('tasks')
    .values([
      task(noor, sam, 'done', first.id), // waiting on Sam, from a message, done
      task(noor, sam, 'open', null), // waiting on Sam, still open
      task(noor, noor, 'open', first.id), // Noor's own, from a message, open
      { ...task(noor, sam, 'open', null), created_at: new Date(t0.getTime() - 40 * DAY) }, // too old
    ])
    .execute();
  const suggestion = (status: 'accepted' | 'dismissed' | 'pending') => ({
    id: uuidv7(),
    user_id: noor.user.id,
    kind: 'task',
    title: 'Send the contract',
    rationale: 'You said you would.',
    confidence: 0.8,
    fingerprint: uuidv7(),
    status,
    created_at: at,
  });
  await t.ctx.db
    .insertInto('suggestions')
    .values([suggestion('accepted'), suggestion('dismissed'), suggestion('pending')])
    .execute();
  const note = (level: 'activity' | 'attention' | 'urgency') => ({
    id: uuidv7(),
    user_id: noor.user.id,
    kind: 'message',
    level,
    title: 'Something happened',
    created_at: at,
  });
  await t.ctx.db
    .insertInto('notifications')
    .values([note('activity'), note('attention'), note('urgency')])
    .execute();
  const run = (feature: string, outcome: string) => ({
    id: uuidv7(),
    user_id: noor.user.id,
    feature,
    provider: 'anthropic',
    outcome,
    created_at: at,
  });
  await t.ctx.db
    .insertInto('ai_runs')
    .values([run('rewrite', 'ok'), run('rewrite', 'ok'), run('translate', 'busy')])
    .execute();

  t.clock.set(new Date(t0.getTime() + 10 * DAY).toISOString());
});

afterAll(async () => {
  await t.close();
});

const metrics = async () =>
  (
    await t.app.inject({
      method: 'GET',
      url: '/v1/admin/metrics?days=28',
      headers: { authorization: `Bearer ${ADMIN}` },
    })
  ).json().metrics;

describe('product metrics (PRD §82–83)', () => {
  it('reads activation, engagement, the core rates and retention from what Caishy keeps', async () => {
    const m = await metrics();
    // Sam and Noor wrote in the last week; Cara three weeks ago.
    expect(m.people).toEqual({ total: 4, active7d: 2, active28d: 3 });
    expect(m.activation).toEqual({
      signedUp: 4,
      connected: { count: 2, of: 4, rate: 0.5 },
      messaged: { count: 3, of: 4, rate: 0.75 },
      classified: { count: 1, of: 4, rate: 0.25 },
      // Only Noor labelled someone and wrote within her first day.
      activated: { count: 1, of: 4, rate: 0.25 },
    });
    expect(m.engagement).toEqual({
      messages: 7,
      activePeople: 3,
      activeConversations: 2,
      activeConnections: 1,
    });
    expect(m.core).toEqual({
      connectionCompletion: { count: 1, of: 2, rate: 0.5 },
      relationshipCompletion: { count: 1, of: 2, rate: 0.5 },
      waitingResolution: { count: 1, of: 2, rate: 0.5 },
      attentionResolution: { count: 1, of: 2, rate: 0.5 },
      notificationEfficiency: { count: 2, of: 3, rate: 0.667 },
      retention: {
        // Sam, and Noor, who answered him a week on.
        day7: { count: 2, of: 4, rate: 0.5 },
        day28: { count: 0, of: 0, rate: null },
      },
      needsYouPrecision: { count: 1, of: 2, rate: 0.5 },
      informationRetrieval: { found: { count: 2, of: 3, rate: 0.667 }, medianSeconds: 7 },
    });
    // Two of the four came through a link, one of them a person's, and three people were active.
    expect(m.growth).toEqual({
      invited: { count: 2, of: 4, rate: 0.5 },
      viaOrganizations: 1,
      kFactor: 0.333,
    });
    expect(m.value).toEqual({
      tasksFromMessages: 2,
      suggestionsAccepted: { count: 1, of: 2, rate: 0.5 },
    });
    expect(m.ai).toEqual({
      calls: 3,
      ok: 2,
      byFeature: { rewrite: { ok: 2, other: 0 }, translate: { ok: 0, other: 1 } },
    });
    expect(m.business).toEqual({
      organizations: 1,
      activeOrganizations: 1,
      customerConversations: 1,
      reply: { medianMinutes: 15, answered: 1, withinHour: 1, unanswered: 0 },
    });
    expect(m.notMeasured.length).toBeGreaterThan(0);
  });

  it('knows whose link brought someone, and tells nobody', async () => {
    const via = async (invite: string, handle: string) => {
      const res = await t.app.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: {
          email: `${handle}@example.com`,
          password: 'correct horse battery',
          displayName: 'New Person',
          handle,
          birthYear: 1990,
          client: 'native',
          invite,
        },
      });
      expect(res.statusCode).toBe(201);
      return t.ctx.db
        .selectFrom('users')
        .select(['invited_by', 'invited_by_org'])
        .where('handle', '=', handle)
        .executeTakeFirstOrThrow();
    };
    const shop = await t.ctx.db
      .selectFrom('organizations')
      .select('id')
      .where('handle', '=', 'tiles.pm')
      .executeTakeFirstOrThrow();
    expect(await via(`@${noor.user.handle}`, 'from.noor')).toEqual({
      invited_by: noor.user.id,
      invited_by_org: null,
    });
    expect(await via('tiles.pm', 'from.tiles')).toEqual({
      invited_by: null,
      invited_by_org: shop.id,
    });
    expect(await via('nobody.here', 'from.nowhere')).toEqual({
      invited_by: null,
      invited_by_org: null,
    });
    await t.ctx.flush();
    const told = (await noor.get('/v1/notifications')).notifications.filter((n: any) =>
      JSON.stringify(n).includes('New Person'),
    );
    expect(told).toEqual([]);
  });

  it('is about nobody in particular', async () => {
    const text = JSON.stringify(await metrics());
    for (const secret of [
      'Noor',
      'Sam',
      'Hi Sam',
      'tiles',
      noor.user.id,
      sam.user.id,
      dm,
      noor.user.handle,
    ])
      expect(text).not.toContain(secret);
    const denied = await t.app.inject({
      method: 'GET',
      url: '/v1/admin/metrics',
      headers: { authorization: `Bearer ${noor.token}` },
    });
    expect(denied.statusCode).toBe(401);
  });
});
