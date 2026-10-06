/**
 * Cai keeps going (R68): a wait handed to Cai comes back at its time as a follow-up ready to
 * send, sent only by its owner's tap and only once, then watched again; the morning brief comes
 * at the hour chosen where the person is, and stops when turned off; and what Cai learned is
 * shown a kind at a time and forgotten on request.
 */
import { CAI_ID, uuidv4, uuidv7 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextBriefAt } from '../src/lib/cai';
import { runDueJobs, runPeriodic } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sarah: Client;
let convo: string;
let wait: string;
const HOUR = 3_600_000;

const caiChat = async (c: Client) =>
  (await c.post('/v1/conversations', { kind: 'direct', userId: CAI_ID })).conversation.id as string;
const messages = async (c: Client, id: string) =>
  (await c.get(`/v1/conversations/${id}/messages`)).messages as any[];

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, { displayName: 'Hassan Khalid' });
  sarah = await signup(t, { displayName: 'Sarah Smith' });
  const r = await hassan.post('/v1/connections/requests', { toUserId: sarah.user.id });
  convo = (await sarah.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
  wait = (
    await hassan.post('/v1/tasks', {
      title: 'Access approval',
      assigneeId: sarah.user.id,
      shared: false,
      conversationId: convo,
    })
  ).task.id;
});
afterAll(async () => {
  await t.close();
});

describe('a wait handed to Cai (R68)', () => {
  let offer: any;

  it('only a wait on someone else is Cai’s, and it comes back as an offer at its time', async () => {
    const mine = (await hassan.post('/v1/tasks', { title: 'Buy milk' })).task.id;
    expect((await hassan.patch(`/v1/tasks/${mine}`, { caiFollowUp: true })).task.caiFollowUp).toBe(
      false,
    );
    const handed = await hassan.patch(`/v1/tasks/${wait}`, {
      caiFollowUp: true,
      remindAt: new Date(t.clock.now.getTime() + HOUR).toISOString(),
    });
    expect(handed.task.caiFollowUp).toBe(true);
    // Sarah can't hand Hassan's wait to anyone.
    expect(
      (await sarah.req('PATCH', `/v1/tasks/${wait}`, { caiFollowUp: false })).statusCode,
    ).toBeGreaterThanOrEqual(403);

    t.clock.advance(2 * HOUR);
    await runPeriodic(t.ctx);
    await t.ctx.flush();
    const chat = await caiChat(hassan);
    offer = (await messages(hassan, chat)).at(-1);
    expect(offer.body).toBe(
      'Sarah Smith hasn’t answered about “Access approval” yet. Shall I send this?\n\nHi Sarah, any news on “Access approval”?',
    );
    expect(offer.payload.followUp).toMatchObject({
      taskId: wait,
      conversationId: convo,
      draft: 'Hi Sarah, any news on “Access approval”?',
    });
    const notes = (await hassan.get('/v1/notifications')).notifications as any[];
    expect(notes.find((n) => n.data?.taskId === wait)).toMatchObject({
      title: 'Cai',
      data: { conversationId: chat },
    });
    // Nothing reached Sarah: Cai never writes in anyone's name by itself.
    expect((await messages(sarah, convo)).map((m) => m.body)).not.toContain(
      'Hi Sarah, any news on “Access approval”?',
    );
  });

  it('is sent by its owner’s tap only, once, and watched again', async () => {
    expect((await sarah.req('POST', `/v1/messages/${offer.id}/follow-up`)).statusCode).toBe(404);
    const sent = await hassan.post(`/v1/messages/${offer.id}/follow-up`);
    expect(sent.conversationId).toBe(convo);
    const again = await hassan.post(`/v1/messages/${offer.id}/follow-up`);
    expect(again.messageId).toBe(sent.messageId);
    const said = (await messages(sarah, convo)).filter(
      (m) => m.body === 'Hi Sarah, any news on “Access approval”?',
    );
    expect(said).toHaveLength(1);
    expect(said[0].senderId).toBe(hassan.user.id);
    const task = (await hassan.get('/v1/tasks?view=waiting')).tasks.find((x: any) => x.id === wait);
    expect(Date.parse(task.remindAt)).toBeGreaterThan(t.clock.now.getTime() + 2 * 24 * HOUR);
    const settings = await hassan.get('/v1/cai');
    expect(settings.followUps).toEqual([
      expect.objectContaining({ taskId: wait, who: 'Sarah Smith', title: 'Access approval' }),
    ]);
  });

  it('a closed wait is nothing to send', async () => {
    await hassan.patch(`/v1/tasks/${wait}`, { status: 'done' });
    const chat = await caiChat(hassan);
    const fake = await t.ctx.db
      .insertInto('messages')
      .values({
        id: uuidv7(),
        conversation_id: chat,
        seq: '9999',
        sender_id: CAI_ID,
        kind: 'text',
        body: 'x',
        client_id: `test:${uuidv4()}`,
        payload: JSON.stringify({
          followUp: { taskId: wait, conversationId: convo, to: 'Sarah Smith', draft: 'Hi' },
        }),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    expect((await hassan.req('POST', `/v1/messages/${fake.id}/follow-up`)).statusCode).toBe(400);
    expect((await hassan.get('/v1/cai')).followUps).toEqual([]);
  });
});

describe('the morning brief (R68)', () => {
  it('comes at the hour chosen, where the person is', () => {
    const now = new Date('2026-09-23T14:00:00Z');
    expect(nextBriefAt(now, '08:00', 'Africa/Cairo').toISOString()).toBe(
      '2026-09-24T05:00:00.000Z',
    );
    expect(nextBriefAt(now, '18:30', 'Africa/Cairo').toISOString()).toBe(
      '2026-09-23T15:30:00.000Z',
    );
    expect(nextBriefAt(now, '08:00', 'Not/AZone').toISOString()).toBe('2026-09-24T08:00:00.000Z');
  });

  it('says what’s on and what’s open in Cai’s chat, and stops when turned off', async () => {
    await sarah.patch('/v1/me', { preferences: { caiBrief: '18:30' } });
    const jobs = await t.ctx.db
      .selectFrom('jobs')
      .select(['run_at'])
      .where('kind', '=', 'cai.brief')
      .execute();
    expect(jobs).toHaveLength(1);
    t.clock.set(jobs[0]!.run_at.toISOString());
    t.clock.advance(1000);
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    const chat = await caiChat(sarah);
    const brief = (await messages(sarah, chat)).at(-1);
    expect(brief.body).toMatch(/^Good evening, Sarah\.\n/);
    expect(brief.body).toContain('Ask me about any of it.');
    // The next day's is queued; turned off, it says nothing.
    await sarah.patch('/v1/me', { preferences: { caiBrief: null } });
    const next = await t.ctx.db
      .selectFrom('jobs')
      .select(['run_at'])
      .where('kind', '=', 'cai.brief')
      .where('run_at', '>', t.clock.now)
      .executeTakeFirstOrThrow();
    t.clock.set(next.run_at.toISOString());
    t.clock.advance(1000);
    const before = (await messages(sarah, chat)).length;
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    expect(await messages(sarah, chat)).toHaveLength(before);
  });
});

describe('what Cai learned (R68)', () => {
  it('is counted a kind at a time, and forgotten on request', async () => {
    const now = t.clock.now;
    await t.ctx.db
      .insertInto('suggestions')
      .values(
        [0, 1, 2, 3].map((i) => ({
          id: uuidv7(),
          user_id: hassan.user.id,
          kind: 'task',
          title: `Thing ${i}`,
          rationale: 'x',
          confidence: 0.8,
          fingerprint: `learn-${i}`,
          status: i < 3 ? 'accepted' : 'dismissed',
          resolved_at: new Date(now.getTime() - (i + 1) * 60_000),
        })) as never,
      )
      .execute();
    const learned = (await hassan.get('/v1/cai')).learned as any[];
    expect(learned).toEqual([{ kind: 'task', accepted: 3, dismissed: 1, lean: null }]);
    const after = await hassan.post('/v1/cai/forget', { kind: 'task' });
    expect(after.learned).toEqual([]);
    expect(after.learning).toBe(true);
  });
});
