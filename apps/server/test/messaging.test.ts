import { readFileSync } from 'node:fs';
import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { BusMessage } from '../src/lib/bus';
import { runDueJobs, runPeriodic } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sarah: Client;
let convo: string;

async function connect(a: Client, b: Client, aSeesB?: object, bSeesA?: object): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id, relationship: aSeesB });
  const res = await b.post(`/v1/connections/requests/${r.requestId}/accept`, {
    relationship: bSeesA,
  });
  return res.conversationId as string;
}

const send = (c: Client, conversationId: string, body: string, extra: object = {}) =>
  c
    .post(`/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body,
      ...extra,
    })
    .then((r) => r.message);

const inbox = async (c: Client) => {
  await t.ctx.flush();
  return c.get('/v1/inbox');
};
const sectionOf = (ib: any, id: string) =>
  ib.sections.find((s: any) => s.items.some((i: any) => i.id === id));
const itemOf = (ib: any, id: string) => sectionOf(ib, id)?.items.find((i: any) => i.id === id);

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, {
    displayName: 'Hassan Khalid',
    handle: 'hassan',
    email: 'hassan@example.com',
  });
  sarah = await signup(t, {
    displayName: 'Sarah Smith',
    handle: 'sarahs',
    email: 'sarah@example.com',
  });
  convo = await connect(
    hassan,
    sarah,
    { sphere: 'work', role: 'manager', orgName: 'DATA C' },
    { sphere: 'work', role: 'direct_report', orgName: 'DATA C' },
  );
});
afterAll(async () => {
  await t.close();
});

describe('delivery guarantees (PRD §80)', () => {
  it('a retried send returns the original message, never a duplicate', async () => {
    const clientId = uuidv4();
    const a = await hassan.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId,
      kind: 'text',
      body: 'Hello',
    });
    const b = await hassan.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId,
      kind: 'text',
      body: 'Hello',
    });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(200);
    expect(b.json().message.id).toBe(a.json().message.id);
    const count = await t.ctx.db
      .selectFrom('messages')
      .select(t.ctx.db.fn.countAll<string>().as('n'))
      .where('client_id', '=', clientId)
      .executeTakeFirstOrThrow();
    expect(Number(count.n)).toBe(1);
  });

  it('concurrent sends get unique, contiguous sequence numbers', async () => {
    const before = (await hassan.get(`/v1/conversations/${convo}`)).conversation.lastSeq;
    const sent = await Promise.all(
      Array.from({ length: 20 }, (_, i) => send(i % 2 ? hassan : sarah, convo, `burst ${i}`)),
    );
    const seqs = sent.map((m) => m.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => before + i + 1));
    const page = await hassan.get(`/v1/conversations/${convo}/messages?after=${before}&limit=50`);
    expect(page.messages.map((m: any) => m.seq)).toEqual(seqs);
  });
});

describe('the attention inbox (PRD §19, R7, R8)', () => {
  it('a request from my manager needs me, and says why', async () => {
    await sarah.post(`/v1/conversations/${convo}/receipts`, { read: 1000 });
    await hassan.post(`/v1/conversations/${convo}/receipts`, { read: 1000 });
    await send(sarah, convo, 'Can you send me the report by Friday?');
    const ib = await inbox(hassan);
    const item = itemOf(ib, convo);
    expect(sectionOf(ib, convo).section).toBe('needs_you');
    expect(item.reasons.map((r: any) => r.label)).toEqual([
      'Asked you to do something',
      'Manager · DATA C',
    ]);
    expect(item.relationship).toEqual({ label: 'Manager · DATA C', sphere: 'work' });
    expect(ib.headline).toBe('1 needs you');
  });

  it('"Doesn\'t need me" clears it (R8)', async () => {
    await hassan.post(`/v1/conversations/${convo}/dismiss`);
    expect(sectionOf(await inbox(hassan), convo).section).not.toBe('needs_you');
  });

  it('my open question puts the conversation in Waiting for me', async () => {
    await hassan.post(`/v1/conversations/${convo}/receipts`, { read: 1000 });
    await send(hassan, convo, 'Which template should I use?');
    const ib = await inbox(hassan);
    expect(sectionOf(ib, convo).section).toBe('waiting');
    expect(itemOf(ib, convo).reasons[0].label).toBe('Waiting for a reply');
    // ...and it needs Sarah.
    expect(sectionOf(await inbox(sarah), convo).section).toBe('needs_you');
  });
});

describe('message intelligence → suggestions (PRD §23, §29)', () => {
  it('my commitment suggests a reminder to me and a waiting item to them', async () => {
    const m = await send(hassan, convo, "I'll send the proposal tomorrow.");
    await t.ctx.flush();
    const mine = (await hassan.get(`/v1/suggestions?conversationId=${convo}`)).suggestions.find(
      (s: any) => s.messageId === m.id,
    );
    expect(mine).toMatchObject({ kind: 'reminder', title: 'Send proposal', dueText: 'tomorrow' });
    const hers = (await sarah.get(`/v1/suggestions?conversationId=${convo}`)).suggestions.find(
      (s: any) => s.messageId === m.id,
    );
    expect(hers).toMatchObject({
      kind: 'waiting',
      title: 'Proposal',
      subjectUserId: hassan.user.id,
    });
    expect(hers.rationale).toBe("Hassan wrote “I'll send the proposal tomorrow.”");
    const accepted = await sarah.post(`/v1/suggestions/${hers.id}/accept`);
    const task = await t.ctx.db
      .selectFrom('tasks')
      .selectAll()
      .where('id', '=', accepted.accepted.id)
      .executeTakeFirstOrThrow();
    expect(task).toMatchObject({
      owner_id: sarah.user.id,
      assignee_id: hassan.user.id,
      shared: false,
      source: 'suggestion',
      message_id: m.id,
    });
    expect(task.relationship_snapshot).toMatchObject({ label: 'Direct report · DATA C' });
  });

  it('a decision is recorded once, whoever accepts first', async () => {
    const m = await send(sarah, convo, "Let's go with the blue design.");
    await t.ctx.flush();
    const hs = (
      await hassan.get(`/v1/suggestions?conversationId=${convo}&kind=decision`)
    ).suggestions.find((s: any) => s.messageId === m.id);
    expect(hs.title).toBe('Go with the blue design');
    await hassan.post(`/v1/suggestions/${hs.id}/accept`);
    const ss = (
      await sarah.get(`/v1/suggestions?conversationId=${convo}&kind=decision`)
    ).suggestions.filter((s: any) => s.messageId === m.id);
    expect(ss).toEqual([]);
    const decisions = await t.ctx.db
      .selectFrom('decisions')
      .selectAll()
      .where('message_id', '=', m.id)
      .execute();
    expect(decisions).toHaveLength(1);
  });
});

describe('notifications (PRD §31–§33)', () => {
  it('a burst becomes one notification that counts', async () => {
    const lina = await signup(t, { displayName: 'Lina Aziz' });
    const c = await connect(
      lina,
      sarah,
      { sphere: 'friend', role: 'friend' },
      { sphere: 'friend', role: 'close_friend' },
    );
    for (const text of ['Hi', 'Are you there?', 'I need something', 'Can you call me?'])
      await send(lina, c, text);
    await t.ctx.flush();
    const rows = await t.ctx.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', sarah.user.id)
      .where('group_key', '=', `conv:${c}`)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      count: 4,
      title: 'Lina Aziz sent 4 messages',
      delivery: 'push',
      body: 'Can you call me?',
    });
  });

  it('work messages outside work hours are held until morning (R9)', async () => {
    t.clock.set('2026-09-24T02:30:00Z'); // 22:30 in New York
    const m = await send(hassan, convo, 'Quick one for tomorrow');
    await t.ctx.flush();
    const n = await t.ctx.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', sarah.user.id)
      .where('group_key', '=', `conv:${convo}`)
      .orderBy('updated_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(n.data).toMatchObject({ messageId: m.id });
    expect(n.delivery).toBe('held');
    expect(n.hold_until?.toISOString()).toBe('2026-09-24T12:00:00.000Z'); // 08:00 New York
    t.clock.set('2026-09-24T12:01:00Z');
    await runPeriodic(t.ctx);
    const after = await t.ctx.db
      .selectFrom('notifications')
      .select('delivery')
      .where('id', '=', n.id)
      .executeTakeFirstOrThrow();
    expect(after.delivery).toBe('push');
    t.clock.set('2026-09-23T14:00:00Z');
  });

  it('names the sender as they show themselves to each person, on a lock screen too (PRD §35)', async () => {
    const ivy = await signup(t, { displayName: 'Ivy Marsh' });
    const c = await connect(ivy, sarah);
    const identity = (
      await ivy.post('/v1/me/identities', { kind: 'professional', displayName: 'Dr. I. Marsh' })
    ).id;
    const side = await t.ctx.db
      .selectFrom('connection_sides')
      .select('connection_id')
      .where('owner_id', '=', ivy.user.id)
      .where('other_id', '=', sarah.user.id)
      .executeTakeFirstOrThrow();
    await ivy.patch(`/v1/connections/${side.connection_id}`, { identityId: identity });
    await send(ivy, c, 'Can you send me the scan by Friday?');
    await t.ctx.flush();
    const [n] = await t.ctx.db
      .selectFrom('notifications')
      .select(['title'])
      .where('user_id', '=', sarah.user.id)
      .where('group_key', '=', `conv:${c}`)
      .execute();
    expect(n?.title).toBe('Dr. I. Marsh');
    // What it suggests says so too (who asked, who promised): never the name she keeps for
    // everyone else.
    await send(ivy, c, 'I will send you the report by Friday.');
    await t.ctx.flush();
    const suggestions = await t.ctx.db
      .selectFrom('suggestions')
      .select(['title', 'rationale'])
      .where('user_id', '=', sarah.user.id)
      .where('conversation_id', '=', c)
      .execute();
    expect(suggestions.length).toBeGreaterThan(0);
    expect(JSON.stringify(suggestions)).toContain('Dr.');
    expect(JSON.stringify(suggestions)).not.toContain('Ivy');
    // Another message within the burst keeps the same name.
    await send(ivy, c, 'Thanks!');
    await t.ctx.flush();
    const burst = await t.ctx.db
      .selectFrom('notifications')
      .select(['title'])
      .where('user_id', '=', sarah.user.id)
      .where('group_key', '=', `conv:${c}`)
      .executeTakeFirstOrThrow();
    expect(burst.title).toBe('Dr. I. Marsh sent 3 messages');
  });

  it('reading the conversation clears its notification', async () => {
    await sarah.post(`/v1/conversations/${convo}/receipts`, { read: 100000 });
    const unread = await t.ctx.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', sarah.user.id)
      .where('group_key', '=', `conv:${convo}`)
      .where('read_at', 'is', null)
      .execute();
    expect(unread).toEqual([]);
  });
});

describe('message requests from people you are not connected with (R14)', () => {
  it('one message until accepted; it waits in Requests; replying accepts', async () => {
    const zed = await signup(t, { displayName: 'Zed Stranger' });
    const opened = await zed.post('/v1/conversations', { kind: 'direct', userId: sarah.user.id });
    const id = opened.conversation.id;
    expect(opened.conversation.request).toBe('outgoing');
    await send(
      zed,
      id,
      'Hi Sarah, I found your talk great. Can we chat? https://example.com/slides',
    );
    const second = await zed.req('POST', `/v1/conversations/${id}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body: 'Hello?',
    });
    expect(second.statusCode).toBe(403);
    expect(second.json().error.code).toBe('awaiting_acceptance');
    const ib = await inbox(sarah);
    expect(sectionOf(ib, id).section).toBe('requests');
    // A stranger's question creates no work for Sarah.
    const suggestions = (await sarah.get(`/v1/suggestions?conversationId=${id}`)).suggestions;
    expect(suggestions).toEqual([]);
    await send(sarah, id, 'Sure, happy to.');
    expect((await sarah.get(`/v1/conversations/${id}`)).conversation.request).toBeNull();
    await send(zed, id, 'Great, thanks!');
  });

  it('declined, it stays shut and unanswered to its sender; writing back opens it', async () => {
    const zed = await signup(t, { displayName: 'Persistent Stranger' });
    const opened = await zed.post('/v1/conversations', { kind: 'direct', userId: sarah.user.id });
    const id = opened.conversation.id;
    await send(zed, id, 'Hi Sarah, quick question about your talk.');
    await sarah.post(`/v1/conversations/${id}/request`, { decision: 'decline' });
    const again = await zed.req('POST', `/v1/conversations/${id}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body: 'Why did you decline?',
    });
    expect(again.statusCode).toBe(403);
    expect(again.json().error.code).toBe('awaiting_acceptance');
    // Zed isn't told, here or by opening it again; Sarah hears nothing more.
    const reopened = await zed.post('/v1/conversations', { kind: 'direct', userId: sarah.user.id });
    expect(reopened.conversation).toMatchObject({ id, request: 'outgoing' });
    const row = (await inbox(zed)).sections
      .flatMap((x: { items: Array<{ id: string; request: string | null }> }) => x.items)
      .find((i: { id: string }) => i.id === id);
    expect(row?.request).toBe('outgoing');
    await t.ctx.flush();
    const heard = (await sarah.get('/v1/notifications')).notifications.filter((n: any) =>
      String(n.body).includes('Why did you decline'),
    );
    expect(heard).toEqual([]);

    // Sarah changes her mind: writing to Zed accepts it and brings it back for her.
    await send(sarah, id, 'Sorry, I was travelling. Ask away!');
    const mine = (await sarah.get(`/v1/conversations/${id}`)).conversation;
    expect(mine).toMatchObject({ request: null, me: { archived: false } });
    expect((await send(zed, id, 'Thanks!')).seq).toBeGreaterThan(0);
  });

  it('nobody can start one when requests are off', async () => {
    const quiet = await signup(t, { displayName: 'Quiet Person' });
    await quiet.req('PUT', '/v1/me/privacy', { messageRequests: 'nobody' });
    const zed = await signup(t, { displayName: 'Another Stranger' });
    const res = await zed.req('POST', '/v1/conversations', {
      kind: 'direct',
      userId: quiet.user.id,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('read receipts are reciprocal', () => {
  it('turning mine off hides theirs from me and mine from them', async () => {
    const view = async (c: Client) =>
      (await c.get(`/v1/conversations/${convo}`)).conversation.other.readSeq;
    expect(await view(hassan)).toBeGreaterThan(0);
    await sarah.req('PUT', '/v1/me/privacy', { fields: { readReceipts: { kind: 'nobody' } } });
    expect(await view(hassan)).toBeNull();
    expect(await view(sarah)).toBeNull();
    await sarah.req('PUT', '/v1/me/privacy', { fields: { readReceipts: { kind: 'connections' } } });
  });
});

describe('topics emerge from the conversation (PRD §58)', () => {
  it('suggests a topic after it keeps coming up, and creates it on accept', async () => {
    await send(hassan, convo, 'Project Alpha kickoff moved to Monday');
    await send(sarah, convo, 'Who owns Project Alpha budget?');
    await send(hassan, convo, 'Project Alpha budget is with finance');
    await t.ctx.flush();
    const s = (await sarah.get(`/v1/suggestions?conversationId=${convo}&kind=topic`))
      .suggestions[0];
    expect(s).toMatchObject({ title: 'Project Alpha' });
    const res = await sarah.post(`/v1/suggestions/${s.id}/accept`);
    const topic = await sarah.get(`/v1/conversations/${res.accepted.id}`);
    expect(topic.conversation).toMatchObject({
      kind: 'direct',
      isGeneral: false,
      topic: 'Project Alpha',
      parentId: convo,
    });
    expect(
      (await hassan.get(`/v1/suggestions?conversationId=${convo}&kind=topic`)).suggestions,
    ).toEqual([]);
    const people = await hassan.get(`/v1/people/${sarah.user.id}/conversations`);
    expect(people.conversations.map((c: any) => c.title)).toEqual(['General', 'Project Alpha']);
  });
});

describe('topics in a group (PRD §58)', () => {
  let ana: Client; // the group's owner
  let bo: Client;
  let cal: Client;
  let dee: Client;
  let g: string;
  const view = async (c: Client, id: string) =>
    (await c.get(`/v1/conversations/${id}`)).conversation;
  const roles = async (c: Client, id: string) =>
    Object.fromEntries(
      ((await view(c, id)).participants as any[]).map((p) => [p.person.displayName, p.role]),
    );
  const start = (c: Client, id: string, title: string) =>
    c.req('POST', `/v1/conversations/${id}/topics`, { title });
  const lines = async (c: Client, id: string) =>
    ((await c.get(`/v1/conversations/${id}/messages`)).messages as any[])
      .filter((m) => m.kind === 'system')
      .map((m) => m.payload.event);

  beforeAll(async () => {
    ana = await signup(t, { displayName: 'Ana Topics' });
    bo = await signup(t, { displayName: 'Bo Topics' });
    cal = await signup(t, { displayName: 'Cal Topics' });
    dee = await signup(t, { displayName: 'Dee Topics' });
    for (const c of [bo, cal, dee]) await connect(ana, c);
    g = (
      await ana.post('/v1/conversations', {
        kind: 'group',
        title: 'Book club',
        memberIds: [bo.user.id, cal.user.id],
      })
    ).conversation.id;
    await ana.patch(`/v1/conversations/${g}/members/${bo.user.id}`, { role: 'admin' });
  });

  it('anyone in it starts one: the group again, on one subject, run as the group is', async () => {
    const r = await start(cal, g, 'Middlemarch');
    expect(r.statusCode).toBe(201);
    const topic = r.json().conversationId;
    expect(await view(bo, topic)).toMatchObject({
      kind: 'group',
      title: 'Book club',
      topic: 'Middlemarch',
      name: 'Middlemarch',
      parentId: g,
    });
    expect(await roles(bo, topic)).toEqual({
      'Ana Topics': 'owner',
      'Bo Topics': 'admin',
      'Cal Topics': 'member',
    });
    // The group lists it, and says who started it; the topic says where it's from.
    expect((await view(ana, g)).topics).toEqual([
      expect.objectContaining({ id: topic, title: 'Middlemarch' }),
    ]);
    expect(await lines(ana, g)).toContain('topic_started');
    expect(await lines(ana, topic)).toContain('topic_created');
    // In the inbox it goes by the group's name, with its own as the topic.
    const item = itemOf(await inbox(bo), topic);
    expect(item).toMatchObject({ title: 'Book club', topic: 'Middlemarch' });
    // The same subject again is the same topic; a topic's topic is one of the group's.
    expect((await start(bo, g, 'middlemarch')).json().conversationId).toBe(topic);
    const beloved = (await start(bo, topic, 'Beloved')).json().conversationId;
    expect((await view(ana, beloved)).parentId).toBe(g);
    // Nobody outside it starts one.
    expect((await start(dee, g, 'Gatecrash')).statusCode).toBe(404);
  });

  it('its people are the group’s: they come and go with it, in the roles they have there', async () => {
    const topic = (await start(ana, g, 'Next month')).json().conversationId;
    // Added to the group, Dee is in its topics too, caught up.
    await ana.post(`/v1/conversations/${g}/members`, { userIds: [dee.user.id] });
    expect(await roles(dee, topic)).toMatchObject({ 'Dee Topics': 'member' });
    expect(itemOf(await inbox(dee), topic).unreadCount).toBe(0);
    // Made an admin there, she's one here.
    await ana.patch(`/v1/conversations/${g}/members/${dee.user.id}`, { role: 'admin' });
    expect((await roles(ana, topic))['Dee Topics']).toBe('admin');
    // Removed from the group, Cal is out of its topics: nothing of them reaches him.
    await ana.req('DELETE', `/v1/conversations/${g}/members/${cal.user.id}`);
    expect((await cal.req('GET', `/v1/conversations/${topic}`)).statusCode).toBe(404);
    expect(
      (await inbox(cal)).sections.flatMap((x: any) => x.items).map((i: any) => i.id),
    ).not.toContain(topic);
    // They're changed in the group, not in a topic.
    for (const r of [
      await ana.req('POST', `/v1/conversations/${topic}/members`, { userIds: [cal.user.id] }),
      await ana.req('DELETE', `/v1/conversations/${topic}/members/${dee.user.id}`),
      await ana.req('PATCH', `/v1/conversations/${topic}/members/${dee.user.id}`, {
        role: 'member',
      }),
    ]) {
      expect(r.statusCode).toBe(400);
      expect(r.json().error.message).toBe(
        'A topic’s people are its group’s: add, remove or make admins there.',
      );
    }
    const leave = await bo.req('DELETE', `/v1/conversations/${topic}/members/${bo.user.id}`);
    expect(leave.json().error.message).toBe(
      'Leave the group to leave its topics. You can archive this one.',
    );
    // Its owner gone, whoever runs the group next runs its topics.
    await ana.req('DELETE', `/v1/conversations/${g}/members/${ana.user.id}`);
    expect(await roles(bo, g)).toEqual({ 'Bo Topics': 'owner', 'Dee Topics': 'admin' });
    expect(await roles(bo, topic)).toEqual({ 'Bo Topics': 'owner', 'Dee Topics': 'admin' });
  });

  it('as private as its group, and one that keeps coming up is offered as a topic', async () => {
    const secret = (
      await ana.post('/v1/conversations', {
        kind: 'group',
        title: 'Surprise party',
        memberIds: [dee.user.id],
        private: true,
      })
    ).conversation.id;
    const hidden = (await start(ana, secret, 'Venue')).json().conversationId;
    expect((await view(dee, hidden)).privacyClass).toBe('private');
    const plans = (
      await ana.post('/v1/conversations', {
        kind: 'group',
        title: 'Trip planning',
        memberIds: [dee.user.id],
      })
    ).conversation.id;
    await send(ana, plans, 'Project Lisbon flights are up');
    await send(dee, plans, 'Who books Project Lisbon hotels?');
    await send(ana, plans, 'Project Lisbon hotels are with me');
    await t.ctx.flush();
    const s = (await dee.get(`/v1/suggestions?conversationId=${plans}&kind=topic`)).suggestions[0];
    expect(s).toMatchObject({ title: 'Project Lisbon' });
    const made = (await dee.post(`/v1/suggestions/${s.id}/accept`)).accepted.id;
    expect(await view(ana, made)).toMatchObject({
      kind: 'group',
      title: 'Trip planning',
      topic: 'Project Lisbon',
      parentId: plans,
    });
  });

  it('a one-to-one’s topics are the two of them; never from a private one, nor with an organization', async () => {
    const direct = (await ana.get(`/v1/people/${dee.user.id}/conversations`)).conversations.find(
      (c: any) => c.isGeneral,
    ).id;
    const topic = (await start(dee, direct, 'Birthday')).json().conversationId;
    expect(await view(ana, topic)).toMatchObject({ kind: 'direct', topic: 'Birthday' });
    expect((await view(ana, direct)).topics.map((x: any) => x.title)).toContain('Birthday');
    const sealed = (
      await ana.post('/v1/conversations', { kind: 'direct', userId: dee.user.id, private: true })
    ).conversation.id;
    const refused = await start(ana, sealed, 'Leak');
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error.message).toBe(
      'A private conversation keeps to itself: start a topic from your main one.',
    );
    // A stranger's message request isn't the place for one either.
    const zed = await signup(t, { displayName: 'Zed Topics' });
    const request = (await zed.post('/v1/conversations', { kind: 'direct', userId: ana.user.id }))
      .conversation.id;
    expect((await start(zed, request, 'Sell')).statusCode).toBe(403);
  });

  it('an owner whose account goes hands on the group and its topics alike', async () => {
    const eve = await signup(t, { displayName: 'Eve Topics' });
    await connect(eve, bo);
    await connect(eve, dee);
    const club = (
      await eve.post('/v1/conversations', {
        kind: 'group',
        title: 'Choir',
        memberIds: [bo.user.id, dee.user.id],
      })
    ).conversation.id;
    await eve.patch(`/v1/conversations/${club}/members/${dee.user.id}`, { role: 'admin' });
    const topic = (await start(bo, club, 'Concert')).json().conversationId;
    expect(
      (await eve.req('DELETE', '/v1/me', { password: 'correct horse battery' })).statusCode,
    ).toBe(200);
    expect(await roles(bo, club)).toEqual({ 'Bo Topics': 'member', 'Dee Topics': 'owner' });
    expect(await roles(bo, topic)).toEqual({ 'Bo Topics': 'member', 'Dee Topics': 'owner' });
    expect(await lines(bo, topic)).toContain('owner_changed');
  });

  it('its messages disappear as the group’s do, and its name follows the group’s', async () => {
    const heard: BusMessage[] = [];
    const stop = t.ctx.bus.subscribe((m) => heard.push(m));
    try {
      const poetry = (
        await ana.post('/v1/conversations', {
          kind: 'group',
          title: 'Poetry',
          memberIds: [bo.user.id, dee.user.id],
        })
      ).conversation.id;
      const keats = (await start(bo, poetry, 'Keats')).json().conversationId;
      await ana.patch(`/v1/conversations/${poetry}`, { retentionDays: 1 });
      expect((await view(bo, keats)).retentionDays).toBe(1);
      expect(await lines(bo, keats)).toContain('retention_changed');
      // Changed in the group, never in a topic.
      const own = await ana.req('PATCH', `/v1/conversations/${keats}`, { retentionDays: 30 });
      expect(own.statusCode).toBe(400);
      expect(own.json().error.message).toBe(
        'A topic’s messages disappear as its group’s do: change it there.',
      );
      await ana.patch(`/v1/conversations/${poetry}`, { retentionDays: null });
      expect((await view(bo, keats)).retentionDays).toBeNull();
      // Renamed, the group's topics show its new name; a topic renamed, the group lists it so.
      const updated = (id: string) =>
        heard.some(
          (m) =>
            m.event.type === 'conversation.updated' &&
            m.userIds.includes(bo.user.id) &&
            (m.event.data as { conversationId?: string }).conversationId === id,
        );
      heard.length = 0;
      await ana.patch(`/v1/conversations/${poetry}`, { title: 'Verse' });
      for (let i = 0; i < 300 && !updated(keats); i++) await new Promise((r) => setTimeout(r, 10));
      expect(updated(keats)).toBe(true);
      expect((await view(bo, keats)).title).toBe('Verse');
      heard.length = 0;
      await ana.patch(`/v1/conversations/${keats}`, { title: 'John Keats' });
      for (let i = 0; i < 300 && !updated(poetry); i++) await new Promise((r) => setTimeout(r, 10));
      expect(updated(poetry)).toBe(true);
      // Coming into a topic, it's as quiet as the group is for them.
      const until = new Date(t.clock.now.getTime() + 7 * 86_400_000).toISOString();
      await bo.patch(`/v1/conversations/${poetry}`, { mutedUntil: until });
      const shelley = (await start(ana, poetry, 'Shelley')).json().conversationId;
      expect((await view(bo, shelley)).me.mutedUntil).toBe(until);
      expect((await view(ana, shelley)).me.mutedUntil).toBeNull();
      // Its calls ring by the group's name with its own.
      await t.ctx.flush();
      const call = await ana.req('POST', `/v1/conversations/${shelley}/group-calls`, {
        kind: 'voice',
        deviceId: 'ana-tab-1',
      });
      expect(call.statusCode).toBe(201);
      expect(call.json().call.conversationTitle).toBe('Verse · Shelley');
      await t.ctx.flush();
      const ring = (await bo.get('/v1/notifications')).notifications.find(
        (n: any) => n.kind === 'call' && n.data?.conversationId === shelley,
      );
      expect(ring?.title).toBe('Ana Topics is calling Verse · Shelley');
      // Found by name, it says which group it's of.
      const found = (await bo.get('/v1/search?q=Shelley')).results.contexts ?? [];
      expect(found.map((c: any) => c.title)).toContain('Verse · Shelley');
    } finally {
      stop();
    }
  });

  it('started from a suggestion as from its details: the same rules, and it opens for everyone', async () => {
    const heard: BusMessage[] = [];
    const stop = t.ctx.bus.subscribe((m) => heard.push(m));
    try {
      const fay = await signup(t, { displayName: 'Fay Topics' });
      const gus = await signup(t, { displayName: 'Gus Topics' });
      const seed = async (a: Client, b: Client, where: string, subject: string) => {
        await send(a, where, `${subject} flights are up`);
        await send(b, where, `Who books ${subject} hotels?`);
        await send(a, where, `${subject} hotels are with me`);
        await t.ctx.flush();
      };
      const offered = async (c: Client, where: string) =>
        (await c.get(`/v1/suggestions?conversationId=${where}&kind=topic`)).suggestions[0];
      // Between connections: a blocked one can't start it, nor can a pair no longer connected.
      const faygus = await connect(fay, gus);
      expect((await view(fay, faygus)).connected).toBe(true);
      await seed(fay, gus, faygus, 'Project Porto');
      const gusCopy = await offered(gus, faygus);
      expect(gusCopy).toMatchObject({ title: 'Project Porto' });
      await fay.post('/v1/blocks', { userId: gus.user.id });
      expect((await gus.req('POST', `/v1/suggestions/${gusCopy.id}/accept`)).statusCode).toBe(404);
      expect(await offered(fay, faygus)).toBeUndefined();
      await fay.del(`/v1/blocks/${gus.user.id}`);
      await seed(fay, gus, faygus, 'Project Faro');
      const faro = await offered(fay, faygus);
      const conn = (await fay.get('/v1/connections')).connections.find(
        (c: any) => c.person.id === gus.user.id,
      );
      await gus.del(`/v1/connections/${conn.connectionId}`);
      expect((await view(fay, faygus)).connected).toBe(false);
      const late = await fay.req('POST', `/v1/suggestions/${faro.id}/accept`);
      expect(late.statusCode).toBe(403);
      expect(late.json().error.message).toBe('Connect first to start topics.');
      expect((await start(fay, faygus, 'Faro')).statusCode).toBe(403);
      // A name as long as one started from the details may be, no longer.
      const trip = (
        await ana.post('/v1/conversations', {
          kind: 'group',
          title: 'Road trip',
          memberIds: [dee.user.id],
        })
      ).conversation.id;
      await seed(ana, dee, trip, 'Project Braga');
      const anas = await offered(ana, trip);
      const deesCopy = await offered(dee, trip);
      const long = await ana.req('POST', `/v1/suggestions/${anas.id}/accept`, {
        title: 'x'.repeat(81),
      });
      expect(long.statusCode).toBe(400);
      // Accepted by one of them, the others' offers go, and theirs opens the same topic.
      heard.length = 0;
      const made = (await ana.post(`/v1/suggestions/${anas.id}/accept`)).accepted.id;
      const resolved = () =>
        heard.some(
          (m) =>
            m.event.type === 'suggestion.resolved' &&
            m.userIds.includes(dee.user.id) &&
            (m.event.data as { id?: string }).id === deesCopy.id,
        );
      for (let i = 0; i < 300 && !resolved(); i++) await new Promise((r) => setTimeout(r, 10));
      expect(resolved()).toBe(true);
      expect((await dee.post(`/v1/suggestions/${deesCopy.id}/accept`)).accepted).toEqual({
        type: 'conversation',
        id: made,
      });
    } finally {
      stop();
    }
  });
});

describe('follow-ups (PRD §69)', () => {
  it('no reply from a vendor within 48 h surfaces a follow-up', async () => {
    const dhl = await signup(t, { displayName: 'DHL Desk' });
    const c = await connect(hassan, dhl, { sphere: 'vendor', role: 'delivery_provider' });
    await send(hassan, c, 'Can you share the tracking number?');
    await t.ctx.flush();
    t.clock.advance(49 * 3_600_000);
    await runDueJobs(t.ctx);
    const n = await t.ctx.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', hassan.user.id)
      .where('kind', '=', 'follow_up')
      .executeTakeFirstOrThrow();
    expect(n.title).toBe('No reply from DHL Desk yet');
    const ib = await inbox(hassan);
    expect(itemOf(ib, c).reasons.map((r: any) => r.code)).toContain('follow_up_due');
    t.clock.set('2026-09-23T14:00:00Z');
  });

  it('reminds as the rule says when it’s due, and never about someone since blocked', async () => {
    const start = t.clock.now.toISOString();
    const followUps = async (c: Client) =>
      (
        await t.ctx.db
          .selectFrom('notifications')
          .select('title')
          .where('user_id', '=', c.user.id)
          .where('kind', '=', 'follow_up')
          .execute()
      ).map((n) => n.title);
    try {
      // Turned off after asking: no reminder.
      const ups = await signup(t, { displayName: 'UPS Desk' });
      const u = await connect(hassan, ups, { sphere: 'vendor', role: 'delivery_provider' });
      await send(hassan, u, 'When does the parcel arrive?');
      await t.ctx.flush();
      const vendor = (await hassan.get('/v1/policies')).policies.find(
        (p: any) => p.scope.sphere === 'vendor' && !p.scope.role,
      );
      await hassan.patch(`/v1/policies/${vendor.id}`, { settings: { followUpHours: null } });
      t.clock.advance(49 * 3_600_000);
      await runDueJobs(t.ctx);
      expect(await followUps(hassan)).not.toContain('No reply from UPS Desk yet');
      // Made longer after asking: when the new time comes, not before.
      t.clock.set(start);
      await hassan.patch(`/v1/policies/${vendor.id}`, { settings: { followUpHours: 48 } });
      const fedex = await signup(t, { displayName: 'FedEx Desk' });
      const f = await connect(hassan, fedex, { sphere: 'vendor', role: 'delivery_provider' });
      await send(hassan, f, 'Can you confirm the pickup?');
      await t.ctx.flush();
      await hassan.patch(`/v1/policies/${vendor.id}`, { settings: { followUpHours: 96 } });
      t.clock.advance(49 * 3_600_000);
      await runDueJobs(t.ctx);
      expect(await followUps(hassan)).not.toContain('No reply from FedEx Desk yet');
      t.clock.advance(48 * 3_600_000);
      await runDueJobs(t.ctx);
      expect(await followUps(hassan)).toContain('No reply from FedEx Desk yet');
      // Blocked after asking: never "no reply" from someone who can't answer.
      t.clock.set(start);
      await hassan.patch(`/v1/policies/${vendor.id}`, { settings: { followUpHours: 48 } });
      const tnt = await signup(t, { displayName: 'TNT Desk' });
      const b = await connect(hassan, tnt, { sphere: 'vendor', role: 'delivery_provider' });
      await send(hassan, b, 'Is the invoice ready?');
      await t.ctx.flush();
      await hassan.post('/v1/blocks', { userId: tnt.user.id });
      t.clock.advance(49 * 3_600_000);
      await runDueJobs(t.ctx);
      expect(await followUps(hassan)).not.toContain('No reply from TNT Desk yet');
    } finally {
      t.clock.set(start);
    }
  });
});

describe('a rule just for one person (PRD §68)', () => {
  it('holds wherever they write: in a group too, over their relationship’s', async () => {
    const kai = await signup(t, { displayName: 'Kai Group' });
    const lea = await signup(t, { displayName: 'Lea Group' });
    const max = await signup(t, { displayName: 'Max Group' });
    await connect(kai, lea, { sphere: 'family' });
    await connect(kai, max, { sphere: 'family' });
    const conn = (await kai.get('/v1/connections')).connections.find(
      (c: any) => c.person.id === lea.user.id,
    );
    await kai.post('/v1/policies', {
      scope: { connectionId: conn.connectionId },
      settings: { notify: 'mute' },
    });
    const group = async (title: string) =>
      (
        await kai.post('/v1/conversations', {
          kind: 'group',
          title,
          memberIds: [lea.user.id, max.user.id],
        })
      ).conversation.id as string;
    const delivery = async (conversationId: string) =>
      (
        await t.ctx.db
          .selectFrom('notifications')
          .select('delivery')
          .where('user_id', '=', kai.user.id)
          .where('group_key', '=', `conv:${conversationId}`)
          .executeTakeFirstOrThrow()
      ).delivery;
    const muted = await group('Siblings');
    await send(lea, muted, 'Anyone up?');
    await t.ctx.flush();
    expect(await delivery(muted)).toBe('silent');
    // Someone without a rule of their own reaches Kai as family does.
    const other = await group('Cousins');
    await send(max, other, 'Anyone up?');
    await t.ctx.flush();
    expect(await delivery(other)).toBe('push');
  });
});

describe('groups (PRD §14, §56)', () => {
  it('members must be connections; mentions need you, plain questions do not', async () => {
    const lina = await signup(t, { displayName: 'Lina' });
    const omar = await signup(t, { displayName: 'Omar' });
    await connect(sarah, lina);
    const stranger = await sarah.req('POST', '/v1/conversations', {
      kind: 'group',
      title: 'Trip',
      memberIds: [omar.user.id],
    });
    expect(stranger.statusCode).toBe(400);
    const g = (
      await sarah.post('/v1/conversations', {
        kind: 'group',
        title: 'Family Trip',
        memberIds: [hassan.user.id, lina.user.id],
      })
    ).conversation;
    const first = await hassan.get(`/v1/conversations/${g.id}/messages`);
    expect(first.messages[0]).toMatchObject({
      kind: 'system',
      payload: { event: 'group_created', title: 'Family Trip' },
    });
    await hassan.post(`/v1/conversations/${g.id}/receipts`, { read: 100 });
    await lina.post(`/v1/conversations/${g.id}/receipts`, { read: 100 });
    await send(sarah, g.id, 'Who is bringing the tent?');
    expect(sectionOf(await inbox(lina), g.id).section).toBe('recent');
    await send(sarah, g.id, 'Lina, can you book the cabin?', { mentions: [lina.user.id] });
    expect(sectionOf(await inbox(lina), g.id).section).toBe('needs_you');
    expect(sectionOf(await inbox(hassan), g.id).section).toBe('recent');
  });

  it('an edit mentions whoever its words now name, and tells only who it newly names', async () => {
    const kim = await signup(t, { displayName: 'Kim Edit' });
    const lee = await signup(t, { displayName: 'Lee Edit' });
    const outsider = await signup(t, { displayName: 'Out Edit' });
    await connect(sarah, kim);
    await connect(sarah, lee);
    const g = (
      await sarah.post('/v1/conversations', {
        kind: 'group',
        title: 'Carpool',
        memberIds: [kim.user.id, lee.user.id],
      })
    ).conversation.id;
    const m = await send(sarah, g, '@Kim Edit can you drive?', { mentions: [kim.user.id] });
    await t.ctx.flush();
    const mentioned = async (c: Client) =>
      ((await c.get('/v1/notifications')).notifications as any[]).filter(
        (n) => n.kind === 'mention',
      ).length;
    expect(await mentioned(kim)).toBe(1);
    // Only people in it, and never its sender.
    const edited = await sarah.patch(`/v1/messages/${m.id}`, {
      body: '@Lee Edit can you drive?',
      mentions: [lee.user.id, outsider.user.id, sarah.user.id],
    });
    expect(edited.message.mentions).toEqual([lee.user.id]);
    await t.ctx.flush();
    expect(await mentioned(lee)).toBe(1);
    expect(await mentioned(kim)).toBe(1);
    // Edited again naming Lee still, Lee isn't told twice; an edit without them leaves them be.
    await sarah.patch(`/v1/messages/${m.id}`, {
      body: '@Lee Edit can you drive, please?',
      mentions: [lee.user.id],
    });
    await sarah.patch(`/v1/messages/${m.id}`, { body: 'Can anyone drive?' });
    await t.ctx.flush();
    expect(await mentioned(lee)).toBe(1);
    const last = ((await lee.get(`/v1/conversations/${g}/messages`)).messages as any[]).at(-1);
    expect(last).toMatchObject({ body: 'Can anyone drive?', mentions: [lee.user.id] });
  });
});

describe('running a group (PRD §56)', () => {
  let ana: Client; // owner
  let bo: Client; // made an admin
  let cal: Client; // a member
  let dan: Client; // a member
  let g: string;
  const say = async (c: Client, body: string) => (await send(c, g, body)).id as string;
  const roles = async (c: Client) =>
    Object.fromEntries(
      ((await c.get(`/v1/conversations/${g}`)).conversation.participants as any[]).map((p) => [
        p.person.displayName,
        p.role,
      ]),
    );
  const lines = async (c: Client) =>
    ((await c.get(`/v1/conversations/${g}/messages`)).messages as any[])
      .filter((m) => m.kind === 'system')
      .map((m) => m.payload.event);

  beforeAll(async () => {
    ana = await signup(t, { displayName: 'Ana' });
    bo = await signup(t, { displayName: 'Bo' });
    cal = await signup(t, { displayName: 'Cal' });
    dan = await signup(t, { displayName: 'Dan' });
    for (const c of [bo, cal, dan]) await connect(ana, c);
    g = (
      await ana.post('/v1/conversations', {
        kind: 'group',
        title: 'Book club',
        memberIds: [bo.user.id, cal.user.id, dan.user.id],
      })
    ).conversation.id;
  });

  it('its owner makes admins, and only its owner; everyone sees who runs it', async () => {
    expect(await roles(cal)).toEqual({ Ana: 'owner', Bo: 'member', Cal: 'member', Dan: 'member' });
    const asMember = await cal.req('PATCH', `/v1/conversations/${g}/members/${dan.user.id}`, {
      role: 'admin',
    });
    expect(asMember.statusCode).toBe(403);
    await ana.patch(`/v1/conversations/${g}/members/${bo.user.id}`, { role: 'admin' });
    expect((await roles(cal)).Bo).toBe('admin');
    expect(await lines(cal)).toContain('admin_added');
    // An admin makes nobody else one, and nobody makes the owner anything.
    for (const [who, target] of [
      [bo, cal],
      [ana, ana],
    ] as const)
      expect(
        (
          await who.req('PATCH', `/v1/conversations/${g}/members/${target.user.id}`, {
            role: 'admin',
          })
        ).statusCode,
      ).toBe(who === ana ? 404 : 403);
    // Not in a one-to-one.
    const direct = await connect(cal, dan);
    expect(
      (
        await cal.req('PATCH', `/v1/conversations/${direct}/members/${dan.user.id}`, {
          role: 'admin',
        })
      ).statusCode,
    ).toBe(400);
  });

  it('a member reads it and writes in it, and changes nothing about it; an admin does', async () => {
    const theirs = await say(ana, 'We meet on the first Friday.');
    const context = (
      await ana.post('/v1/contexts', {
        kind: 'project',
        title: 'Autumn reading',
        conversationId: g,
      })
    ).id as string;
    const decision = (
      await ana.post('/v1/decisions', { conversationId: g, title: 'Read Middlemarch first' })
    ).id as string;
    const refused = [
      cal.req('POST', `/v1/conversations/${g}/members`, { userIds: [dan.user.id] }),
      cal.req('DELETE', `/v1/conversations/${g}/members/${dan.user.id}`),
      cal.req('PATCH', `/v1/conversations/${g}`, { title: 'Cal’s club' }),
      cal.req('POST', '/v1/contexts', { kind: 'project', title: 'Mine', conversationId: g }),
      cal.req('PATCH', `/v1/contexts/${context}`, { title: 'Winter reading' }),
      cal.req('PATCH', `/v1/decisions/${decision}`, { status: 'reversed' }),
      cal.req('DELETE', `/v1/messages/${theirs}`),
    ];
    for (const r of await Promise.all(refused)) expect(r.statusCode).toBe(403);
    // Nothing changed.
    const now = (await cal.get(`/v1/conversations/${g}`)).conversation;
    expect(now.title).toBe('Book club');
    expect(now.context).toMatchObject({ id: context, title: 'Autumn reading' });
    // An admin does all of it.
    expect(
      (await bo.req('PATCH', `/v1/conversations/${g}`, { title: 'The book club' })).statusCode,
    ).toBe(200);
    expect(
      (await bo.req('PATCH', `/v1/contexts/${context}`, { title: 'Winter reading' })).statusCode,
    ).toBe(200);
    expect(
      (await bo.req('PATCH', `/v1/decisions/${decision}`, { title: 'Read Middlemarch' }))
        .statusCode,
    ).toBe(200);
    expect((await bo.req('DELETE', `/v1/messages/${theirs}`)).statusCode).toBe(200);
    // A decision is also theirs who recorded it.
    const calls = (await cal.post('/v1/decisions', { conversationId: g, title: 'Snacks by rota' }))
      .id as string;
    expect(
      (await cal.req('PATCH', `/v1/decisions/${calls}`, { status: 'reversed' })).statusCode,
    ).toBe(200);
  });

  it('a context is linked only where it can be seen: an id alone opens nothing', async () => {
    const aside = await connect(ana, await signup(t, { displayName: 'Eve' }));
    const secret = (
      await ana.post('/v1/contexts', {
        kind: 'project',
        title: 'Surprise party',
        conversationId: aside,
      })
    ).id as string;
    const mine = await connect(cal, bo);
    expect(
      (await cal.req('PATCH', `/v1/conversations/${mine}`, { contextId: secret })).statusCode,
    ).toBe(404);
    expect((await cal.req('GET', `/v1/contexts/${secret}`)).statusCode).toBe(404);
  });

  it('admins remove members; the owner removes admins; nobody removes the owner', async () => {
    expect(
      (await bo.req('DELETE', `/v1/conversations/${g}/members/${ana.user.id}`)).statusCode,
    ).toBe(403);
    await ana.patch(`/v1/conversations/${g}/members/${cal.user.id}`, { role: 'admin' });
    expect(
      (await bo.req('DELETE', `/v1/conversations/${g}/members/${cal.user.id}`)).statusCode,
    ).toBe(403);
    await ana.patch(`/v1/conversations/${g}/members/${cal.user.id}`, { role: 'member' });
    expect(await lines(cal)).toContain('admin_removed');
    expect(
      (await bo.req('DELETE', `/v1/conversations/${g}/members/${cal.user.id}`)).statusCode,
    ).toBe(200);
    // Someone who isn't in it any more isn't removed again; what their device says late of it is
    // let go, while someone never in it is refused.
    expect(
      (await bo.req('DELETE', `/v1/conversations/${g}/members/${cal.user.id}`)).statusCode,
    ).toBe(404);
    expect(
      (await cal.req('POST', `/v1/conversations/${g}/receipts`, { delivered: 3 })).statusCode,
    ).toBe(200);
    const stranger = await signup(t, { displayName: 'Stranger' });
    expect(
      (await stranger.req('POST', `/v1/conversations/${g}/receipts`, { delivered: 3 })).statusCode,
    ).toBe(404);
    await ana.post(`/v1/conversations/${g}/members`, { userIds: [cal.user.id] });
  });

  it('its owner leaving hands it to the admin there longest; their account going does the same', async () => {
    // Cal has been in it longest, but Bo is its admin: an admin comes first.
    await t.ctx.db
      .updateTable('participants')
      .set({ joined_at: new Date('2020-01-01T00:00:00Z') })
      .where('conversation_id', '=', g)
      .where('user_id', '=', cal.user.id)
      .execute();
    expect((await ana.get('/v1/search?q=Middlemarch')).results.decisions).toHaveLength(1);
    await ana.req('DELETE', `/v1/conversations/${g}/members/${ana.user.id}`);
    expect(await roles(bo)).toEqual({ Bo: 'owner', Cal: 'member', Dan: 'member' });
    expect(await lines(bo)).toContain('owner_changed');
    // Out of it, she finds nothing of it: its decisions included.
    expect((await ana.get('/v1/search?q=Middlemarch')).results.decisions ?? []).toEqual([]);
    // No admin: whoever has been in it longest.
    const kin = (
      await bo.post('/v1/conversations', { kind: 'group', title: 'Kin', memberIds: [ana.user.id] })
    ).conversation.id;
    await bo.post(`/v1/conversations/${kin}/members`, { userIds: [cal.user.id] });
    await t.ctx.db
      .updateTable('participants')
      .set({ joined_at: new Date('2020-01-01T00:00:00Z') })
      .where('conversation_id', '=', kin)
      .where('user_id', '=', cal.user.id)
      .execute();
    const gone = await bo.req('DELETE', '/v1/me', { password: 'correct horse battery' });
    expect(gone.statusCode).toBe(200);
    const kept = (await cal.get(`/v1/conversations/${kin}`)).conversation.participants as any[];
    expect(kept.map((p) => [p.person.displayName, p.role]).sort()).toEqual([
      ['Ana', 'member'],
      ['Cal', 'owner'],
    ]);
    // And Book club, which Bo owned, is Cal's or Dan's now: someone runs it.
    expect(Object.values(await roles(cal))).toContain('owner');
  });
});

describe('a group’s roles hold, whatever happens at once (PRD §56)', () => {
  let ana: Client; // owner
  let bo: Client;
  let cal: Client;
  let dan: Client;
  let g: string;
  let anaBo: string;
  const roles = async (c: Client, id = g) =>
    Object.fromEntries(
      ((await c.get(`/v1/conversations/${id}`)).conversation.participants as any[]).map((p) => [
        p.person.displayName,
        p.role,
      ]),
    );
  const lines = async (c: Client, id = g) =>
    ((await c.get(`/v1/conversations/${id}/messages`)).messages as any[])
      .filter((m) => m.kind === 'system')
      .map((m) => m.payload.event);
  const group = async (owner: Client, title: string, members: Client[]) =>
    (
      await owner.post('/v1/conversations', {
        kind: 'group',
        title,
        memberIds: members.map((m) => m.user.id),
      })
    ).conversation.id as string;

  beforeAll(async () => {
    ana = await signup(t, { displayName: 'Ana Roles' });
    bo = await signup(t, { displayName: 'Bo Roles' });
    cal = await signup(t, { displayName: 'Cal Roles' });
    dan = await signup(t, { displayName: 'Dan Roles' });
    anaBo = await connect(ana, bo);
    for (const c of [cal, dan]) await connect(ana, c);
    await connect(bo, cal);
    g = await group(ana, 'Choir', [bo, cal, dan]);
  });

  it('someone added again starts as a member, from then', async () => {
    await ana.patch(`/v1/conversations/${g}/members/${bo.user.id}`, { role: 'admin' });
    await ana.patch(`/v1/conversations/${g}/members/${cal.user.id}`, { role: 'admin' });
    await ana.req('DELETE', `/v1/conversations/${g}/members/${cal.user.id}`);
    // Out of it, they're nobody in it,
    const seat = () =>
      t.ctx.db
        .selectFrom('participants')
        .select('role')
        .where('conversation_id', '=', g)
        .where('user_id', '=', cal.user.id)
        .executeTakeFirstOrThrow();
    expect((await seat()).role).toBe('member');
    // and even a row left from before that (an admin's) comes back as a member's: an admin who
    // brings back someone the owner took out doesn't make them an admin, which only the owner does.
    await t.ctx.db
      .updateTable('participants')
      .set({ role: 'admin' })
      .where('conversation_id', '=', g)
      .where('user_id', '=', cal.user.id)
      .execute();
    await bo.post(`/v1/conversations/${g}/members`, { userIds: [cal.user.id] });
    expect((await roles(ana))['Cal Roles']).toBe('member');
    // Adding someone already in it changes nothing about them.
    await ana.post(`/v1/conversations/${g}/members`, { userIds: [bo.user.id] });
    expect((await roles(ana))['Bo Roles']).toBe('admin');
    // And from then: in it longest before, they aren't now.
    const kin = await group(ana, 'Kin', [cal, dan]);
    await t.ctx.db
      .updateTable('participants')
      .set({ joined_at: new Date('2020-01-01T00:00:00Z') })
      .where('conversation_id', '=', kin)
      .where('user_id', '=', cal.user.id)
      .execute();
    await ana.req('DELETE', `/v1/conversations/${kin}/members/${cal.user.id}`);
    await ana.post(`/v1/conversations/${kin}/members`, { userIds: [cal.user.id] });
    // Dan has been in it since 2021: longer than Cal, now that Cal's 2020 no longer counts.
    await t.ctx.db
      .updateTable('participants')
      .set({ joined_at: new Date('2021-01-01T00:00:00Z') })
      .where('conversation_id', '=', kin)
      .where('user_id', '=', dan.user.id)
      .execute();
    await ana.req('DELETE', `/v1/conversations/${kin}/members/${ana.user.id}`);
    expect(await roles(dan, kin)).toEqual({ 'Cal Roles': 'member', 'Dan Roles': 'owner' });
  });

  it('two leaves at once, or a leave beside a role change, leave exactly one owner', async () => {
    const twice = await group(ana, 'Twice', [bo, cal, dan]);
    const both = await Promise.all([
      ana.req('DELETE', `/v1/conversations/${twice}/members/${ana.user.id}`),
      ana.req('DELETE', `/v1/conversations/${twice}/members/${ana.user.id}`),
    ]);
    expect(both.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(Object.values(await roles(bo, twice)).filter((r) => r === 'owner')).toHaveLength(1);
    expect((await lines(bo, twice)).filter((e) => e === 'owner_changed')).toHaveLength(1);

    const beside = await group(ana, 'Beside', [bo, cal]);
    const [promoted, left] = await Promise.all([
      ana.req('PATCH', `/v1/conversations/${beside}/members/${bo.user.id}`, { role: 'admin' }),
      ana.req('DELETE', `/v1/conversations/${beside}/members/${ana.user.id}`),
    ]);
    expect(left.statusCode).toBe(200);
    expect([200, 404]).toContain(promoted.statusCode);
    expect(Object.values(await roles(bo, beside)).filter((r) => r === 'owner')).toHaveLength(1);
  });

  it('a member can’t take the group’s context somewhere they’d run it', async () => {
    const x = (await ana.post('/v1/contexts', { kind: 'trip', title: 'Lisbon', conversationId: g }))
      .id as string;
    const theirs = await connect(dan, await signup(t, { displayName: 'Eve Roles' }));
    const linked = await dan.req('PATCH', `/v1/conversations/${theirs}`, { contextId: x });
    expect(linked.statusCode).toBe(403);
    expect((await dan.req('PATCH', `/v1/contexts/${x}`, { title: 'Cancelled' })).statusCode).toBe(
      403,
    );
    // Its maker changes it only while they run a conversation it's in.
    const mine = (
      await bo.post('/v1/contexts', { kind: 'project', title: 'Spring concert', conversationId: g })
    ).id as string;
    await ana.patch(`/v1/conversations/${g}/members/${bo.user.id}`, { role: 'member' });
    expect((await bo.req('PATCH', `/v1/contexts/${mine}`, { title: 'Gone' })).statusCode).toBe(403);
    // Out of the group, it's nothing of theirs.
    await ana.req('DELETE', `/v1/conversations/${g}/members/${bo.user.id}`);
    expect((await bo.req('GET', `/v1/contexts/${mine}`)).statusCode).toBe(404);
    expect(((await bo.get('/v1/contexts')).contexts as any[]).map((c) => c.id)).not.toContain(mine);
    // Linked to their own conversation with Ana too, it shows that one, and not the group.
    await ana.patch(`/v1/conversations/${anaBo}`, { contextId: mine });
    const shown = await bo.get(`/v1/contexts/${mine}`);
    expect((shown.conversations as any[]).map((c) => c.id)).toEqual([anaBo]);
    await ana.post(`/v1/conversations/${g}/members`, { userIds: [bo.user.id] });
  });

  it('what changes about it is said, and those lines stay for everyone', async () => {
    await ana.patch(`/v1/conversations/${g}`, { title: 'The choir', purpose: 'Tuesdays at 7' });
    expect(await lines(dan)).toEqual(expect.arrayContaining(['renamed', 'purpose_changed']));
    const renamed = ((await dan.get(`/v1/conversations/${g}/messages`)).messages as any[]).find(
      (m) => m.payload?.event === 'renamed',
    );
    expect((await ana.req('DELETE', `/v1/messages/${renamed.id}`)).statusCode).toBe(400);
    expect(
      (await dan.req('DELETE', `/v1/messages/${renamed.id}?forEveryone=false`)).statusCode,
    ).toBe(200);
  });

  it('an old suggestion does nothing once they’re out of it', async () => {
    const offer = async () =>
      (
        await t.ctx.db
          .insertInto('suggestions')
          .values({
            id: uuidv4(),
            user_id: dan.user.id,
            kind: 'decision',
            title: 'Ana pays for everyone',
            rationale: 'test',
            confidence: 0.9,
            conversation_id: g,
            fingerprint: `test:${uuidv4()}`,
          })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
    const before = await offer();
    await ana.req('DELETE', `/v1/conversations/${g}/members/${dan.user.id}`);
    // Leaving takes what was offered about it away,
    const was = await t.ctx.db
      .selectFrom('suggestions')
      .select('status')
      .where('id', '=', before)
      .executeTakeFirstOrThrow();
    expect(was.status).toBe('expired');
    // and one that turns up afterwards can't be acted on either.
    const after = await offer();
    expect((await dan.req('POST', `/v1/suggestions/${after}/accept`, {})).statusCode).toBe(404);
    const decided = await ana.get(`/v1/decisions?conversationId=${g}`);
    expect((decided.decisions as any[]).map((d) => d.title)).not.toContain('Ana pays for everyone');
    await ana.post(`/v1/conversations/${g}/members`, { userIds: [dan.user.id] });
  });

  it('a decision is a line in the conversation: not across a block', async () => {
    const theirs = await connect(cal, await signup(t, { displayName: 'Fay Roles' }));
    const fay = (await cal.get(`/v1/conversations/${theirs}`)).conversation.other.userId as string;
    await cal.post('/v1/blocks', { userId: fay });
    const refused = await cal.req('POST', '/v1/decisions', {
      conversationId: theirs,
      title: 'Nothing',
    });
    expect(refused.statusCode).toBe(403);
  });

  it('someone leaving a space hands on the conversations of it they started', async () => {
    const { space } = await ana.post('/v1/spaces', {
      name: 'Choir space',
      kind: 'community',
      memberIds: [cal.user.id],
    });
    const { conversation } = await cal.post(`/v1/spaces/${space.id}/conversations`, {
      title: 'Robes',
    });
    await ana.post(`/v1/spaces/${space.id}/conversations/${conversation.id}/join`, {});
    await cal.req('DELETE', `/v1/spaces/${space.id}/members/${cal.user.id}`);
    expect(await roles(ana, conversation.id)).toEqual({ 'Ana Roles': 'owner' });
    expect(await lines(ana, conversation.id)).toContain('owner_changed');
  });

  it('an account that goes says who runs its groups now', async () => {
    const theirs = await group(bo, 'Bo’s band', [cal]);
    const gone = await bo.req('DELETE', '/v1/me', { password: 'correct horse battery' });
    expect(gone.statusCode).toBe(200);
    expect(await roles(cal, theirs)).toEqual({ 'Cal Roles': 'owner' });
    expect(await lines(cal, theirs)).toContain('owner_changed');
  });

  it('a group left with nobody running it gets someone when the change comes in (0024)', async () => {
    const orphan = await group(ana, 'Orphan', [cal, dan]);
    await t.ctx.db
      .updateTable('participants')
      .set({ role: 'member' })
      .where('conversation_id', '=', orphan)
      .execute();
    await t.ctx.db
      .updateTable('participants')
      .set({ left_at: new Date(), role: 'owner' })
      .where('conversation_id', '=', orphan)
      .where('user_id', '=', ana.user.id)
      .execute();
    const migration = readFileSync(
      new URL('../src/db/migrations/0024_group_owners.sql', import.meta.url),
      'utf8',
    );
    await sql.raw(migration).execute(t.ctx.db);
    expect(await roles(cal, orphan)).toEqual({ 'Cal Roles': 'owner', 'Dan Roles': 'member' });
    const left = await t.ctx.db
      .selectFrom('participants')
      .select('role')
      .where('conversation_id', '=', orphan)
      .where('user_id', '=', ana.user.id)
      .executeTakeFirstOrThrow();
    expect(left.role).toBe('member');
  });
});

describe('pinned messages (PRD §22, §56)', () => {
  let ana: Client; // the group's owner
  let bo: Client;
  let cal: Client;
  let g: string;
  let direct: string;
  const pins = async (c: Client, id: string) =>
    ((await c.get(`/v1/conversations/${id}/pins`)).messages as any[]).map((m) => m.body);
  const pinLines = async (c: Client, id: string) =>
    ((await c.get(`/v1/conversations/${id}/messages`)).messages as any[]).filter(
      (m) => m.kind === 'system' && m.payload.event === 'message_pinned',
    );
  const pin = (c: Client, messageId: string) => c.req('POST', `/v1/messages/${messageId}/pin`);

  beforeAll(async () => {
    ana = await signup(t, { displayName: 'Ana Pins' });
    bo = await signup(t, { displayName: 'Bo Pins' });
    cal = await signup(t, { displayName: 'Cal Pins' });
    direct = await connect(ana, bo);
    await connect(ana, cal);
    g = (
      await ana.post('/v1/conversations', {
        kind: 'group',
        title: 'Orchestra',
        memberIds: [bo.user.id, cal.user.id],
      })
    ).conversation.id;
  });

  it('either person pins in a one-to-one; both see it at the top, and a line says who', async () => {
    const m = await send(bo, direct, 'The gate code is on the back door');
    expect((await pin(ana, m.id)).statusCode).toBe(200);
    expect(await pins(bo, direct)).toEqual(['The gate code is on the back door']);
    const listed = ((await bo.get(`/v1/conversations/${direct}/messages`)).messages as any[]).find(
      (x) => x.id === m.id,
    );
    expect(listed.pinnedAt).not.toBeNull();
    // Pinned again, nothing more is said.
    expect((await pin(bo, m.id)).statusCode).toBe(200);
    expect(await pinLines(bo, direct)).toHaveLength(1);
    // Either of them takes it down.
    expect((await bo.req('DELETE', `/v1/messages/${m.id}/pin`)).statusCode).toBe(200);
    expect(await pins(ana, direct)).toEqual([]);
  });

  it('in a group its owner and admins pin, five at most; deleted, a message goes from the top', async () => {
    const first = await send(cal, g, 'Bring your music stands');
    expect((await pin(cal, first.id)).statusCode).toBe(403);
    await ana.patch(`/v1/conversations/${g}/members/${bo.user.id}`, { role: 'admin' });
    expect((await pin(bo, first.id)).statusCode).toBe(200);
    // A line about the group isn't one to pin.
    const line = ((await ana.get(`/v1/conversations/${g}/messages`)).messages as any[]).find(
      (m) => m.kind === 'system',
    );
    expect((await pin(ana, line.id)).statusCode).toBe(400);
    for (const text of ['Tuesday at 7', 'Tickets from Friday', 'Dress code: black', 'Bus at 5'])
      expect((await pin(ana, (await send(ana, g, text)).id)).statusCode).toBe(200);
    const sixth = await pin(ana, (await send(ana, g, 'One too many')).id);
    expect(sixth.statusCode).toBe(400);
    expect(sixth.json().error.message).toBe('5 messages are pinned already. Unpin one first.');
    expect(await pins(cal, g)).toHaveLength(5);
    // Deleted for themselves, it's out of their own view of the top only.
    await cal.req('DELETE', `/v1/messages/${first.id}?forEveryone=false`);
    expect(await pins(cal, g)).not.toContain('Bring your music stands');
    expect(await pins(ana, g)).toContain('Bring your music stands');
    // Deleted for everyone, it's pinned for nobody.
    await ana.req('DELETE', `/v1/messages/${first.id}`);
    expect(await pins(ana, g)).not.toContain('Bring your music stands');
    expect(await pins(ana, g)).toHaveLength(4);
    // Nobody outside it sees what's pinned.
    const stranger = await signup(t, { displayName: 'Stranger Pins' });
    expect((await stranger.req('GET', `/v1/conversations/${g}/pins`)).statusCode).toBe(404);
    expect((await stranger.req('DELETE', `/v1/messages/${first.id}/pin`)).statusCode).toBe(404);
  });

  it('a message that disappears takes its pin, and its link from what the conversation keeps', async () => {
    const was = t.clock.now.toISOString();
    await ana.patch(`/v1/conversations/${direct}`, { retentionDays: 1 });
    const m = await send(bo, direct, 'The plan is at https://venue.example/plan');
    await pin(ana, m.id);
    // Saved, too (PRD §69): what's kept of it goes with it.
    await ana.post(`/v1/messages/${m.id}/save`, { collection: 'Venue' });
    const saved = async () =>
      ((await ana.get('/v1/saved/items')).items as any[]).map((i) => i.message.id);
    expect(await saved()).toContain(m.id);
    const links = async () =>
      (await ana.get(`/v1/conversations/${direct}/assets?kind=link`)).assets as any[];
    expect((await links()).map((a) => a.messageId)).toContain(m.id);
    t.clock.advance(2 * 86_400_000);
    const heard: BusMessage[] = [];
    const stop = t.ctx.bus.subscribe((msg) => heard.push(msg));
    try {
      await runPeriodic(t.ctx);
      // Whoever saved it sees their lists without it, on every device.
      const told = () =>
        heard.some(
          (msg) => msg.event.type === 'saved.changed' && msg.userIds.includes(ana.user.id),
        );
      for (let i = 0; i < 300 && !told(); i++) await new Promise((r) => setTimeout(r, 10));
      expect(told()).toBe(true);
      expect(await pins(ana, direct)).toEqual([]);
      expect((await links()).map((a) => a.messageId)).not.toContain(m.id);
      expect(await saved()).not.toContain(m.id);
      const kept = await t.ctx.db
        .selectFrom('saved_items')
        .select('id')
        .where('message_id', '=', m.id)
        .execute();
      expect(kept).toEqual([]);
      const memory = await ana.get(`/v1/conversations/${direct}/memory`);
      expect(JSON.stringify(memory.links)).not.toContain('venue.example');
    } finally {
      stop();
      t.clock.set(was);
      await ana.patch(`/v1/conversations/${direct}`, { retentionDays: null });
    }
  });

  it('not while a message request is unanswered: it allows one message and nothing more', async () => {
    const zed = await signup(t, { displayName: 'Zed Pins' });
    const request = (await zed.post('/v1/conversations', { kind: 'direct', userId: ana.user.id }))
      .conversation.id;
    const hello = await send(zed, request, 'Hi Ana, about the concert');
    for (const who of [zed, ana]) {
      const r = await pin(who, hello.id);
      expect(r.statusCode).toBe(403);
      expect(r.json().error.code).toBe('awaiting_acceptance');
    }
    expect(await pinLines(ana, request)).toEqual([]);
    // Answered, either of them pins.
    await send(ana, request, 'Hi Zed!');
    expect((await pin(zed, hello.id)).statusCode).toBe(200);
    expect(await pins(ana, request)).toEqual(['Hi Ana, about the concert']);
  });

  it('one deleted for yourself leaves your own top at once, and still counts toward the five', async () => {
    const heard: BusMessage[] = [];
    const stop = t.ctx.bus.subscribe((m) => heard.push(m));
    try {
      const top = (await bo.get(`/v1/conversations/${g}/pins`)).messages as any[];
      expect(top).toHaveLength(4);
      const bus = top.find((m) => m.body === 'Bus at 5');
      await bo.req('DELETE', `/v1/messages/${bus.id}?forEveryone=false`);
      const told = () =>
        heard.some(
          (m) =>
            m.event.type === 'pins.changed' &&
            m.userIds.includes(bo.user.id) &&
            (m.event.data as { conversationId?: string }).conversationId === g,
        );
      for (let i = 0; i < 300 && !told(); i++) await new Promise((r) => setTimeout(r, 10));
      expect(told()).toBe(true);
      expect(await pins(bo, g)).toHaveLength(3);
      expect(await pins(ana, g)).toHaveLength(4);
      expect((await pin(ana, (await send(ana, g, 'Encore: Bolero')).id)).statusCode).toBe(200);
      const his = await pin(bo, (await send(bo, g, 'Parking at the back')).id);
      expect(his.statusCode).toBe(400);
      expect(his.json().error.message).toBe(
        '5 messages are pinned already, including one you deleted for yourself. Unpin one first.',
      );
      const hers = await pin(ana, (await send(ana, g, 'Programme notes')).id);
      expect(hers.json().error.message).toBe('5 messages are pinned already. Unpin one first.');
    } finally {
      stop();
    }
  });
});

describe('forwarding (PRD §22)', () => {
  let ana: Client;
  let bo: Client;
  let cal: Client;
  let ab: string;
  let ac: string;
  let g: string;
  const last = async (c: Client, id: string) =>
    ((await c.get(`/v1/conversations/${id}/messages`)).messages as any[]).at(-1);
  const forward = (c: Client, messageId: string, conversationIds: string[]) =>
    c.req('POST', `/v1/messages/${messageId}/forward`, { conversationIds, clientId: uuidv4() });

  beforeAll(async () => {
    ana = await signup(t, { displayName: 'Ana Forward' });
    bo = await signup(t, { displayName: 'Bo Forward' });
    cal = await signup(t, { displayName: 'Cal Forward' });
    ab = await connect(ana, bo);
    ac = await connect(ana, cal);
    g = (
      await ana.post('/v1/conversations', {
        kind: 'group',
        title: 'Forwarded to',
        memberIds: [bo.user.id, cal.user.id],
      })
    ).conversation.id;
  });

  it('goes to each conversation once, marked as forwarded', async () => {
    const m = await send(bo, ab, 'The venue is booked');
    const r = await forward(ana, m.id, [ac, g, ac]);
    expect(r.statusCode).toBe(200);
    expect(r.json().messageIds).toHaveLength(2);
    expect(await last(cal, ac)).toMatchObject({ body: 'The venue is booked', forwarded: true });
    expect(await last(bo, g)).toMatchObject({ body: 'The venue is booked', forwarded: true });
  });

  it('cards, polls, live locations and lines about a conversation stay where they were', async () => {
    const poll = (
      await ana.post(`/v1/conversations/${ab}/messages`, {
        clientId: uuidv4(),
        kind: 'poll',
        payload: {
          question: 'Friday or Saturday?',
          options: [
            { id: 'a', text: 'Friday' },
            { id: 'b', text: 'Saturday' },
          ],
        },
      })
    ).message;
    const line = ((await ana.get(`/v1/conversations/${g}/messages`)).messages as any[]).find(
      (m) => m.kind === 'system',
    );
    for (const id of [poll.id, line.id]) {
      const r = await forward(ana, id, [ac]);
      expect(r.statusCode).toBe(400);
      expect(r.json().error.message).toBe(
        'Cards, polls and live locations stay where they were shared.',
      );
    }
  });

  it('goes to all of them or to none', async () => {
    await cal.post('/v1/blocks', { userId: ana.user.id });
    const m = await send(ana, g, 'Rehearsal moved to Monday');
    const before = await last(bo, ab);
    const r = await forward(ana, m.id, [ab, ac]);
    expect(r.statusCode).toBe(403);
    // Bo's conversation with Ana got nothing either, though it came first.
    expect((await last(bo, ab)).id).toBe(before.id);
  });

  it('a message request that has had its one message stops all of it, as sending there would', async () => {
    const dee = await signup(t, { displayName: 'Dee Forward' });
    const request = (await ana.post('/v1/conversations', { kind: 'direct', userId: dee.user.id }))
      .conversation.id;
    await send(ana, request, 'Hi Dee, we met at the fair');
    const m = await send(bo, g, 'Tickets are on sale');
    const before = await last(bo, ab);
    const r = await forward(ana, m.id, [ab, request]);
    expect(r.statusCode).toBe(403);
    expect(r.json().error.code).toBe('awaiting_acceptance');
    expect((await last(bo, ab)).id).toBe(before.id);
    // Answered, it goes to both; sent again, in any order and with one more, each gets it once.
    await send(dee, request, 'Hi Ana!');
    const clientId = uuidv4();
    const again = (conversationIds: string[]) =>
      ana.req('POST', `/v1/messages/${m.id}/forward`, { conversationIds, clientId });
    const first = await again([ab]);
    expect(first.statusCode).toBe(200);
    const both = await again([request, ab]);
    expect(both.statusCode).toBe(200);
    expect(both.json().messageIds).toHaveLength(2);
    expect(both.json().messageIds[1]).toBe(first.json().messageIds[0]);
    expect(await last(dee, request)).toMatchObject({
      body: 'Tickets are on sale',
      forwarded: true,
    });
  });
});

describe('message features', () => {
  it('reactions, replies, edits, deletes and delete-for-me', async () => {
    const m = await send(sarah, convo, 'Original');
    await hassan.post(`/v1/messages/${m.id}/reactions`, { emoji: '👍' });
    const reply = await send(hassan, convo, 'Replying', { replyToId: m.id });
    expect(reply.replyTo).toMatchObject({ id: m.id, preview: 'Original' });
    const edited = await sarah.patch(`/v1/messages/${m.id}`, { body: 'Edited' });
    expect(edited.message).toMatchObject({
      body: 'Edited',
      reactions: [{ emoji: '👍', count: 1, mine: false }],
    });
    expect(edited.message.editedAt).not.toBeNull();
    expect((await hassan.req('PATCH', `/v1/messages/${m.id}`, { body: 'hijack' })).statusCode).toBe(
      403,
    );
    await hassan.del(`/v1/messages/${reply.id}?forEveryone=false`);
    const mine = await hassan.get(`/v1/conversations/${convo}/messages?limit=5`);
    expect(mine.messages.map((x: any) => x.id)).not.toContain(reply.id);
    const hers = await sarah.get(`/v1/conversations/${convo}/messages?limit=5`);
    expect(hers.messages.map((x: any) => x.id)).toContain(reply.id);
    await sarah.del(`/v1/messages/${m.id}`);
    const gone = (await hassan.get(`/v1/conversations/${convo}/messages?limit=10`)).messages.find(
      (x: any) => x.id === m.id,
    );
    expect(gone).toMatchObject({ body: null, deletedAt: expect.any(String) });
  });

  it('polls count votes; links land in the asset index with a safety check', async () => {
    const poll = await hassan.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'poll',
      payload: {
        question: 'Lunch?',
        options: [
          { id: 'a', text: 'Pizza' },
          { id: 'b', text: 'Sushi' },
        ],
        multiple: false,
      },
    });
    const voted = await sarah.post(`/v1/messages/${poll.message.id}/vote`, { optionIds: ['b'] });
    expect(voted.message.poll).toEqual({ counts: { b: 1 }, mine: ['b'], voters: 1 });
    const link = await send(
      sarah,
      convo,
      'Docs: https://docs.example.com/plan and a sketchy one http://192.168.0.9/login',
    );
    expect(link.entities.links).toEqual([
      expect.objectContaining({ host: 'docs.example.com', suspicious: false }),
      expect.objectContaining({ host: '192.168.0.9', suspicious: true }),
    ]);
    const assets = await hassan.get(`/v1/conversations/${convo}/assets?kind=link`);
    expect(assets.counts.link).toBeGreaterThanOrEqual(2);
    expect(assets.assets[0]).toMatchObject({ kind: 'link' });
  });

  it('what was shared leaves out a message someone deleted for themselves (PRD §24, §26)', async () => {
    const link = await send(
      sarah,
      convo,
      'Minutes: https://minutes.example.org/q3, review next Tuesday at 10am',
    );
    const seen = async (c: Client) => {
      const r = await c.get(`/v1/conversations/${convo}/assets?kind=link`);
      const memory = await c.get(`/v1/conversations/${convo}/memory`);
      return {
        hosts: r.assets.map((a: any) => a.host),
        links: (r.counts.link ?? 0) as number,
        remembered: memory.links.map((l: any) => l.host),
        dates: memory.dates.map((d: any) => d.messageId),
      };
    };
    const before = await seen(hassan);
    expect(before.hosts).toContain('minutes.example.org');
    expect(before.remembered).toContain('minutes.example.org');
    expect(before.dates).toContain(link.id);
    await hassan.del(`/v1/messages/${link.id}?forEveryone=false`);
    const after = await seen(hassan);
    expect(after.hosts).not.toContain('minutes.example.org');
    expect(after.links).toBe(before.links - 1);
    expect(after.remembered).not.toContain('minutes.example.org');
    expect(after.dates).not.toContain(link.id);
    // Still Sarah's to see.
    const hers = await seen(sarah);
    expect(hers.hosts).toContain('minutes.example.org');
    expect(hers.links).toBe(before.links);
    expect(hers.remembered).toContain('minutes.example.org');
    expect(hers.dates).toContain(link.id);
  });

  it('what was shared comes a page at a time, newest first, of one kind or several', async () => {
    const sent = [];
    for (const n of [1, 2, 3])
      sent.push(await send(hassan, convo, `Draft ${n}: https://drafts${n}.example.net/`));
    const url = `/v1/conversations/${convo}/assets?kind=link&limit=2`;
    const first = await sarah.get(url);
    expect(first.assets.map((a: any) => a.host)).toEqual([
      'drafts3.example.net',
      'drafts2.example.net',
    ]);
    // Each says where its message is, to go to it.
    expect(first.assets[0]).toMatchObject({ messageId: sent[2].id, messageSeq: sent[2].seq });
    expect(first.nextBefore).toBe(first.assets[1].id);
    const next = await sarah.get(`${url}&before=${first.nextBefore}`);
    expect(next.assets[0].host).toBe('drafts1.example.net');
    const all = await sarah.get(`/v1/conversations/${convo}/assets?kind=link&limit=200`);
    expect(all.nextBefore).toBeNull();
    expect(all.assets).toHaveLength(all.counts.link);
    // Several kinds at once, and nothing that isn't one.
    const mixed = await sarah.get(`/v1/conversations/${convo}/assets?kind=link,photo&limit=200`);
    expect(mixed.assets).toHaveLength(all.assets.length);
    const wrong = await sarah.req('GET', `/v1/conversations/${convo}/assets?kind=link,secret`);
    expect(wrong.statusCode).toBe(400);
  });
});

describe('realtime', () => {
  async function socketFor(address: string, token: string) {
    const ws = new WebSocket(`${address.replace('http', 'ws')}/v1/realtime`);
    const frames: any[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
      ws.on('message', (raw) => {
        const f = JSON.parse(String(raw));
        frames.push(f);
        if (f.type === 'hello') resolve();
      });
      ws.on('error', reject);
    });
    const waitFor = async (pred: (event: any) => boolean) => {
      const deadline = Date.now() + 3000;
      const find = () => frames.find((f) => f.type === 'event' && pred(f.event));
      while (!find() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
      return find()?.event.data;
    };
    const created = (id: string) =>
      waitFor((e) => e.type === 'message.created' && e.data.id === id);
    return { ws, created, waitFor };
  }

  it('delivers a new message to both sides; only the sender’s echo carries its clientId', async () => {
    const address = await t.app.listen({ port: 0, host: '127.0.0.1' });
    const theirs = await socketFor(address, sarah.token);
    const mine = await socketFor(address, hassan.token);
    const clientId = uuidv4();
    const sent = await hassan.post(`/v1/conversations/${convo}/messages`, {
      clientId,
      body: 'Live?',
    });
    const received = await theirs.created(sent.message.id);
    expect(received).toMatchObject({ body: 'Live?', clientId: null });
    const echo = await mine.created(sent.message.id);
    expect(echo).toMatchObject({ body: 'Live?', clientId });
    theirs.ws.close();
    mine.ws.close();
  });

  it('sends a read position live only to people allowed to see it (reciprocal, R25)', async () => {
    const address = t.app.server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}`;
    const watcher = await socketFor(base, hassan.token);
    await sarah.req('PUT', '/v1/me/privacy', { fields: { readReceipts: { kind: 'nobody' } } });
    const m = await send(hassan, convo, 'Did you read this?');
    await sarah.post(`/v1/conversations/${convo}/receipts`, { read: m.seq });
    const receipt = await watcher.waitFor(
      (e) =>
        e.type === 'receipts' && e.data.userId === sarah.user.id && e.data.deliveredSeq === m.seq,
    );
    expect(receipt).toMatchObject({ readSeq: null, deliveredSeq: m.seq });
    const view = await hassan.get(`/v1/conversations/${convo}`);
    const theirs = view.conversation.participants.find((p: any) => p.userId === sarah.user.id);
    expect(theirs.readSeq).toBeNull();
    await sarah.req('PUT', '/v1/me/privacy', { fields: { readReceipts: { kind: 'everyone' } } });
    watcher.ws.close();
  });

  it('accepts a cookie session only from the app’s own origin', async () => {
    const address = t.app.server.address() as { port: number };
    const login = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { identifier: sarah.user.handle, password: 'correct horse battery', client: 'web' },
    });
    const cookie = login.cookies.find((c) => c.name === 'caime_session')!.value;
    const connect = (origin: string) =>
      new Promise<number | 'hello'>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${address.port}/v1/realtime`, {
          headers: { cookie: `caime_session=${cookie}`, origin },
        });
        ws.on('message', (raw) => {
          if (JSON.parse(String(raw)).type === 'hello') {
            resolve('hello');
            ws.close();
          }
        });
        ws.on('close', (code) => resolve(code));
      });
    expect(await connect('https://evil.example')).toBe(4403);
    expect(await connect(new URL(t.ctx.config.PUBLIC_URL).origin)).toBe('hello');
  });

  it('refuses a socket without a valid session', async () => {
    const address = t.app.server.address() as { port: number };
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/v1/realtime`);
    const code = await new Promise<number>((resolve) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: 'csy_nope' })));
      ws.on('close', (c) => resolve(c));
    });
    expect(code).toBe(4401);
  });
});
