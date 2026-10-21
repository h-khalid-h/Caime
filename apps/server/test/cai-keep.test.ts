/**
 * Cai and the friends keep what they're asked to (M16 G13): "remind me to call Sam tomorrow at
 * 9", "add a task: …", "save it as a task". An explicit ask, read by the rules in the language it
 * was written in, kept at once as one of the person's actions (they asked: never a suggestion),
 * said in a line that carries the action for Undo. "It" is what Cai's model reads it as, for
 * whoever may use it, else the person's own words before the ask; an ask the rules don't read is
 * the model's to read, and nothing is kept that wasn't asked for.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CAI_ID, SYSTEM_ACCOUNTS, uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const requests: any[] = [];
const replies: string[] = [];
let stub: Server;
let t: TestApp;
let hassan: Client;
let mona: Client;
const MOMO = SYSTEM_ACCOUNTS.find((a) => a.handle === 'momo')!.id;

const caiSays = (reply: string, keep: unknown = null) => JSON.stringify({ reply, keep, act: null });
const open = async (c: Client, userId: string) =>
  (await c.post('/v1/conversations', { kind: 'direct', userId })).conversation.id as string;
const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const messages = async (c: Client, conversationId: string) =>
  (await c.get(`/v1/conversations/${conversationId}/messages`)).messages as any[];
async function answered(c: Client, conversationId: string) {
  await t.ctx.flush();
  t.clock.advance(1000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
  return messages(c, conversationId);
}
const tasks = async (c: Client) => (await c.get('/v1/tasks?view=todo')).tasks as any[];
const taskById = async (c: Client, id: string) =>
  (await c.get('/v1/tasks?view=todo')).tasks.find((x: any) => x.id === id);

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests.push(raw ? JSON.parse(raw) : null);
    const text = replies.shift();
    res.writeHead(text ? 200 : 500, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        text
          ? {
              id: 'msg_stub',
              type: 'message',
              role: 'assistant',
              model: 'claude-stub',
              content: [{ type: 'text', text }],
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: 200, output_tokens: 30 },
            }
          : { type: 'error', error: { type: 'api_error', message: 'no reply queued' } },
      ),
    );
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const { port } = stub.address() as AddressInfo;
  t = await createTestApp({
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
  });
  t.clock.set('2026-10-20T10:00:00Z');
  hassan = await signup(t, { displayName: 'Hassan Khalid', timeZone: 'Africa/Cairo' });
  mona = await signup(t, { displayName: 'Mona Fawzy', locale: 'ar-EG', timeZone: 'Africa/Cairo' });
});
afterAll(async () => {
  await t.close();
  await new Promise((done) => stub.close(done));
});

describe('keeping what’s asked (M16 G13)', () => {
  it('keeps a reminder by the rules, with its time, and asks no model', async () => {
    const cai = await open(hassan, CAI_ID);
    const before = requests.length;
    await send(hassan, cai, 'Remind me to call Sam tomorrow at 9');
    const said = (await answered(hassan, cai)).at(-1);
    expect(said.senderId).toBe(CAI_ID);
    expect(said.body).toBe('I’ll remind you: “Call Sam” · Tomorrow 9:00 AM');
    const task = await taskById(hassan, said.payload.kept.taskId);
    expect(task).toMatchObject({ title: 'Call Sam', conversationId: cai, dueHasTime: true });
    // Nine on his clock, Cairo's (still on summer time): six in the morning UTC.
    expect(task.dueAt).toBe('2026-10-21T06:00:00.000Z');
    expect(task.remindAt).toBe('2026-10-21T06:00:00.000Z');
    expect(requests.length).toBe(before);
  });

  it('keeps an action from words after a lead, and one from a friend as well', async () => {
    const cai = await open(hassan, CAI_ID);
    await send(hassan, cai, 'Cai, add a task: book the venue for the offsite');
    const said = (await answered(hassan, cai)).at(-1);
    expect(said.body).toBe('Saved to your actions: “Book the venue for the offsite”');
    expect(await taskById(hassan, said.payload.kept.taskId)).toMatchObject({
      title: 'Book the venue for the offsite',
      dueAt: null,
      remindAt: null,
    });
    const momo = await open(hassan, MOMO);
    await send(hassan, momo, 'please remind me to water the plants tonight');
    const hers = (await answered(hassan, momo)).at(-1);
    expect(hers.senderId).toBe(MOMO);
    expect(hers.body).toMatch(/^I’ll remind you: “Water the plants” · Today /);
    expect((await taskById(hassan, hers.payload.kept.taskId)).title).toBe('Water the plants');
  });

  it('keeps what "it" was, without the model: their own words before the ask', async () => {
    const cai = await open(hassan, CAI_ID);
    await send(hassan, cai, 'The venue deposit for the offsite is due next Friday.');
    await answered(hassan, cai);
    const before = requests.length;
    await send(hassan, cai, 'Save it as a task');
    const said = (await answered(hassan, cai)).at(-1);
    expect(said.body).toMatch(
      /^Saved to your actions: “The venue deposit for the offsite is due next Friday\.” · /,
    );
    const task = await taskById(hassan, said.payload.kept.taskId);
    expect(task.title).toBe('The venue deposit for the offsite is due next Friday.');
    expect(task.dueAt).toBe('2026-10-30T07:00:00.000Z');
    expect(requests.length).toBe(before);
  });

  it('asks what to keep when nothing came before', async () => {
    const fresh = await signup(t, { displayName: 'Nadia Fresh' });
    const cai = await open(fresh, CAI_ID);
    await send(fresh, cai, 'save it');
    const said = (await answered(fresh, cai)).at(-1);
    expect(said.body).toMatch(/^What should I keep\? /);
    expect(said.payload?.kept).toBeUndefined();
    expect(await tasks(fresh)).toEqual([]);
  });

  it('with AI assist, reads what "it" was, and an ask the rules don’t', async () => {
    await hassan.patch('/v1/me', { aiEnabled: true });
    const cai = await open(hassan, CAI_ID);
    replies.push(caiSays('Interesting idea: worth testing with two clinics first.'));
    await send(
      hassan,
      cai,
      'I’m thinking of letting an organization’s Cai answer calls. The caller pays unless the organization makes them free.',
    );
    await answered(hassan, cai);
    replies.push(
      caiSays('', {
        title: 'Let an organization’s Cai answer calls',
        details: 'The caller pays unless the organization makes calls free.',
        when: null,
        remind: false,
      }),
    );
    let before = requests.length;
    await send(hassan, cai, 'Save it as a task');
    let said = (await answered(hassan, cai)).at(-1);
    expect(requests.length).toBe(before + 1);
    expect(said.body).toBe('Saved to your actions: “Let an organization’s Cai answer calls”');
    expect(await taskById(hassan, said.payload.kept.taskId)).toMatchObject({
      title: 'Let an organization’s Cai answer calls',
      notes: 'The caller pays unless the organization makes calls free.',
    });
    // Asked in words the rules don't read: the model reads the ask, and Caime keeps it.
    replies.push(
      caiSays('Good plan.', {
        title: 'Renew the passport',
        details: null,
        when: 'Monday',
        remind: false,
      }),
    );
    before = requests.length;
    await send(hassan, cai, 'could you jot the passport renewal down for Monday?');
    const all = await answered(hassan, cai);
    expect(requests.length).toBe(before + 1);
    expect(all.at(-2).body).toBe('Good plan.');
    said = all.at(-1);
    expect(said.body).toMatch(/^Saved to your actions: “Renew the passport” · /);
    expect((await taskById(hassan, said.payload.kept.taskId)).dueAt).toBe(
      '2026-10-26T06:00:00.000Z',
    );
    // A model that keeps nothing keeps nothing.
    replies.push(caiSays('A sunny day, by the look of it.'));
    const count = (await tasks(hassan)).length;
    await send(hassan, cai, 'What’s the weather like for a picnic?');
    expect((await answered(hassan, cai)).at(-1).payload?.kept).toBeUndefined();
    expect(await tasks(hassan)).toHaveLength(count);
  });

  it('keeps an ask in Arabic, said in her Arabic', async () => {
    const cai = await open(mona, CAI_ID);
    await send(mona, cai, 'ذكّرني بكرة اتصل بسامي');
    const said = (await answered(mona, cai)).at(-1);
    expect(said.body).toMatch(/«اتصل بسامي»/);
    expect(said.body).toMatch(/^هفكّرك: /);
    expect((await taskById(mona, said.payload.kept.taskId)).title).toBe('اتصل بسامي');
  });

  it('undoes as any action is deleted', async () => {
    const cai = await open(hassan, CAI_ID);
    await send(hassan, cai, 'To-do: send Maya the logo files');
    const said = (await answered(hassan, cai)).at(-1);
    const id = said.payload.kept.taskId;
    expect(await taskById(hassan, id)).toBeTruthy();
    await hassan.del(`/v1/tasks/${id}`);
    expect(await taskById(hassan, id)).toBeUndefined();
  });
});
