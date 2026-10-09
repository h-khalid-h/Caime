import { CAI_ID, uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * A private wait someone keeps on you is theirs alone (lib/task-visibility.ts): Actions never
 * showed it; Cai, the inbox's counts and the brief before a meeting read the same rule now.
 */
let t: TestApp;
let hassan: Client; // keeps a private wait on Sarah
let sarah: Client; // never sees it
let convo: string;

const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
async function answered(c: Client, conversationId: string): Promise<string> {
  await t.ctx.flush();
  t.clock.advance(1000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
  const { messages } = await c.get(`/v1/conversations/${conversationId}/messages`);
  return messages.at(-1).body as string;
}
const ask = (title: string, shared: boolean) =>
  hassan.post('/v1/tasks', {
    title,
    assigneeId: sarah.user.id,
    shared,
    conversationId: convo,
    // Overdue since yesterday, so every count that would move would.
    dueAt: new Date(t.clock.now.getTime() - 86_400_000).toISOString(),
  });

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, { displayName: 'Hassan Khalid' });
  sarah = await signup(t, { displayName: 'Sarah Chen' });
  const r = await hassan.post('/v1/connections/requests', {
    toUserId: sarah.user.id,
    relationship: { sphere: 'work', role: 'manager' },
  });
  await sarah.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  convo = (await hassan.post('/v1/conversations', { kind: 'direct', userId: sarah.user.id }))
    .conversation.id;
  await ask('Chase the signed contract', false);
});
afterAll(async () => {
  await t.close();
});

describe('a private wait stays private (review 2026-10-09)', () => {
  it('Actions, Cai, the inbox and the brief agree on what Sarah was asked', async () => {
    // The inbox: a private overdue wait on Sarah never makes the conversation need her.
    await send(sarah, convo, 'Hello');
    const section = async () =>
      (await sarah.get('/v1/inbox?view=all')).conversations.find(
        (c: { id: string }) => c.id === convo,
      )?.section;
    expect(await section()).not.toBe('needs_you');
    await ask('Send the deck', true);
    expect(await section()).toBe('needs_you');
    // Actions: the shared ask alone.
    const asked = (await sarah.get('/v1/tasks?view=asked_me')).tasks.map(
      (x: { title: string }) => x.title,
    );
    expect(asked).toEqual(['Send the deck']);
    // Cai, by the same rule.
    const cai = (await sarah.post('/v1/conversations', { kind: 'direct', userId: CAI_ID }))
      .conversation.id;
    await send(sarah, cai, 'who is waiting on me');
    const said = await answered(sarah, cai);
    expect(said).toContain('Send the deck');
    expect(said).not.toContain('Chase the signed contract');
    // Hassan's own view keeps both: they're his.
    const mine = (await hassan.get('/v1/tasks?view=waiting')).tasks.map(
      (x: { title: string }) => x.title,
    );
    expect(mine.sort()).toEqual(['Chase the signed contract', 'Send the deck']);
    // The brief before a meeting they agreed to.
    const card = (
      await hassan.post(`/v1/conversations/${convo}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: {
            title: 'Weekly',
            start: {
              at: new Date(t.clock.now.getTime() + 3 * 3_600_000).toISOString(),
              hasTime: true,
            },
            durationMinutes: 30,
          },
        },
      })
    ).message;
    await sarah.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    const hers = JSON.stringify(await sarah.get(`/v1/messages/${card.id}/brief`));
    expect(hers).toContain('Send the deck');
    expect(hers).not.toContain('Chase the signed contract');
    const his = JSON.stringify(await hassan.get(`/v1/messages/${card.id}/brief`));
    expect(his).toContain('Chase the signed contract');
  });
});
