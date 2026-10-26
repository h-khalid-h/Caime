/**
 * Messages written now and sent later (M16 E8b): kept for their time, listed to their sender
 * alone, sent at it by the job as if typed then, taken back or sent at once; refused for a
 * private conversation, a time past or too far, and kept with why when they can't go.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let ana: Client;
let ben: Client;
let cleo: Client;
let chat: string;

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: { sphere: 'friend' },
  });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  return (await a.post('/v1/conversations', { kind: 'direct', userId: b.user.id })).conversation
    .id as string;
}
const inAMinutes = (minutes: number) => new Date(t.clock.now.getTime() + minutes * 60_000);
const schedule = (c: Client, conversationId: string, body: string, minutes: number) =>
  c.req('POST', `/v1/conversations/${conversationId}/scheduled`, {
    clientId: uuidv4(),
    body,
    sendAt: inAMinutes(minutes).toISOString(),
  });
const bodies = async (c: Client, conversationId: string) =>
  (
    (await c.get(`/v1/conversations/${conversationId}/messages`)).messages as Array<{
      body: string | null;
    }>
  ).map((m) => m.body);

beforeAll(async () => {
  t = await createTestApp();
  ana = await signup(t, { displayName: 'Ana Later' });
  ben = await signup(t, { displayName: 'Ben Later' });
  cleo = await signup(t, { displayName: 'Cleo Else' });
  chat = await connect(ana, ben);
});
afterAll(async () => {
  await t.close();
});

describe('a message written now and sent later (M16 E8b)', () => {
  it('waits for its time, its sender alone sees it, and then it goes as if typed', async () => {
    const res = await schedule(ana, chat, 'Happy birthday, Ben!', 90);
    expect(res.statusCode, res.body).toBe(201);
    const { scheduled } = res.json();
    expect(scheduled.body).toBe('Happy birthday, Ben!');
    expect(scheduled.failure).toBeNull();
    // Theirs alone: the conversation counts it for them, never for Ben.
    expect((await ana.get(`/v1/conversations/${chat}`)).conversation.scheduled).toBe(1);
    expect((await ben.get(`/v1/conversations/${chat}`)).conversation.scheduled).toBe(0);
    expect((await ben.get(`/v1/conversations/${chat}/scheduled`)).scheduled).toEqual([]);
    expect(await bodies(ben, chat)).not.toContain('Happy birthday, Ben!');
    // Not before its time.
    t.clock.advance(60 * 60_000);
    await runDueJobs(t.ctx);
    expect(await bodies(ben, chat)).not.toContain('Happy birthday, Ben!');
    // At it: sent as Ana's, the row gone.
    t.clock.advance(31 * 60_000);
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    expect(await bodies(ben, chat)).toContain('Happy birthday, Ben!');
    expect((await ana.get(`/v1/conversations/${chat}/scheduled`)).scheduled).toEqual([]);
    expect((await ana.get(`/v1/conversations/${chat}`)).conversation.scheduled).toBe(0);
  });

  it('is taken back, or sent at once, by its sender alone', async () => {
    const first = (await schedule(ana, chat, 'Taken back', 30)).json().scheduled;
    const second = (await schedule(ana, chat, 'Sent at once', 30)).json().scheduled;
    expect((await ben.req('DELETE', `/v1/scheduled/${first.id}`)).statusCode).toBe(404);
    expect((await ana.req('DELETE', `/v1/scheduled/${first.id}`)).statusCode).toBe(200);
    expect((await ben.req('POST', `/v1/scheduled/${second.id}/send`, {})).statusCode).toBe(404);
    expect((await ana.req('POST', `/v1/scheduled/${second.id}/send`, {})).statusCode).toBe(200);
    await t.ctx.flush();
    const seen = await bodies(ben, chat);
    expect(seen).toContain('Sent at once');
    expect(seen).not.toContain('Taken back');
    // Its job finds nothing to send when the time comes: sent once.
    t.clock.advance(31 * 60_000);
    await runDueJobs(t.ctx);
    expect((await bodies(ben, chat)).filter((b) => b === 'Sent at once')).toHaveLength(1);
  });

  it('refuses a time past or beyond a year, and anyone outside the conversation', async () => {
    expect((await schedule(ana, chat, 'Too soon', 0)).statusCode).toBe(400);
    expect((await schedule(ana, chat, 'Too far', 367 * 24 * 60)).statusCode).toBe(400);
    const outside = await schedule(cleo, chat, 'Not mine to write', 30);
    expect(outside.statusCode).toBeGreaterThanOrEqual(403);
    expect(outside.statusCode).toBeLessThan(500);
    expect(
      (await cleo.req('GET', `/v1/conversations/${chat}/scheduled`)).statusCode,
    ).toBeGreaterThanOrEqual(403);
  });

  it('keeps one that can no longer go, with why, and tells its sender', async () => {
    const group = (
      await ana.post('/v1/conversations', {
        kind: 'group',
        title: 'Later circle',
        memberIds: [ben.user.id],
      })
    ).conversation.id as string;
    const kept = (await schedule(ben, group, 'For the circle', 30)).json().scheduled;
    // Ben leaves before its time: at it, the rules read then refuse it.
    expect(
      (await ben.req('DELETE', `/v1/conversations/${group}/members/${ben.user.id}`)).statusCode,
    ).toBeLessThan(300);
    t.clock.advance(31 * 60_000);
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    const row = await t.ctx.db
      .selectFrom('scheduled_messages')
      .select(['failure', 'failed_at'])
      .where('id', '=', kept.id)
      .executeTakeFirstOrThrow();
    expect(row.failure).toBeTruthy();
    expect(row.failed_at).not.toBeNull();
    expect(await bodies(ana, group)).not.toContain('For the circle');
    const told = await t.ctx.db
      .selectFrom('notifications')
      .select('title')
      .where('user_id', '=', ben.user.id)
      .where('title', '=', 'A message you wrote for later couldn’t be sent')
      .execute();
    expect(told).toHaveLength(1);
  });
});
