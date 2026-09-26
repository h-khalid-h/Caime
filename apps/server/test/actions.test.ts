import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPeriodic } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sarah: Client;
let convo: string;

const send = (c: Client, id: string, body: string, extra: object = {}) =>
  c
    .post(`/v1/conversations/${id}/messages`, { clientId: uuidv4(), kind: 'text', body, ...extra })
    .then((r) => r.message);
const inbox = async (c: Client) => {
  await t.ctx.flush();
  return c.get('/v1/inbox');
};
const sectionOf = (ib: any, id: string) =>
  ib.sections.find((s: any) => s.items.some((i: any) => i.id === id))?.section;

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, { displayName: 'Hassan Khalid' });
  sarah = await signup(t, { displayName: 'Sarah Smith' });
  const r = await hassan.post('/v1/connections/requests', {
    toUserId: sarah.user.id,
    relationship: { sphere: 'work', role: 'manager', orgName: 'DATA C' },
  });
  convo = (
    await sarah.post(`/v1/connections/requests/${r.requestId}/accept`, {
      relationship: { sphere: 'work', role: 'direct_report', orgName: 'DATA C' },
    })
  ).conversationId;
});
afterAll(async () => {
  await t.close();
});

describe('requests are one record seen from two sides (R13)', () => {
  let taskId: string;

  it('asking creates a live card in the chat, a task for them and a waiting item for me', async () => {
    const res = await hassan.post('/v1/tasks', {
      title: 'Send the Q3 report',
      assigneeId: sarah.user.id,
      shared: true,
      conversationId: convo,
      dueAt: '2026-09-25T15:00:00.000Z',
      dueHasTime: true,
    });
    taskId = res.task.id;
    expect(res.task).toMatchObject({
      direction: 'i_asked',
      relationship: 'Manager · DATA C',
      status: 'open',
    });
    const msgs = (await sarah.get(`/v1/conversations/${convo}/messages`)).messages;
    const card = msgs.find((m: any) => m.kind === 'kit');
    expect(card.payload).toMatchObject({
      kit: 'request',
      taskId,
      title: 'Send the Q3 report',
      state: 'open',
    });
    const todo = await sarah.get('/v1/tasks?view=todo');
    expect(todo.tasks[0]).toMatchObject({
      id: taskId,
      direction: 'asked_me',
      owner: { displayName: 'Hassan Khalid' },
    });
    expect(todo.counts.asked_me).toBe(1);
    const note = await t.ctx.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', sarah.user.id)
      .where('kind', '=', 'request')
      .executeTakeFirstOrThrow();
    expect(note.title).toBe('Hassan Khalid asked you');
    expect(note.body).toMatch(/^Send the Q3 report · due Fri/);
    await sarah.post(`/v1/conversations/${convo}/receipts`, { read: 1000 });
    const ib = await inbox(sarah);
    expect(sectionOf(ib, convo)).toBe('needs_you');
  });

  it('only the person asked can accept; completing it resolves my waiting item and tells me', async () => {
    expect(
      (await hassan.req('PATCH', `/v1/tasks/${taskId}`, { status: 'accepted' })).statusCode,
    ).toBe(400);
    await sarah.patch(`/v1/tasks/${taskId}`, { status: 'accepted' });
    expect(
      (await sarah.req('PATCH', `/v1/tasks/${taskId}`, { title: 'Changed by assignee' }))
        .statusCode,
    ).toBe(403);
    await sarah.patch(`/v1/tasks/${taskId}`, { status: 'done' });
    expect((await hassan.get('/v1/tasks?view=waiting')).tasks).toEqual([]);
    const done = await t.ctx.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', hassan.user.id)
      .where('kind', '=', 'waiting_resolved')
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(done.title).toBe('Sarah Smith finished your request');
    const card = (await hassan.get(`/v1/conversations/${convo}/messages`)).messages.find(
      (m: any) => m.kind === 'kit',
    );
    expect(card.payload.state).toBe('done');
  });

  it('a private waiting item is invisible to the other person', async () => {
    const w = await hassan.post('/v1/tasks', { title: 'Contract', assigneeId: sarah.user.id });
    expect(w.task.direction).toBe('waiting');
    expect((await sarah.get('/v1/tasks?view=all')).tasks.map((x: any) => x.id)).not.toContain(
      w.task.id,
    );
    expect(
      (await sarah.req('PATCH', `/v1/tasks/${w.task.id}`, { status: 'done' })).statusCode,
    ).toBe(404);
    expect((await hassan.get('/v1/tasks?view=waiting')).tasks[0].title).toBe('Contract');
  });

  it('overdue items pull the conversation into Needs you; reminders fire', async () => {
    await hassan.post(`/v1/conversations/${convo}/receipts`, { read: 1000 });
    await hassan.post('/v1/tasks', {
      title: 'Sign NDA',
      conversationId: convo,
      dueAt: '2026-09-20T12:00:00.000Z',
      remindAt: '2026-09-23T13:00:00.000Z',
    });
    const ib = await inbox(hassan);
    expect(sectionOf(ib, convo)).toBe('needs_you');
    expect(ib.sections[0].items[0].reasons[0].label).toBe('Overdue');
    await runPeriodic(t.ctx);
    const r = await t.ctx.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', hassan.user.id)
      .where('kind', '=', 'reminder')
      .executeTakeFirstOrThrow();
    expect(r.title).toBe('Sign NDA');
  });
});

describe('decisions, context and memory (PRD §17, §24, §30)', () => {
  it('records a decision in the timeline and finds it later', async () => {
    const d = await sarah.post('/v1/decisions', {
      conversationId: convo,
      title: 'Ship the blue design on Oct 15',
    });
    const sys = (await hassan.get(`/v1/conversations/${convo}/messages`)).messages.at(-1);
    expect(sys).toMatchObject({
      kind: 'system',
      payload: { event: 'decision_recorded', decisionId: d.id },
    });
    const found = await hassan.get('/v1/decisions?q=blue');
    expect(found.decisions[0]).toMatchObject({
      title: 'Ship the blue design on Oct 15',
      decidedBy: { displayName: 'Sarah Smith' },
    });
  });

  it('a conversation can carry a context; memory summarises the current state', async () => {
    await hassan.post('/v1/contexts', {
      kind: 'project',
      title: 'Project Alpha',
      purpose: 'Delivery',
      deadlineAt: '2026-10-15T00:00:00.000Z',
      conversationId: convo,
    });
    const view = (await sarah.get(`/v1/conversations/${convo}`)).conversation;
    expect(view.context).toMatchObject({
      kind: 'project',
      title: 'Project Alpha',
      purpose: 'Delivery',
    });
    await send(sarah, convo, 'Budget is $12,500 and the review is next Tuesday at 10am');
    const memory = await hassan.get(`/v1/conversations/${convo}/memory`);
    expect(memory.summary).toContain('Last decision: Ship the blue design on Oct 15.');
    expect(memory.summary).toContain('open for you');
    expect(memory.amounts[0]).toMatchObject({ value: 12500, currency: 'USD' });
    expect(memory.dates[0].text).toBe('next Tuesday at 10am');
    expect(memory.decisions).toHaveLength(1);
    const ctxView = await hassan.get(`/v1/contexts/${view.context.id}`);
    expect(ctxView.counts.decisions).toBe(1);
  });
});

describe('search (PRD §25)', () => {
  it.each([
    [
      'Managers',
      (r: any) =>
        expect(r.results.people.map((p: any) => p.person.displayName)).toEqual(['Sarah Smith']),
    ],
    [
      'DATA C',
      (r: any) => expect(r.results.organizations[0]).toEqual({ name: 'DATA C', people: 1 }),
    ],
    [
      'what did Sarah say about the budget?',
      (r: any) => expect(r.results.messages[0].snippet).toContain('«Budget»'),
    ],
    ['decisions about blue', (r: any) => expect(r.results.decisions).toHaveLength(1)],
    ['PDFs from Sarah', (r: any) => expect(r.results.files).toEqual([])],
    [
      'Project Alpha conversations',
      (r: any) => expect(r.results.contexts[0].context.title).toBe('Project Alpha'),
    ],
  ])('%s', async (q, check) => {
    check(await hassan.get(`/v1/search?q=${encodeURIComponent(q)}`));
  });

  it('things Sarah asked me to do', async () => {
    const r = await sarah.post('/v1/tasks', {
      title: 'Review the deck',
      assigneeId: hassan.user.id,
      shared: true,
      conversationId: convo,
    });
    const res = await hassan.get(
      `/v1/search?q=${encodeURIComponent('things Sarah asked me to do')}`,
    );
    expect(res.interpretation).toBe('What Sarah asked you to do');
    expect(res.results.tasks.map((x: any) => x.id)).toContain(r.task.id);
  });

  it('never searches private conversations or other people’s messages', async () => {
    const outsider = await signup(t, { displayName: 'Outsider' });
    const res = await outsider.get(`/v1/search?q=budget`);
    expect(res.results.messages).toEqual([]);
  });
});

describe('notifications and push', () => {
  it('lists, reads and dismisses', async () => {
    const list = await sarah.get('/v1/notifications');
    expect(list.notifications.length).toBeGreaterThan(0);
    const first = list.notifications[0];
    await sarah.post('/v1/notifications/read', { ids: [first.id] });
    await sarah.post(`/v1/notifications/${first.id}/dismiss`);
    const after = await sarah.get('/v1/notifications');
    expect(after.notifications.map((n: any) => n.id)).not.toContain(first.id);
    await sarah.post('/v1/notifications/read', { all: true });
    expect((await sarah.get('/v1/notifications')).unread).toBe(0);
  });

  it('publishes a VAPID key and stores subscriptions', async () => {
    const { publicKey } = await sarah.get('/v1/push/vapid');
    expect(publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    await sarah.post('/v1/push/subscriptions', {
      kind: 'webpush',
      subscription: {
        endpoint: 'https://push.example.com/abc',
        keys: { p256dh: 'x'.repeat(87), auth: 'y'.repeat(22) },
      },
    });
    const subs = await t.ctx.db
      .selectFrom('push_subscriptions')
      .selectAll()
      .where('user_id', '=', sarah.user.id)
      .execute();
    expect(subs).toHaveLength(1);
  });
});

describe('safety (PRD §55)', () => {
  it('blocking stops messages both ways; reports are accepted', async () => {
    await sarah.post('/v1/blocks', { userId: hassan.user.id });
    const res = await hassan.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body: 'hello?',
    });
    expect(res.statusCode).toBe(403);
    await sarah.del(`/v1/blocks/${hassan.user.id}`);
    await send(hassan, convo, 'hello again');
    const r = await sarah.post('/v1/reports', { userId: hassan.user.id, reason: 'spam' });
    expect(r.ok).toBe(true);
  });
});
