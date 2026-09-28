import { uuidv4, uuidv7 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owner
let omar: Client; // on the team
let lina: Client; // a person the clinic writes to first
let orgId: string;

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
}
const start = (c: Client, handle: string, body: string) =>
  c.req('POST', `/v1/orgs/${orgId}/threads`, { handle, body, clientId: uuidv4() });
const send = (c: Client, conversationId: string, body: string) =>
  c.req('POST', `/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const sectionOf = async (c: Client, id: string) => {
  await t.ctx.flush();
  const ib = await c.get('/v1/inbox');
  return ib.sections.find((s: any) => s.items.some((i: any) => i.id === id))?.section;
};
const threadIn = async (c: Client, view: string, id: string) =>
  (await c.get(`/v1/orgs/${orgId}/inbox?view=${view}`)).threads.find(
    (x: any) => x.conversationId === id,
  );

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Customer' });
  await connect(noor, omar);
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
});

afterAll(async () => {
  await t.close();
});

describe('an organization writes to someone first (R14)', () => {
  let convo: string;

  it('only once its domain is verified', async () => {
    const res = await start(omar, lina.user.handle, 'Your check-up is due.');
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toBe(
      'Verify Nile Dental’s domain first: only a verified organization writes to someone first.',
    );
    // Verifying the domain has its own test (orgs.test.ts).
    await t.ctx.db
      .updateTable('organizations')
      .set({ domain: 'niledental.example', verified_at: t.ctx.now() })
      .where('id', '=', orgId)
      .execute();
  });

  it('arrives as a message request: silent, in Requests, one message until answered', async () => {
    const res = await start(
      omar,
      `@${lina.user.handle}`,
      'Hello Lina, your check-up is due. Reply to book: https://niledental.example/book',
    );
    expect(res.statusCode).toBe(201);
    const started = res.json();
    expect(started).toMatchObject({ created: true, message: { body: expect.any(String) } });
    convo = started.conversationId;

    // To Lina: a request from the clinic, never from Omar.
    const mine = (await lina.get(`/v1/conversations/${convo}`)).conversation;
    expect(mine).toMatchObject({ request: 'incoming', business: { org: { name: 'Nile Dental' } } });
    expect(await sectionOf(lina, convo)).toBe('requests');
    const seen = JSON.stringify(await lina.get(`/v1/conversations/${convo}/messages`));
    expect(seen).not.toContain(omar.user.id);
    expect(seen).not.toContain('Omar');
    await t.ctx.flush();
    const loud = (await lina.get('/v1/notifications')).notifications.filter(
      (n: any) => n.data?.conversationId === convo && n.level !== 'activity',
    );
    expect(loud).toEqual([]);

    // Nobody else on the team writes again until she answers.
    const more = await send(noor, convo, 'Just checking you saw this?');
    expect(more.statusCode).toBe(403);
    expect(more.json().error).toEqual({
      code: 'awaiting_acceptance',
      message: 'You can write again once they answer.',
    });
    // The team sees it waiting on her, Omar's, and that she hasn't answered.
    expect(await threadIn(noor, 'waiting', convo)).toMatchObject({
      state: 'waiting',
      awaitingAcceptance: true,
      assignee: { userId: omar.user.id },
    });
    expect(await threadIn(omar, 'mine', convo)).toBeDefined();
    expect((await omar.get(`/v1/conversations/${convo}`)).conversation.request).toBe('outgoing');
    expect((await noor.get(`/v1/orgs/${orgId}`)).org.plan.used.startsToday).toBe(1);

    // She answers: it's an ordinary conversation with the clinic from then on.
    expect((await send(lina, convo, 'Thursday morning works.')).statusCode).toBe(201);
    expect((await lina.get(`/v1/conversations/${convo}`)).conversation.request).toBeNull();
    expect(await threadIn(omar, 'customer_waiting', convo)).toMatchObject({
      awaitingAcceptance: false,
    });
    expect((await send(noor, convo, 'Booked: Thursday 9:30.')).statusCode).toBe(201);
  });

  it('writes into the conversation someone already has with it, without a request', async () => {
    const rana = await signup(t, { displayName: 'Rana Patient' });
    const own = (await rana.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
    await send(rana, own, 'Do you open on Saturdays?');
    const res = await start(omar, rana.user.handle, 'We do, 9 to 1.');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ conversationId: own, created: false });
    expect((await rana.get(`/v1/conversations/${own}`)).conversation.request).toBeNull();
    expect((await noor.get(`/v1/orgs/${orgId}`)).org.plan.used.startsToday).toBe(1);
  });

  it('declined, it stays shut, and the team isn’t told', async () => {
    const sam = await signup(t, { displayName: 'Sam Rivera' });
    const id = (await start(omar, sam.user.handle, 'A new branch opened near you.')).json()
      .conversationId;
    await sam.post(`/v1/conversations/${id}/request`, { decision: 'decline' });
    const again = await start(omar, sam.user.handle, 'Did you see this?');
    expect(again.statusCode).toBe(403);
    expect(again.json().error.code).toBe('awaiting_acceptance');
    expect(await threadIn(noor, 'waiting', id)).toMatchObject({ awaitingAcceptance: true });
    expect((await sam.get(`/v1/conversations/${id}`)).conversation.me.archived).toBe(true);
  });

  it('never reaches anyone under 18, anyone who blocked it, or who only hears from people they know', async () => {
    const nobody = 'Nobody by that handle can hear from Nile Dental.';
    const teen = await signup(t, { displayName: 'Rami Young', birthDate: '2011-12-31' });
    const hidden = await signup(t, { displayName: 'Hidden Person' });
    await hidden.req('PUT', '/v1/me/privacy', { discoverByHandle: false });
    const blocker = await signup(t, { displayName: 'Blocker' });
    await blocker.post(`/v1/orgs/${orgId}/block`, {});
    for (const handle of [teen.user.handle, hidden.user.handle, blocker.user.handle, 'no.one.here'])
      expect((await start(omar, handle, 'Hello')).json().error.message, handle).toBe(nobody);

    const careful = await signup(t, { displayName: 'Careful Person' });
    await careful.req('PUT', '/v1/me/privacy', { messageRequests: 'shared_connections' });
    const refused = await start(omar, careful.user.handle, 'Hello');
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toEqual({
      code: 'not_accepting_requests',
      message: 'Careful Person only takes messages from people they know.',
    });

    // Its own people are written to directly; its apps answer, they don't write first.
    expect((await start(omar, noor.user.handle, 'Hi')).statusCode).toBe(400);
    const bot = (
      await noor.post(`/v1/orgs/${orgId}/apps`, { name: 'Reminders', scopes: ['messages:write'] })
    ).token;
    const byBot = await t.app.inject({
      method: 'POST',
      url: `/v1/orgs/${orgId}/threads`,
      headers: { authorization: `Bearer ${bot}` },
      payload: { handle: careful.user.handle, body: 'Hi', clientId: uuidv4() },
    });
    expect(byBot.statusCode).toBe(403);
    // Someone outside the team can't write as it.
    expect((await start(lina, careful.user.handle, 'Hi')).statusCode).toBe(404);
  });

  it('leaves nothing behind when its first message can’t go', async () => {
    const clientId = uuidv4();
    const first = await signup(t, { displayName: 'First Patient' });
    const second = await signup(t, { displayName: 'Second Patient' });
    const write = (to: Client) =>
      omar.req('POST', `/v1/orgs/${orgId}/threads`, {
        handle: to.user.handle,
        body: 'Your appointment is tomorrow.',
        clientId,
      });
    expect((await write(first)).statusCode).toBe(201);
    // The same message id again, to someone else: refused, and no empty conversation stays.
    const reused = await write(second);
    expect(reused.json().error.message).toBe('That clientId was already used.');
    const left = await t.ctx.db
      .selectFrom('business_threads')
      .select('conversation_id')
      .where('customer_id', '=', second.user.id)
      .execute();
    expect(left).toEqual([]);
  });

  it('is limited to its plan’s starts a day, and a customer starting one never counts', async () => {
    // Fill the rest of the Free plan's 20 for today.
    const used = (await noor.get(`/v1/orgs/${orgId}`)).org.plan.used.startsToday;
    for (let i = used; i < 20; i++) {
      const id = uuidv7();
      await t.ctx.db
        .insertInto('conversations')
        .values({ id, kind: 'business', org_id: orgId, created_by: omar.user.id })
        .execute();
      await t.ctx.db
        .insertInto('business_threads')
        .values({
          conversation_id: id,
          org_id: orgId,
          customer_id: null,
          started_by_team: true,
          created_at: t.ctx.now(),
          updated_at: t.ctx.now(),
        })
        .execute();
    }
    const next = await signup(t, { displayName: 'Next Patient' });
    const res = await start(omar, next.user.handle, 'Your results are ready.');
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({
      code: 'plan_limit',
      message: expect.stringMatching(
        /^Nile Dental has started today’s 20 new conversations\. The next can start .+\. Business includes 1,000 a day\.$/,
      ),
      details: { nextAt: expect.any(String) },
    });
    // Nothing was left behind by the refusal.
    const left = await t.ctx.db
      .selectFrom('business_threads')
      .select('conversation_id')
      .where('customer_id', '=', next.user.id)
      .execute();
    expect(left).toEqual([]);

    // A customer writing first is never counted, and a day later there's room again.
    const walkIn = await signup(t, { displayName: 'Walk In' });
    expect((await walkIn.req('POST', `/v1/orgs/${orgId}/conversations`, {})).statusCode).toBe(201);
    t.clock.advance(24 * 3_600_000 + 60_000);
    expect((await start(omar, next.user.handle, 'Your results are ready.')).statusCode).toBe(201);
  });
});
