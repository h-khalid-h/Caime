/**
 * What someone missed (M17 I3, R66): the conversations with something new, ranked as Attention
 * ranks them (Needs-you first), each read since this person last read it by the rules (asked of them,
 * promised, decided, a card ahead); a cited summary from the model for someone with AI assist
 * on, kept by read position; Cai's chat answering "what did I miss" from the same.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv4 } from '@caime/core';
import { CAI_ID } from '@caime/core/system-ids';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp, until } from './helpers';

type Reply = { status: number; json: unknown };
const replies: Reply[] = [];
const requests: Array<{ system: string; content: string }> = [];
const modelSays = (json: unknown) =>
  replies.push({
    status: 200,
    json: {
      id: 'msg_stub',
      type: 'message',
      role: 'assistant',
      model: 'claude-test-light',
      content: [{ type: 'text', text: JSON.stringify(json) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  });

let stub: Server;
let t: TestApp;
let noor: Client;
let sam: Client;
let leila: Client;

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}
const say = async (c: Client, conversationId: string, body: string) =>
  (await c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body }))
    .message as { id: string; seq: number };
const missed = (c: Client, summary = false) =>
  c.get(`/v1/attention/missed${summary ? '?summary=1' : ''}`);

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? (JSON.parse(raw) as { system?: unknown; messages?: unknown }) : {};
    const system = Array.isArray(body.system)
      ? (body.system as Array<{ text?: string }>).map((b) => b.text ?? '').join('\n')
      : String(body.system ?? '');
    const first = (body.messages as Array<{ content: unknown }> | undefined)?.[0]?.content;
    requests.push({ system, content: typeof first === 'string' ? first : JSON.stringify(first) });
    const r = replies.shift() ?? {
      status: 500,
      json: { type: 'error', error: { type: 'api_error', message: 'no reply queued' } },
    };
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.json));
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const { port } = stub.address() as AddressInfo;
  t = await createTestApp({
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    ANTHROPIC_MODEL_LIGHT: 'claude-test-light',
  });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  leila = await signup(t, { displayName: 'Leila Nasser' });
});

afterAll(async () => {
  await t?.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

describe('what someone missed (M17 I3)', () => {
  let noorSam: string;
  let noorLeila: string;

  it('lists the Needs-you conversations with something new, each read by the rules', async () => {
    noorSam = await connect(noor, sam);
    noorLeila = await connect(noor, leila);
    await say(sam, noorSam, 'Can you send me the contract by Friday?');
    await say(sam, noorSam, "I'll bring the keys tomorrow morning");
    await say(sam, noorSam, 'Thanks, see you then');
    await say(leila, noorLeila, 'We decided to go with the blue one');
    await t.ctx.flush();

    const recap = await missed(noor);
    expect(recap.summary).toBeNull();
    expect(recap.label).toBeNull();
    expect(recap.more).toBe(0);
    expect(recap.unread).toBe(4);
    const titles = recap.conversations.map((c: { title: string }) => c.title);
    expect(titles).toHaveLength(2);
    expect(titles).toContain('Sam Rivera');
    expect(titles).toContain('Leila Nasser');
    const withSam = recap.conversations.find((c: { id: string }) => c.id === noorSam);
    expect(withSam.unread).toBe(3);
    expect(withSam.kind).toBe('direct');
    expect(withSam.firstNewSeq).toBeGreaterThan(0);
    // What asks of Noor first, then the promise; "thanks" is nothing to catch up on.
    expect(withSam.lines.map((l: { kind: string; who: string }) => [l.kind, l.who])).toEqual([
      ['ask', 'Sam Rivera'],
      ['promise', 'Sam Rivera'],
    ]);
    expect(withSam.lines[0].text).toBe('Can you send me the contract by Friday?');
    const withLeila = recap.conversations.find((c: { id: string }) => c.id === noorLeila);
    expect(withLeila.lines.map((l: { kind: string }) => l.kind)).toEqual(['decision']);
    // Nobody wrote to Sam: nothing missed.
    const sams = await missed(sam);
    expect(sams.conversations).toEqual([]);
    expect(sams.unread).toBe(0);
  });

  it('is gone once read, and never reads a private conversation', async () => {
    await noor.post(`/v1/conversations/${noorLeila}/receipts`, { read: 1000 });
    const recap = await missed(noor);
    expect(recap.conversations.map((c: { id: string }) => c.id)).toEqual([noorSam]);
    expect(recap.unread).toBe(3);
  });

  it('sums it up for someone with AI assist on, cites its lines, and keeps it by read position', async () => {
    // Without assist, the summary is refused as any assist is.
    const refused = await noor.req('GET', '/v1/attention/missed?summary=1');
    expect(refused.statusCode).toBe(403);
    await noor.patch('/v1/me', { aiEnabled: true });

    modelSays({
      answer: 'Sam asked you for the contract by Friday and will bring the keys.',
      sources: [1, 2, 9],
    });
    const recap = await missed(noor, true);
    expect(recap.label).toBe('Suggested by Cai');
    expect(recap.summary.text).toBe(
      'Sam asked you for the contract by Friday and will bring the keys.',
    );
    // The sources are the lines cited, in order, never a number there's no line for.
    expect(
      recap.summary.sources.map((s: { conversationId: string; seq: number }) => s.conversationId),
    ).toEqual([noorSam, noorSam]);
    expect(recap.summary.sources[0].title).toBe('Sam Rivera');
    expect(recap.summary.sources[0].seq).toBeLessThan(recap.summary.sources[1].seq);
    const asked = requests.filter((r) => r.system.includes('what they missed'));
    expect(asked).toHaveLength(1);
    expect(asked[0]?.content).toContain('[1] ');
    expect(asked[0]?.content).toContain('Sam Rivera: Can you send me the contract by Friday?');
    // Noor's own words never reach it; nor the conversation read already.
    expect(asked[0]?.content).not.toContain('blue one');

    // The same recap again asks the model nothing.
    const again = await missed(noor, true);
    expect(again.summary.text).toBe(recap.summary.text);
    expect(requests.filter((r) => r.system.includes('what they missed'))).toHaveLength(1);

    // A new message moves the read position: asked again, with the new line.
    await say(sam, noorSam, 'And could you call the venue?');
    await t.ctx.flush();
    modelSays({ answer: 'Sam also asks you to call the venue.', sources: [3] });
    const moved = await missed(noor, true);
    expect(moved.summary.text).toBe('Sam also asks you to call the venue.');
    expect(moved.summary.sources.map((s: { seq: number }) => s.seq)).toHaveLength(1);
    expect(requests.filter((r) => r.system.includes('what they missed'))).toHaveLength(2);
    expect(requests.at(-1)?.content).toContain('And could you call the venue?');
  });

  it('answers "what did I miss" in Cai’s chat by the rules, with the summary when it may', async () => {
    const chat = (await noor.post('/v1/conversations', { kind: 'direct', userId: CAI_ID }))
      .conversation.id as string;
    await say(noor, chat, 'What did I miss?');
    await t.ctx.flush();
    // Cai answers a moment after the message (the `system.reply` job, 800 ms out).
    t.clock.advance(1000);
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    const caiSaid = async () => {
      const p = await noor.get(`/v1/conversations/${chat}/messages`);
      return (p.messages as Array<{ senderId: string; body: string }>).find(
        (m) => m.senderId === CAI_ID && m.body.includes('Sam Rivera'),
      );
    };
    await until(async () => (await caiSaid()) !== undefined);
    const reply = await caiSaid();
    expect(reply?.body).toContain('You missed 4 new messages in 1 conversation.');
    expect(reply?.body).toContain('Asked of you: Can you send me the contract by Friday?');
    expect(reply?.body).toContain('Promised: I');
    // The same read position as the recap above: its summary, the model asked nothing new.
    expect(reply?.body).toContain('In short: Sam also asks you to call the venue.');
    expect(requests.filter((r) => r.system.includes('what they missed'))).toHaveLength(2);
  });

  it('reads nothing once there is nothing, and says so in the chat', async () => {
    await noor.post(`/v1/conversations/${noorSam}/receipts`, { read: 1000 });
    const recap = await missed(noor, true);
    expect(recap).toEqual({ conversations: [], unread: 0, more: 0, summary: null, label: null });
  });
});
