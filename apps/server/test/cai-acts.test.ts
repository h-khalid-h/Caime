/**
 * Cai does what it's asked (M16 G14, R110): a message drafted to one of the person's people, a
 * call, a meeting proposed, a search. Prepared, shown as it will go and to whom, and done only on
 * their tap, as theirs, once; read by the rules, or by Cai's model for what they don't read;
 * whom it's for among their people, asking which when two share a name, and finished by their
 * next words when Cai asks what's missing.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CAI_ID, SYSTEM_ACCOUNTS, uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const requests: unknown[] = [];
const replies: string[] = [];
let stub: Server;
let t: TestApp;
let hassan: Client;
let sarah: Client;
let chat: string;
const MOMO = SYSTEM_ACCOUNTS.find((a) => a.handle === 'momo')!.id;

const caiSays = (reply: string, act: unknown = null) => JSON.stringify({ reply, keep: null, act });
const open = async (c: Client, userId: string) =>
  (await c.post('/v1/conversations', { kind: 'direct', userId })).conversation.id as string;
const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const messages = async (c: Client, conversationId: string) =>
  (await c.get(`/v1/conversations/${conversationId}/messages`)).messages as any[];
/** Connected, as people are by a request accepted: their one-to-one chat. */
async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}
/** Cai's (or a friend's) answer to what was just written to it. */
async function answered(c: Client, conversationId: string) {
  await t.ctx.flush();
  t.clock.advance(1000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
  return (await messages(c, conversationId)).at(-1);
}

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
  sarah = await signup(t, { displayName: 'Sarah Smith', timeZone: 'Africa/Cairo' });
  chat = await connect(hassan, sarah);
});
afterAll(async () => {
  await t.close();
  await new Promise((done) => stub.close(done));
});

describe('Cai does what it’s asked, on the person’s tap (M16 G14)', () => {
  it('drafts a message by the rules, sends nothing until tapped, then sends it once as theirs', async () => {
    const cai = await open(hassan, CAI_ID);
    const before = requests.length;
    await send(hassan, cai, 'tell Sarah I’ll be ten minutes late');
    const line = await answered(hassan, cai);
    // The words under the line, as they'll go, in the person's own quotes.
    expect(line.body).toBe(
      'Here’s a message for Sarah Smith. Shall I send it?\n\nI’ll be ten minutes late',
    );
    expect(line.payload.offer).toMatchObject({
      kind: 'message',
      to: { id: sarah.user.id, name: 'Sarah Smith' },
      conversationId: chat,
      text: 'I’ll be ten minutes late',
    });
    expect(requests.length).toBe(before);
    expect((await messages(sarah, chat)).some((m) => m.body === 'I’ll be ten minutes late')).toBe(
      false,
    );
    // Sarah can't send Hassan's offer: it's in his chat with Cai.
    expect((await sarah.req('POST', `/v1/messages/${line.id}/offer`, {})).statusCode).toBe(404);
    const sent = await hassan.post(`/v1/messages/${line.id}/offer`, {});
    expect(sent.conversationId).toBe(chat);
    expect(await hassan.post(`/v1/messages/${line.id}/offer`, {})).toEqual(sent);
    const there = (await messages(sarah, chat)).filter(
      (m) => m.body === 'I’ll be ten minutes late',
    );
    expect(there).toHaveLength(1);
    expect(there[0]).toMatchObject({ id: sent.messageId, senderId: hassan.user.id });
    // The line says it went, for every device of his.
    const done = (await messages(hassan, cai)).find((m) => m.id === line.id);
    expect(done.payload.offer.doneId).toBe(sent.messageId);
  });

  it('asks someone to do something in a question of their own', async () => {
    const cai = await open(hassan, CAI_ID);
    await send(hassan, cai, 'ask Sarah to send me the slides by Friday');
    expect((await answered(hassan, cai)).payload.offer).toMatchObject({
      kind: 'message',
      text: 'Could you send me the slides by Friday?',
    });
  });

  it('offers a call that starts on the device, and a search', async () => {
    const cai = await open(hassan, CAI_ID);
    await send(hassan, cai, 'video call Sarah');
    const call = await answered(hassan, cai);
    expect(call.body).toBe('Ready when you are: a video call with Sarah Smith.');
    expect(call.payload.offer).toMatchObject({ kind: 'call', conversationId: chat, video: true });
    expect((await hassan.req('POST', `/v1/messages/${call.id}/offer`, {})).statusCode).toBe(400);
    await send(hassan, cai, 'find the contract Ana sent');
    const find = await answered(hassan, cai);
    expect(find.body).toBe('Let’s look for “the contract Ana sent” in your conversations.');
    expect(find.payload.offer).toEqual({ kind: 'find', query: 'the contract Ana sent' });
  });

  it('proposes a meeting at the time said, as a card from them', async () => {
    const cai = await open(hassan, CAI_ID);
    await send(hassan, cai, 'set up a meeting with Sarah about the budget tomorrow at 3');
    const line = await answered(hassan, cai);
    // Three on his clock, Cairo's summer time: noon UTC.
    expect(line.payload.offer).toMatchObject({
      kind: 'meeting',
      conversationId: chat,
      meeting: { title: 'the budget', at: '2026-10-21T12:00:00.000Z', minutes: 30 },
    });
    expect(line.body).toBe(
      'Here’s a meeting about “the budget” for you and Sarah Smith: Tomorrow 3:00 PM, on Caime. Shall I send it?',
    );
    const sent = await hassan.post(`/v1/messages/${line.id}/offer`, {});
    const card = (await messages(sarah, chat)).find((m) => m.id === sent.messageId);
    expect(card).toMatchObject({ kind: 'kit', senderId: hassan.user.id });
    expect(card.payload.kit).toBe('meeting');
    expect(card.payload.fields).toMatchObject({
      title: 'the budget',
      start: { at: '2026-10-21T12:00:00.000Z', hasTime: true },
      durationMinutes: 30,
    });
  });

  it('asks what’s missing, and takes the next words as the answer', async () => {
    const cai = await open(hassan, CAI_ID);
    await send(hassan, cai, 'set up a meeting with Sarah on Thursday');
    expect((await answered(hassan, cai)).body).toBe(
      'When should the meeting with Sarah Smith be? A day and a time, like “tomorrow at 3”.',
    );
    // "at 10" with the Thursday said before: Thursday 10:00 on his clock.
    await send(hassan, cai, 'at 10');
    expect((await answered(hassan, cai)).payload.offer).toMatchObject({
      kind: 'meeting',
      meeting: { at: '2026-10-22T07:00:00.000Z' },
    });
    await send(hassan, cai, 'text Sarah');
    expect((await answered(hassan, cai)).body).toBe('What should I tell Sarah Smith?');
    await send(hassan, cai, 'Just checking in!');
    expect((await answered(hassan, cai)).payload.offer).toMatchObject({
      kind: 'message',
      text: 'Just checking in!',
    });
    // Words about something else are read as themselves.
    await send(hassan, cai, 'text Sarah');
    await answered(hassan, cai);
    await send(hassan, cai, 'what am I waiting on?');
    expect((await answered(hassan, cai)).payload?.offer).toBeUndefined();
  });

  it('asks which when two share a name, and says when it knows nobody by it', async () => {
    const sami = await signup(t, { displayName: 'Sami Ali' });
    const other = await signup(t, { displayName: 'Sami Haddad' });
    await connect(hassan, sami);
    await connect(hassan, other);
    const cai = await open(hassan, CAI_ID);
    await send(hassan, cai, 'call Sami');
    const which = await answered(hassan, cai);
    expect(which.body).toMatch(/^Which one do you mean: Sami (Ali|Haddad), Sami (Ali|Haddad)\?$/);
    expect(which.payload?.offer).toBeUndefined();
    await send(hassan, cai, 'Haddad');
    expect((await answered(hassan, cai)).payload.offer).toMatchObject({
      kind: 'call',
      to: { id: other.user.id, name: 'Sami Haddad' },
    });
    // A surname after the name picks one, and the words after it are the message.
    await send(hassan, cai, 'tell Sami Ali that I’m on my way');
    expect((await answered(hassan, cai)).payload.offer).toMatchObject({
      to: { id: sami.user.id },
      text: 'I’m on my way',
    });
    await send(hassan, cai, 'call Zed');
    expect((await answered(hassan, cai)).body).toBe('I don’t know who “Zed” is among your people.');
  });

  it('with AI assist, drafts what the rules don’t read, in the person’s voice', async () => {
    await hassan.patch('/v1/me', { aiEnabled: true });
    const cai = await open(hassan, CAI_ID);
    replies.push(
      caiSays('', {
        kind: 'message',
        who: 'Sarah',
        text: 'Is the report ready?',
        when: null,
        minutes: null,
        video: false,
        title: null,
      }),
    );
    const before = requests.length;
    await send(hassan, cai, 'could you check with Sarah whether the report is ready');
    const line = await answered(hassan, cai);
    expect(requests.length).toBe(before + 1);
    expect(line.payload.offer).toMatchObject({
      kind: 'message',
      conversationId: chat,
      text: 'Is the report ready?',
    });
    // The rules read first: a plain ask costs no model even with AI assist on.
    await send(hassan, cai, 'call Sarah');
    expect((await answered(hassan, cai)).payload.offer).toMatchObject({ kind: 'call' });
    expect(requests.length).toBe(before + 1);
    await hassan.patch('/v1/me', { aiEnabled: false });
  });

  it('is done by a friend as by Cai, and never past a block', async () => {
    const momo = await open(hassan, MOMO);
    await send(hassan, momo, 'message Sarah: the venue is booked');
    const line = await answered(hassan, momo);
    expect(line.senderId).toBe(MOMO);
    expect(line.payload.offer).toMatchObject({ kind: 'message', text: 'the venue is booked' });
    await sarah.post('/v1/blocks', { userId: hassan.user.id });
    expect((await hassan.req('POST', `/v1/messages/${line.id}/offer`, {})).statusCode).toBe(403);
  });
});
