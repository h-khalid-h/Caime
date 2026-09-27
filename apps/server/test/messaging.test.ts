import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
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
    await ana.req('DELETE', `/v1/conversations/${g}/members/${ana.user.id}`);
    expect(await roles(bo)).toEqual({ Bo: 'owner', Cal: 'member', Dan: 'member' });
    expect(await lines(bo)).toContain('owner_changed');
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
    const cookie = login.cookies.find((c) => c.name === 'caishy_session')!.value;
    const connect = (origin: string) =>
      new Promise<number | 'hello'>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${address.port}/v1/realtime`, {
          headers: { cookie: `caishy_session=${cookie}`, origin },
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
