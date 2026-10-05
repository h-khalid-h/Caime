/**
 * The Attention home (R66): waiting on others oldest first, what's coming up, and the one wait
 * Cai asks about once it has gone quiet for three days; and a conversation's open line.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sarah: Client;
let convo: string;
const DAY = 86_400_000;

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, { displayName: 'Hassan Khalid' });
  sarah = await signup(t, { displayName: 'Sarah Smith' });
  const r = await hassan.post('/v1/connections/requests', { toUserId: sarah.user.id });
  convo = (await sarah.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
});

describe('the Attention home (R66)', () => {
  let approval: string;

  it('lists what you wait on others for, oldest first, and asks about none yet', async () => {
    approval = (
      await hassan.post('/v1/tasks', {
        title: 'Access approval',
        assigneeId: sarah.user.id,
        shared: true,
        conversationId: convo,
      })
    ).task.id;
    t.clock.advance(60_000);
    await hassan.post('/v1/tasks', {
      title: 'Final floor plan',
      assigneeId: sarah.user.id,
      conversationId: convo,
      dueAt: new Date(t.clock.now.getTime() + DAY).toISOString(),
    });
    const home = await hassan.get('/v1/attention');
    expect(home.waiting.map((w: { title: string }) => w.title)).toEqual([
      'Access approval',
      'Final floor plan',
    ]);
    expect(home.waitingCount).toBe(2);
    expect(home.ask).toBeNull();
    // A wait is with the waits, not coming up too; your own thing due tomorrow is coming up.
    expect(home.comingUp).toEqual([]);
    await hassan.post('/v1/tasks', {
      title: 'Send the contract',
      dueAt: new Date(t.clock.now.getTime() + DAY).toISOString(),
    });
    expect(
      (await hassan.get('/v1/attention')).comingUp.map((i: { title: string }) => i.title),
    ).toEqual(['Send the contract']);
    // Sarah waits on nobody.
    expect((await sarah.get('/v1/attention')).waiting).toEqual([]);
  });

  it('asks about a wait gone quiet, and not again for three days once answered', async () => {
    t.clock.advance(3 * DAY + 60_000);
    const quiet = await hassan.get('/v1/attention');
    expect(quiet.ask).toMatchObject({ taskId: approval });
    // "Still waiting": asked again in three days.
    await hassan.req('PATCH', `/v1/tasks/${approval}`, {
      remindAt: new Date(t.clock.now.getTime() + 3 * DAY).toISOString(),
    });
    const after = await hassan.get('/v1/attention');
    expect(after.ask?.taskId).not.toBe(approval);
  });

  it('a conversation says what is open in it for you, and nobody else’s count', async () => {
    const mine = (await hassan.get(`/v1/conversations/${convo}`)).conversation;
    expect(mine.open).toMatchObject({ count: 2 }); // the two waits; the contract has no conversation
    expect(mine.open.nextDueAt).not.toBeNull();
    // Sarah sees only what was shared with her.
    expect((await sarah.get(`/v1/conversations/${convo}`)).conversation.open).toMatchObject({
      count: 1,
      nextDueAt: null,
    });
    await hassan.req('PATCH', `/v1/tasks/${approval}`, { status: 'done' });
    expect((await sarah.get(`/v1/conversations/${convo}`)).conversation.open).toBeNull();
  });
});
