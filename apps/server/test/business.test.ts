import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owner
let sara: Client; // admin
let omar: Client; // team
let hana: Client; // joins the team later
let lina: Client; // customer
let rana: Client; // another person
let teen: Client;
let orgId: string;
let convo: string;
const heard: BusMessage[] = [];

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
}
const send = (c: Client, body: string, extra = {}) =>
  c.post(`/v1/conversations/${convo}/messages`, { clientId: uuidv4(), body, ...extra });
const thread = async (c: Client) => (await c.get(`/v1/conversations/${convo}`)).conversation;
const inbox = (c: Client, view: string) => c.get(`/v1/orgs/${orgId}/inbox?view=${view}`);
/** Notifications are written after the response (ctx.defer): wait for them first. */
const alerts = async (c: Client) => {
  await t.ctx.flush();
  return (await c.get('/v1/notifications')).notifications;
};
/** Only what's about the business conversation: Lina knows Omar, so other alerts may name him. */
const aboutIt = async (c: Client) =>
  (await alerts(c)).filter((n: any) => n.data?.conversationId === convo);
/** Everything the customer was sent about the team, as one string to search. */
const teamNamed = (s: string) =>
  [omar, sara, noor, hana].some((p) => s.includes(p.user.id) || s.includes(p.user.displayName));
async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
  if (!check()) throw new Error(`never happened: ${what}`);
}

beforeAll(async () => {
  t = await createTestApp();
  t.ctx.bus.subscribe((m) => heard.push(m));
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sara = await signup(t, { displayName: 'Sara Ali' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  hana = await signup(t, { displayName: 'Hana Said' });
  lina = await signup(t, { displayName: 'Lina Customer' });
  rana = await signup(t, { displayName: 'Rana Other' });
  teen = await signup(t, { displayName: 'Rami Young', birthYear: 2011 });
  for (const p of [sara, omar, hana]) await connect(noor, p);
  // Lina happens to know Omar: even so, she must not learn he's the one answering.
  await connect(lina, omar);
  orgId = (await noor.post('/v1/orgs', { name: 'DATA C', handle: 'datac.biz', kind: 'business' }))
    .org.id;
  // On Business, so its team can grow past three: plans have their own tests (plans.test.ts).
  await t.ctx.db
    .updateTable('organizations')
    .set({ plan: 'business' })
    .where('id', '=', orgId)
    .execute();
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [sara.user.id], role: 'admin' });
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
});
afterAll(async () => {
  await t.close();
});

describe('the business inbox (PRD §37–38, R15)', () => {
  it('a customer starts one conversation with an organization, and only adults outside it can', async () => {
    const first = await lina.req('POST', `/v1/orgs/${orgId}/conversations`);
    expect(first.statusCode).toBe(201);
    convo = first.json().conversationId;
    expect((await lina.post(`/v1/orgs/${orgId}/conversations`)).conversationId).toBe(convo);
    expect((await teen.req('POST', `/v1/orgs/${orgId}/conversations`)).statusCode).toBe(403);
    expect((await omar.req('POST', `/v1/orgs/${orgId}/conversations`)).statusCode).toBe(400);

    // The customer talks to the organization; the team sees the customer, and each other.
    const hers = await thread(lina);
    expect(hers).toMatchObject({ kind: 'business', title: 'DATA C', other: null });
    expect(hers.participants.map((p: any) => p.userId)).toEqual([lina.user.id]);
    expect(hers.business).toMatchObject({ org: { name: 'DATA C' }, thread: null });
    const theirs = await thread(sara);
    expect(theirs.title).toBe('Lina Customer');
    expect(theirs.business.thread).toMatchObject({ state: 'new', assignee: null });
    expect(theirs.participants.map((p: any) => [p.person.displayName, p.role]).sort()).toEqual([
      ['Lina Customer', 'member'],
      ['Noor Haddad', 'agent'],
      ['Omar Farouk', 'agent'],
      ['Sara Ali', 'agent'],
    ]);
    // Nobody has written yet: nothing in the inbox.
    expect((await inbox(sara, 'new')).threads).toEqual([]);
  });

  it('a new conversation reaches the whole team, and never their own chats', async () => {
    await send(lina, 'Hi, my order #1234 hasn’t arrived. Can you check?');
    const { threads, counts } = await inbox(sara, 'new');
    expect(threads.map((x: any) => [x.customer.displayName, x.state])).toEqual([
      ['Lina Customer', 'new'],
    ]);
    expect(threads[0].waitingSince).not.toBeNull();
    expect(counts).toMatchObject({ new: 1, customer_waiting: 1, mine: 0, resolved: 0 });
    expect((await sara.get('/v1/business/summary')).orgs).toEqual([
      expect.objectContaining({ waiting: 1, unassigned: 1, mine: 0 }),
    ]);
    for (const p of [noor, sara, omar]) {
      const all = (await p.get('/v1/inbox?view=all')).conversations;
      expect(all.map((c: any) => c.id)).not.toContain(convo);
      expect((await alerts(p)).map((n: any) => n.title)).toContain('Lina Customer · DATA C');
    }
    // For the customer it's a conversation with DATA C, in her own inbox.
    const mine = (await lina.get('/v1/inbox?view=all')).conversations;
    expect(mine.find((c: any) => c.id === convo)).toMatchObject({
      title: 'DATA C',
      org: { name: 'DATA C', verified: false },
    });
  });

  it('the team answers as the organization: the customer never sees who', async () => {
    const reply = await send(omar, 'Sorry about that! Checking with the courier now.');
    expect(reply.message.senderId).toBe(omar.user.id);
    // Whoever answers an unassigned conversation has it.
    expect((await thread(sara)).business.thread).toMatchObject({
      state: 'waiting',
      assignee: { userId: omar.user.id, displayName: 'Omar Farouk' },
    });
    // For the rest of the team, what's unread is what the customer wrote, not Omar's answer.
    expect((await inbox(noor, 'waiting')).threads[0].unreadCount).toBe(1);
    const { messages } = await lina.get(`/v1/conversations/${convo}/messages`);
    expect(messages.map((m: any) => m.senderId)).toEqual([lina.user.id, orgId]);
    expect(teamNamed(JSON.stringify(messages))).toBe(false);
    expect(teamNamed(JSON.stringify(await thread(lina)))).toBe(false);
    const item = (await lina.get('/v1/inbox?view=all')).conversations.find(
      (c: any) => c.id === convo,
    );
    expect(item.lastMessage).toMatchObject({ senderId: orgId, mine: false });
    expect(teamNamed(JSON.stringify(item))).toBe(false);
    expect((await aboutIt(lina)).map((n: any) => n.title)).toContain('DATA C');
    expect(teamNamed(JSON.stringify(await aboutIt(lina)))).toBe(false);

    // Live, the team hears Omar; Lina hears DATA C.
    await until(
      () =>
        heard.some(
          (m) =>
            m.event.type === 'message.created' &&
            m.userIds.includes(lina.user.id) &&
            (m.event.data as any).body?.startsWith('Sorry about that'),
        ),
      'the reply reaching Lina',
    );
    const about = (m: BusMessage) => (m.event.data as any)?.conversationId === convo;
    const toLina = heard.filter((m) => m.userIds.includes(lina.user.id) && about(m));
    const toTeam = heard.find(
      (m) =>
        m.event.type === 'message.created' &&
        m.userIds.includes(sara.user.id) &&
        (m.event.data as any).body?.startsWith('Sorry about that'),
    );
    expect(toLina.every((m) => m.userIds.length === 1)).toBe(true);
    expect(teamNamed(JSON.stringify(toLina))).toBe(false);
    expect(toTeam).toBeDefined();
    expect((toTeam!.event.data as any).senderId).toBe(omar.user.id);

    // Typing and reading reach her as the organization, too.
    heard.length = 0;
    await sara.post(`/v1/conversations/${convo}/typing`);
    await sara.post(`/v1/conversations/${convo}/receipts`, { read: 2 });
    await until(
      () => heard.some((m) => m.event.type === 'receipts' && m.userIds.includes(lina.user.id)),
      'the read reaching Lina',
    );
    const live = heard.filter((m) => m.userIds.includes(lina.user.id) && about(m));
    expect(live.map((m) => m.event.type)).toEqual(expect.arrayContaining(['typing', 'receipts']));
    expect(teamNamed(JSON.stringify(live))).toBe(false);
    expect((await thread(lina)).business.readSeq).toBe(2);
  });

  it('search, memory, shared links and cards name the organization, not the person', async () => {
    await send(omar, 'Tracking is at https://courier.example/track/1234');
    const found = await lina.get('/v1/search?q=courier');
    expect(found.results.messages.length).toBeGreaterThan(0);
    expect(found.results.messages[0]).toMatchObject({ senderName: 'DATA C', senderId: orgId });
    // "From Omar", whom she knows, finds nothing there.
    const fromOmar = await lina.get(`/v1/search?q=${encodeURIComponent('from:@omar')}`);
    expect(teamNamed(JSON.stringify(fromOmar.results.messages ?? []))).toBe(false);
    expect(teamNamed(JSON.stringify(found))).toBe(false);
    const memory = await lina.get(`/v1/conversations/${convo}/memory`);
    expect(memory.peopleLine).toBe('DATA C');
    expect(teamNamed(JSON.stringify(memory))).toBe(false);
    const assets = await lina.get(`/v1/conversations/${convo}/assets?kind=link`);
    expect(assets.assets[0].senderId).toBe(orgId);

    // A support ticket: Lina opens it, the team starts it, and she hears DATA C did.
    const ticket = (
      await lina.post(`/v1/conversations/${convo}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: { kit: 'support_ticket', fields: { title: 'Order #1234 missing' } },
      })
    ).message;
    const started = await sara.req('POST', `/v1/messages/${ticket.id}/kit`, { to: 'in_progress' });
    expect(started.statusCode).toBe(200);
    const { messages } = await lina.get(`/v1/conversations/${convo}/messages`);
    const card = messages.find((m: any) => m.id === ticket.id);
    expect(card.payload.history).toEqual([expect.objectContaining({ by: orgId })]);
    expect((await aboutIt(lina)).map((n: any) => n.title)).toContain('DATA C: In progress');
    expect(teamNamed(JSON.stringify(await aboutIt(lina)))).toBe(false);

    // Only the cards a customer relationship offers: a family checklist isn't one of them.
    const list = await omar.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit: 'checklist', fields: { title: 'Groceries', items: ['Milk'] } },
    });
    expect(list.statusCode).toBe(400);
    expect(list.json().error.message).toBe(
      'Checklist cards aren’t for conversations with an organization.',
    );
  });

  it('once it has someone, only they hear the customer; they can hand it on', async () => {
    const before = (await alerts(noor)).length;
    await send(lina, 'Any news?');
    expect((await thread(sara)).business.thread.state).toBe('customer_waiting');
    expect((await alerts(noor)).length).toBe(before);
    expect((await omar.get('/v1/business/summary')).orgs[0]).toMatchObject({
      waiting: 1,
      mine: 1,
    });

    const handed = await noor.post(`/v1/business/${convo}/assign`, { userId: sara.user.id });
    expect(handed.thread.assignee).toEqual({ userId: sara.user.id, displayName: 'Sara Ali' });
    expect((await alerts(sara)).map((n: any) => n.title)).toContain(
      'Noor Haddad gave you a conversation',
    );
    const outsider = await noor.req('POST', `/v1/business/${convo}/assign`, {
      userId: lina.user.id,
    });
    expect(outsider.statusCode).toBe(400);
    expect((await inbox(sara, 'mine')).threads.map((x: any) => x.conversationId)).toEqual([convo]);
  });

  it('escalating asks the owner and admins; resolving closes it until the customer writes', async () => {
    const escalated = await omar.post(`/v1/business/${convo}/escalate`, {
      note: 'Refund over my limit',
    });
    expect(escalated.thread).toMatchObject({
      state: 'escalated',
      escalated: { byName: 'Omar Farouk', note: 'Refund over my limit' },
    });
    for (const manager of [noor, sara])
      expect((await alerts(manager)).map((n: any) => n.title)).toContain(
        'Omar Farouk escalated a conversation',
      );
    expect((await inbox(noor, 'escalated')).counts.escalated).toBe(1);

    const resolved = await sara.post(`/v1/business/${convo}/resolve`);
    expect(resolved.thread).toMatchObject({ state: 'resolved', escalated: null });
    expect((await inbox(sara, 'resolved')).threads).toHaveLength(1);
    expect((await inbox(sara, 'customer_waiting')).threads).toHaveLength(0);
    // The customer never learns how the team works it: no line about any of it.
    const { messages } = await lina.get(`/v1/conversations/${convo}/messages`);
    expect(messages.filter((m: any) => m.kind === 'system')).toEqual([]);

    await send(lina, 'One more thing: can I change the address?');
    expect((await thread(sara)).business.thread).toMatchObject({
      state: 'customer_waiting',
      resolvedAt: null,
    });
  });

  it('the team is the organization’s: joining brings its conversations, leaving takes them away', async () => {
    const readBefore = (await thread(lina)).business.readSeq;
    await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [hana.user.id] });
    const hers = await inbox(hana, 'customer_waiting');
    expect(hers.threads.map((x: any) => [x.conversationId, x.unreadCount])).toEqual([[convo, 0]]);
    // Arriving caught up isn't reading it: the customer's "read" stays where it was.
    expect((await thread(lina)).business.readSeq).toBe(readBefore);

    await noor.post(`/v1/business/${convo}/assign`, { userId: omar.user.id });
    await noor.req('DELETE', `/v1/orgs/${orgId}/members/${omar.user.id}`);
    expect((await omar.req('GET', `/v1/conversations/${convo}`)).statusCode).toBe(404);
    expect((await thread(sara)).business.thread.assignee).toBeNull();
    // Only the team: others can't see it or work it.
    for (const [who, method, url] of [
      [rana, 'GET', `/v1/conversations/${convo}`],
      [rana, 'POST', `/v1/business/${convo}/resolve`],
      [rana, 'GET', `/v1/orgs/${orgId}/inbox`],
      [lina, 'POST', `/v1/business/${convo}/resolve`],
      [omar, 'GET', `/v1/orgs/${orgId}/inbox`],
    ] as const)
      expect((await who.req(method, url)).statusCode, `${method} ${url}`).toBe(404);
  });

  it('keeps the conversation two-sided: no members, no requests across it', async () => {
    const add = await sara.req('POST', `/v1/conversations/${convo}/members`, {
      userIds: [noor.user.id],
    });
    expect(add.statusCode).toBe(400);
    const leave = await sara.req('DELETE', `/v1/conversations/${convo}/members/${sara.user.id}`);
    expect(leave.statusCode).toBe(400);
    const request = await sara.req('POST', '/v1/tasks', {
      title: 'Send the receipt',
      assigneeId: lina.user.id,
      shared: true,
      conversationId: convo,
    });
    expect(request.statusCode).toBe(403);
  });
});
