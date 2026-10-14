/**
 * Cai's weekly digest (R68): turned on in Settings · Cai, it comes at the start of the week the
 * person works, at their brief's hour or nine, in Cai's chat: who they talked with last week,
 * what they did that they'd said they would, who has gone quiet, what they've waited on longest
 * and the week ahead. By the rules, from their own one-to-ones and tasks: names, counts and
 * titles, never anyone's words; someone blocked is never named. Turned off, it says nothing.
 */
import { CAI_ID, uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { digestText, nextDigestAt } from '../src/lib/cai';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let ana: Client;
let ben: Client;
let cara: Client;
let dan: Client;
let eve: Client;
const chats: Record<string, string> = {};

const connect = async (a: Client, b: Client) => {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
};
const say = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body,
  });
const caiChat = async (c: Client) =>
  (await c.post('/v1/conversations', { kind: 'direct', userId: CAI_ID })).conversation.id as string;
const lastFromCai = async (c: Client) => {
  const all = (await c.get(`/v1/conversations/${await caiChat(c)}/messages`)).messages as Array<{
    senderId: string;
    body: string;
  }>;
  return all.filter((m) => m.senderId === CAI_ID).at(-1)?.body ?? '';
};
const digestJobs = () =>
  t.ctx.db
    .selectFrom('jobs')
    .select(['run_at', 'payload', 'done_at'])
    .where('kind', '=', 'cai.digest')
    .orderBy('run_at')
    .execute();

beforeAll(async () => {
  t = await createTestApp();
  // A Tuesday. Ana lives in Cairo, where the week starts on Sunday (R76).
  t.clock.set('2026-09-01T08:00:00Z');
  ana = await signup(t, { displayName: 'Ana Digest', country: 'EG', timeZone: 'Africa/Cairo' });
  ben = await signup(t, { displayName: 'Ben Digest' });
  cara = await signup(t, { displayName: 'Cara Digest' });
  dan = await signup(t, { displayName: 'Dan Digest' });
  eve = await signup(t, { displayName: 'Eve Digest' });
  await t.ctx.db
    .updateTable('sessions')
    .set({ expires_at: new Date('2030-01-01T00:00:00Z') })
    .execute();
  chats.ben = await connect(ana, ben);
  chats.cara = await connect(ana, cara);
  chats.dan = await connect(ana, dan);
  chats.eve = await connect(ana, eve);
  // Four weeks ago: a busy exchange with Cara and with Eve, two lines with Dan.
  for (const [who, c] of [
    ['cara', cara],
    ['eve', eve],
  ] as const) {
    for (let i = 0; i < 3; i++) {
      await say(ana, chats[who]!, `our secret plans ${i}`);
      await say(c, chats[who]!, `sounds good ${i}`);
    }
  }
  await say(ana, chats.dan!, 'hello Dan');
  await say(dan, chats.dan!, 'hi Ana');
  // Ana blocks Eve: never named again.
  await ana.post('/v1/blocks', { userId: eve.user.id });
  // Last week: Ana and Ben talk, Ana does what she said she'd do, and waits on Dan.
  t.clock.set('2026-09-22T08:00:00Z');
  await say(ana, chats.ben!, 'lunch next week?');
  await say(ben, chats.ben!, 'yes please');
  const own = (await ana.post('/v1/tasks', { title: 'Book the venue' })).task.id;
  await ana.patch(`/v1/tasks/${own}`, { status: 'done' });
  await ana.post('/v1/tasks', {
    title: 'Contract draft',
    assigneeId: dan.user.id,
    shared: false,
    conversationId: chats.dan,
  });
  // Ana runs a clinic; Ben writes to it, and nobody on the team has answered yet (R87).
  const clinic = (
    await ana.post('/v1/orgs', {
      country: 'EG',
      name: 'Ana Clinic',
      handle: 'ana.clinic.digest',
      kind: 'business',
    })
  ).org;
  const thread = await ben.post(`/v1/orgs/${clinic.id}/conversations`, {});
  await say(ben, thread.conversationId, 'Do you open on Saturdays?');
  // A meeting with Ben in the week ahead, agreed.
  const card = (
    await ana.post(`/v1/conversations/${chats.ben}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: {
          title: 'Venue walk-through',
          start: { at: '2026-09-29T10:00:00.000Z', hasTime: true },
          durationMinutes: 30,
        },
      },
    })
  ).message;
  await ben.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
});
afterAll(async () => {
  await t.close();
});

describe('Cai’s weekly digest (R68)', () => {
  it('comes at the start of the week they work, at the hour', () => {
    const tuesday = new Date('2026-09-22T10:00:00Z');
    // A Monday-to-Friday week: Monday at nine.
    expect(nextDigestAt(tuesday, '09:00', 'UTC', [1, 2, 3, 4, 5]).toISOString()).toBe(
      '2026-09-28T09:00:00.000Z',
    );
    // Cairo's week starts on Sunday, at nine there.
    expect(nextDigestAt(tuesday, '09:00', 'Africa/Cairo', [0, 1, 2, 3, 4]).toISOString()).toBe(
      '2026-09-27T06:00:00.000Z',
    );
    // Monday morning before the hour: today.
    const monday = new Date('2026-09-28T08:00:00Z');
    expect(nextDigestAt(monday, '09:00', 'UTC', [1, 2, 3, 4, 5]).toISOString()).toBe(
      '2026-09-28T09:00:00.000Z',
    );
  });

  it('is off until it’s turned on, then queued for the start of the week', async () => {
    expect(await digestJobs()).toEqual([]);
    await ana.patch('/v1/me', { preferences: { caiDigest: true } });
    const jobs = await digestJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toMatchObject({ userId: ana.user.id, at: '09:00' });
    // Sunday 27 September, nine in Cairo, within the five minutes after it.
    const at = jobs[0]!.run_at.getTime();
    expect(at).toBeGreaterThanOrEqual(Date.parse('2026-09-27T06:00:00Z'));
    expect(at).toBeLessThan(Date.parse('2026-09-27T06:05:00Z'));
    // Saying it again queues nothing more.
    await ana.patch('/v1/me', { preferences: { caiDigest: true, theme: 'dark' } });
    expect(await digestJobs()).toHaveLength(1);
  });

  it('says the week with their people in Cai’s chat, by the rules', async () => {
    const [job] = await digestJobs();
    t.clock.set(job!.run_at.toISOString());
    t.clock.advance(1000);
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    const body = await lastFromCai(ana);
    const lines = body.split('\n');
    expect(lines[0]).toBe('Good morning, Ana.');
    expect(lines).toContain('Here’s your week with your people.');
    expect(lines).toContain('Last week you talked with one person.');
    expect(lines).toContain('You did one thing you said you would.');
    // Cara went quiet after a busy exchange; Dan's two lines weren't one; Eve is blocked.
    expect(lines).toContain('Gone quiet:');
    expect(lines).toContain('• Cara Digest: nothing for 3 weeks');
    expect(body).not.toContain('Dan Digest: nothing');
    expect(body).not.toContain('Eve');
    expect(lines).toContain('You’ve waited longest on Dan Digest: Contract draft.');
    expect(lines).toContain('One meeting or appointment this week.');
    // The clinic she runs, from its inbox: never its customers' words (R87).
    expect(lines).toContain('At Ana Clinic:');
    expect(lines).toContain('• One new conversation this week');
    expect(lines).toContain('• One customer waiting on the team');
    expect(body).not.toContain('Saturdays');
    expect(lines.some((l) => l.startsWith('• ') && l.endsWith(' · Venue walk-through'))).toBe(true);
    expect(lines.at(-1)).toBe('Ask me about any of it.');
    // Ben, who wrote to it, runs nothing: his own week, never the clinic's.
    expect((await digestText(t.ctx, ben.user.id)).text).not.toContain('Ana Clinic');
    // Never anyone's words.
    expect(body).not.toMatch(/secret plans|sounds good|lunch next week/);
    // Its notification says who went quiet.
    const told = (await ana.get('/v1/notifications')).notifications.find(
      (n: { kind: string; body: string }) => n.kind === 'reminder' && n.body.includes('quiet'),
    );
    expect(told?.body).toBe('One person has gone quiet.');
    // The next week's is queued.
    const next = (await digestJobs()).filter((j) => !j.done_at);
    expect(next).toHaveLength(1);
    expect(next[0]!.run_at.getTime()).toBeGreaterThanOrEqual(Date.parse('2026-10-04T06:00:00Z'));
  });

  it('is written in the reader’s language', async () => {
    await ana.patch('/v1/me', { preferences: { caiDigest: true, language: 'fr' } });
    const [next] = (await digestJobs()).filter((j) => !j.done_at);
    t.clock.set(next!.run_at.toISOString());
    t.clock.advance(1000);
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    const body = await lastFromCai(ana);
    expect(body).not.toContain('Here’s your week');
    expect(body).toContain('Cara Digest');
    await ana.patch('/v1/me', { preferences: { caiDigest: true, language: 'en' } });
  });

  it('follows the brief’s hour, and says nothing once turned off', async () => {
    await ana.patch('/v1/me', { preferences: { caiDigest: true, caiBrief: '07:30' } });
    const pending = (await digestJobs()).filter((j) => !j.done_at);
    expect(pending.map((j) => (j.payload as { at: string }).at).sort()).toEqual(['07:30', '09:00']);
    await ana.patch('/v1/me', { preferences: { caiDigest: false, caiBrief: '07:30' } });
    const chat = await caiChat(ana);
    const before = (await ana.get(`/v1/conversations/${chat}/messages`)).messages.length;
    for (const j of pending) {
      t.clock.set(j.run_at.toISOString());
      t.clock.advance(1000);
      await runDueJobs(t.ctx);
    }
    await t.ctx.flush();
    const after = (await ana.get(`/v1/conversations/${chat}/messages`)).messages as Array<{
      senderId: string;
      body: string;
    }>;
    // The brief at 07:30 may speak; the digest doesn't.
    expect(after.slice(before).some((m) => m.body.includes('your week with your people'))).toBe(
      false,
    );
    expect((await digestJobs()).filter((j) => !j.done_at)).toEqual([]);
  });
});
