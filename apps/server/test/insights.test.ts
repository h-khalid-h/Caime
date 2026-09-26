import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owner
let omar: Client; // on the team
let orgId: string;
let freeOrgId: string;
let botToken: string;
const MIN = 60_000;

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
}
const say = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  await connect(noor, omar);
  orgId = (await noor.post('/v1/orgs', { name: 'Tiles Co', handle: 'tiles.co', kind: 'shop' })).org
    .id;
  freeOrgId = (
    await omar.post('/v1/orgs', { name: 'Omar Shop', handle: 'omar.shop', kind: 'shop' })
  ).org.id;
  await t.ctx.db
    .updateTable('organizations')
    .set({ plan: 'business' })
    .where('id', '=', orgId)
    .execute();
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  botToken = (
    await noor.post(`/v1/orgs/${orgId}/apps`, { name: 'Tiles Bot', scopes: ['messages:write'] })
  ).token;
});

afterAll(async () => {
  await t.close();
});

describe('insights for an organization (PRD §71)', () => {
  it('say how fast the team answers, counting people, not its bot', async () => {
    const customer = async (name: string) => {
      const c = await signup(t, { displayName: name });
      const { conversationId } = await c.post(`/v1/orgs/${orgId}/conversations`);
      return { c, id: conversationId as string };
    };
    const lina = await customer('Lina Customer');
    const dina = await customer('Dina Customer');
    const eli = await customer('Eli Customer');
    const fay = await customer('Fay Customer');

    await say(lina.c, lina.id, 'Do you have blue tiles?');
    t.clock.advance(10 * MIN);
    await say(omar, lina.id, 'We do.'); // 10 min

    t.clock.advance(50 * MIN);
    await say(dina.c, dina.id, 'Can you deliver Tuesday?');
    t.clock.advance(30 * MIN);
    await say(noor, dina.id, 'Yes, in the morning.'); // 30 min

    t.clock.advance(30 * MIN);
    await say(eli.c, eli.id, 'Are you open Friday?');
    t.clock.advance(1 * MIN);
    const bot = await t.app.inject({
      method: 'POST',
      url: `/v1/conversations/${eli.id}/messages`,
      headers: { authorization: `Bearer ${botToken}` },
      payload: { clientId: uuidv4(), body: 'We open at 9. Someone will confirm.' },
    });
    expect(bot.statusCode).toBe(201);
    t.clock.advance(19 * MIN);
    await say(omar, eli.id, 'Yes, 9 to 6.'); // 20 min: the bot's answer doesn't count

    t.clock.advance(40 * MIN);
    await say(fay.c, fay.id, 'Hello?'); // nobody answers
    t.clock.advance(5 * MIN);
    await say(fay.c, fay.id, 'Anyone there?'); // still the same wait
    t.clock.advance(-5 * MIN);

    t.clock.advance(60 * MIN);
    await say(lina.c, lina.id, 'And grout?'); // a new wait on the same conversation
    t.clock.advance(90 * MIN);
    await say(omar, lina.id, 'Grey or white.'); // 90 min
    await noor.post(`/v1/business/${lina.id}/resolve`);
    await noor.post(`/v1/business/${dina.id}/escalate`, { note: 'Big order' });

    const { insights } = await noor.get(`/v1/orgs/${orgId}/insights`);
    expect(insights).toMatchObject({
      days: 7,
      conversations: 4,
      newConversations: 4,
      // Waits of 10, 30, 20 and 90 minutes; Fay's is still open.
      reply: { medianMinutes: 25, answered: 4, withinHour: 3, unanswered: 1 },
      waitingNow: 1,
      resolved: 1,
      escalated: 1,
      previous: { conversations: 0, newConversations: 0, medianReplyMinutes: null, resolved: 0 },
    });
    // Counts and times only: nothing anyone wrote, and nobody singled out.
    const text = JSON.stringify(insights);
    for (const secret of ['tiles', 'Omar', 'Noor', 'Lina', omar.user.id])
      expect(text).not.toContain(secret);

    // A week later, those are last week's.
    t.clock.advance(7 * 24 * 60 * MIN);
    const later = (await noor.get(`/v1/orgs/${orgId}/insights`)).insights;
    expect(later).toMatchObject({
      conversations: 0,
      previous: { conversations: 4, medianReplyMinutes: 25 },
    });
    expect((await noor.get(`/v1/orgs/${orgId}/insights?days=30`)).insights.conversations).toBe(4);
  });

  it('are for owners and admins, on a plan that includes them', async () => {
    expect((await omar.req('GET', `/v1/orgs/${orgId}/insights`)).statusCode).toBe(403);
    const outsider = await signup(t, { displayName: 'Sam Outsider' });
    expect((await outsider.req('GET', `/v1/orgs/${orgId}/insights`)).statusCode).toBe(404);
    expect((await noor.req('GET', `/v1/orgs/${orgId}/insights?days=3`)).statusCode).toBe(400);
    const free = await omar.req('GET', `/v1/orgs/${freeOrgId}/insights`);
    expect(free.statusCode).toBe(403);
    expect(free.json().error).toMatchObject({
      code: 'plan_limit',
      message:
        'Insights come with Business: how fast Omar Shop’s team answers, how many customers write, and what’s still open.',
    });
  });
});
