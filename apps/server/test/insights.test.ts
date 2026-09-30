import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const ADMIN = 'operator-token-for-the-insights-test-0123456789';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const T0 = new Date('2026-06-01T09:00:00.000Z');

let t: TestApp;
let noor: Client;
let alex: Client;
let sam: Client;
let withAlex: string;
let withSam: string;

async function connect(a: Client, b: Client, sphere: 'work' | 'friend') {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: sphere === 'work' ? { sphere, role: 'colleague' } : { sphere },
  });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}
const say = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body,
  });

beforeAll(async () => {
  t = await createTestApp({ ADMIN_TOKEN: ADMIN });
  t.clock.set(T0.toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad', timeZone: 'Africa/Cairo' });
  alex = await signup(t, { displayName: 'Alex Chen' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  withAlex = await connect(noor, alex, 'work');
  withSam = await connect(noor, sam, 'friend');
  // Long ago: a short exchange with Sam, then nothing.
  t.clock.advance(HOUR);
  await say(noor, withSam, 'Hey Sam');
  await say(sam, withSam, 'Hey!');
  // Recently: Alex writes first, Noor answers in 30 minutes; Noor writes first two days
  // later, Alex answers in an hour; Noor answers a question of his two hours later.
  t.clock.set(new Date(T0.getTime() + 55 * DAY).toISOString());
  await say(alex, withAlex, 'Are we on for Thursday?');
  t.clock.advance(30 * 60_000);
  await say(noor, withAlex, 'Yes, 10:30');
  t.clock.advance(2 * DAY);
  await say(noor, withAlex, 'Bringing the forms');
  t.clock.advance(HOUR);
  await say(alex, withAlex, 'Great. Parking?');
  t.clock.advance(2 * HOUR);
  await say(noor, withAlex, 'Behind the clinic');
  // Now: two months on (sessions last 90 days).
  t.clock.set(new Date(T0.getTime() + 60 * DAY).toISOString());
});
afterAll(async () => {
  await t.close();
});

describe('relationship insights (R47)', () => {
  it('come with Pro: Personal is told what they are and what to get', async () => {
    const r = await noor.req('GET', '/v1/me/insights');
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatchObject({ code: 'plan_limit', details: { nextPlan: 'pro' } });
    expect(r.json().error.message).toContain('Relationship insights come with Pro');
  });

  it('are worked out from your own one-to-ones, for you only', async () => {
    const set = await t.app.inject({
      method: 'PUT',
      url: `/v1/admin/people/${noor.user.handle}/plan`,
      headers: { authorization: `Bearer ${ADMIN}` },
      payload: { plan: 'pro' },
    });
    expect(set.statusCode).toBe(200);
    const bad = await noor.req('GET', '/v1/me/insights?days=7');
    expect(bad.statusCode).toBe(400);
    const { insights: i } = await noor.get('/v1/me/insights?days=30');
    expect(i.days).toBe(30);
    expect(i.connections).toEqual({
      total: 2,
      bySphere: expect.arrayContaining([
        { sphere: 'work', count: 1 },
        { sphere: 'friend', count: 1 },
      ]),
    });
    // Alex in the window, Sam in the one before it.
    expect(i.active).toEqual({ count: 1, previous: 1 });
    expect(i.messages).toEqual({ sent: 3, received: 2, previous: { sent: 1, received: 1 } });
    expect(i.closest).toEqual([
      {
        userId: alex.user.id,
        displayName: 'Alex Chen',
        avatarUrl: null,
        conversationId: withAlex,
        messages: 5,
        yourShare: 0.6,
      },
    ]);
    expect(i.quiet).toEqual([
      {
        userId: sam.user.id,
        displayName: 'Sam Rivera',
        avatarUrl: null,
        conversationId: withSam,
        lastAt: new Date(T0.getTime() + HOUR).toISOString(),
      },
    ]);
    // Noor answered Alex in 30 minutes and in 2 hours: a median of 75, one within the hour.
    expect(i.reply.yours).toEqual({ medianMinutes: 75, answered: 2, withinHour: 1, unanswered: 0 });
    // Alex answered her once, in an hour; her last line waits.
    expect(i.reply.theirs).toEqual({
      medianMinutes: 60,
      answered: 1,
      withinHour: 1,
      unanswered: 1,
    });
    // Two exchanges began after a day's silence: Alex started one, Noor the other.
    expect(i.started).toEqual({ byYou: 1, byThem: 1 });
    // Her three messages, by the hour of her day (Cairo is UTC+3 in June).
    expect(i.hours).toHaveLength(24);
    expect(i.hours.reduce((a: number, b: number) => a + b, 0)).toBe(3);
    expect(i.hours[12]).toBe(2); // 09:30Z, twice
    expect(i.hours[15]).toBe(1); // 12:30Z
  });

  it('never include a business conversation or a group', async () => {
    const group = await noor.post('/v1/conversations', {
      kind: 'group',
      title: 'Book club',
      memberIds: [alex.user.id, sam.user.id],
    });
    await say(noor, group.conversation.id, 'Welcome all');
    await say(sam, group.conversation.id, 'Hi');
    const { insights: i } = await noor.get('/v1/me/insights?days=30');
    expect(i.messages.sent).toBe(3);
    expect(i.quiet.map((q: { userId: string }) => q.userId)).toEqual([sam.user.id]);
  });
});

describe('automations by plan (R47)', () => {
  it('Personal keeps five; Pro keeps fifty', async () => {
    const make = (c: Client, n: number) =>
      c.req('POST', '/v1/automations', { when: { kinds: ['document'] }, collection: `Kept ${n}` });
    for (let n = 1; n <= 5; n++) expect((await make(alex, n)).statusCode).toBe(201);
    const sixth = await make(alex, 6);
    expect(sixth.statusCode).toBe(403);
    expect(sixth.json().error).toMatchObject({ code: 'plan_limit', details: { nextPlan: 'pro' } });
    expect(sixth.json().error.message).toBe(
      'Personal keeps 5 automations. Remove one to add another. Pro keeps 50.',
    );
    const plan = await alex.get('/v1/me/plan');
    expect(plan.used.automations).toBe(5);
    expect(plan.allowance.automations).toBe(5);
    await t.app.inject({
      method: 'PUT',
      url: `/v1/admin/people/${alex.user.handle}/plan`,
      headers: { authorization: `Bearer ${ADMIN}` },
      payload: { plan: 'pro' },
    });
    expect((await make(alex, 6)).statusCode).toBe(201);
  });
});
