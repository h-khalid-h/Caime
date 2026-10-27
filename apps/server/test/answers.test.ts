/**
 * One cited answer engine (M17 I4): a question in Cai's chat takes what search finds in the
 * person's own messages into the model call and the reply names the messages it rests on; a
 * question that isn't one takes nothing; Ask keeps a time the rules read in the person's words;
 * a meeting's brief cites the lines its summary rests on; every answer from passages is counted.
 * Ask, the catch-up and the brief read a call by Cai's write-up of it, cited as the call (I12b).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv4 } from '@caime/core';
import { CAI_ID } from '@caime/core/system-ids';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

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
let noorSam: string;

const say = async (c: Client, conversationId: string, body: string) =>
  (await c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body }))
    .message as { id: string; seq: number };
const messagesOf = async (c: Client, conversationId: string) =>
  (await c.get(`/v1/conversations/${conversationId}/messages`)).messages as Array<{
    senderId: string;
    body: string;
    payload: { sources?: unknown[] } | null;
  }>;
/** Cai's reply to the latest message: the job runs a moment after it. */
async function answered(c: Client, conversationId: string) {
  await t.ctx.flush();
  t.clock.advance(1000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
  return (await messagesOf(c, conversationId)).filter((m) => m.senderId === CAI_ID);
}

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
  const r = await noor.post('/v1/connections/requests', { toUserId: sam.user.id });
  noorSam = (await sam.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
  await noor.req('PATCH', '/v1/me', { aiEnabled: true });
});

afterAll(async () => {
  await t?.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

describe('one cited answer engine (M17 I4)', () => {
  it('answers a question in Cai’s chat from what search finds, naming the message it rests on', async () => {
    const deck = await say(sam, noorSam, 'Could you review the deck before Monday?');
    await say(sam, noorSam, 'Thanks!');
    await t.ctx.flush();
    const chat = (await noor.post('/v1/conversations', { kind: 'direct', userId: CAI_ID }))
      .conversation.id as string;
    modelSays({
      reply: 'Sam asked you to review the deck before Monday.',
      keep: null,
      act: null,
      sources: [1, 1, 7],
    });
    await say(noor, chat, 'What did Sam say about the deck?');
    const cai = await answered(noor, chat);
    const reply = cai.find((m) => m.body.includes('review the deck'));
    expect(reply).toBeTruthy();
    expect(reply?.payload?.sources).toEqual([
      {
        kind: 'message',
        conversationId: noorSam,
        messageId: deck.id,
        seq: deck.seq,
        // Search names a group's conversation; a chat of two is named by who wrote.
        title: null,
        who: 'Sam Rivera',
        at: expect.any(String),
      },
    ]);
    // The model saw search's rows as numbered passages beside the chat, nothing more.
    const sent = requests.at(-1)!;
    expect(sent.content).toContain('<found>\n[1] ');
    expect(sent.content).toContain('Sam Rivera: Could you review the deck before Monday?');
    expect(sent.content).toContain('</found>\n<conversation>');
    expect(sent.system).toContain('<found>, when it is there');
    expect(t.ctx.metrics.answers.get({ where: 'chat', cited: 'yes' })).toBe(1);
  });

  it('hands the model nothing found for a message that isn’t a question', async () => {
    const chat = (await noor.post('/v1/conversations', { kind: 'direct', userId: CAI_ID }))
      .conversation.id as string;
    modelSays({ reply: 'A sunny plan.', keep: null, act: null });
    await say(noor, chat, 'Plan a picnic for the team on the deck.');
    const cai = await answered(noor, chat);
    const reply = cai.find((m) => m.body === 'A sunny plan.');
    expect(reply).toBeTruthy();
    expect(reply?.payload?.sources).toBeUndefined();
    expect(requests.at(-1)?.content).not.toContain('<found>');
  });

  it('keeps a time the rules read in a question, in the person’s own words', async () => {
    modelSays({ answer: 'Sam asked you to review the deck.', sources: [1] });
    const r = await noor.post(`/v1/conversations/${noorSam}/ask`, {
      question: 'What did Sam ask for last week?',
    });
    expect(r.answer).toBe('Sam asked you to review the deck.');
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0]).toMatchObject({ kind: 'message', conversationId: noorSam, title: null });
    const sent = requests.at(-1)!;
    expect(sent.system).toContain('They asked about "last week": keep that phrase');
    expect(sent.system).toContain('a question about a conversation');
    expect(sent.content).toMatch(/^<found>\n\[1\] /);
  });

  it('a brief’s summary cites the lines it rests on', async () => {
    const first = await say(noor, noorSam, 'Draft is in. Thoughts on the pricing page?');
    const second = await say(sam, noorSam, 'Looks good. Can you send the deck before Thursday?');
    const card = (
      await noor.post(`/v1/conversations/${noorSam}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: {
            title: 'Weekly with Sam',
            start: {
              at: new Date(t.ctx.now().getTime() + 3 * 3_600_000).toISOString(),
              hasTime: true,
            },
            durationMinutes: 30,
          },
        },
      })
    ).message as { id: string };
    await sam.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    await t.ctx.flush();
    modelSays({ summary: 'Sam wants the deck before Thursday.', sources: [4, 3] });
    const brief = await noor.get(`/v1/messages/${card.id}/brief`);
    expect(brief.summary).toBe('Sam wants the deck before Thursday.');
    // The lines are numbered oldest first over the fortnight: the deck ask, the pricing draft…
    const cited = (brief.sources as Array<{ messageId: string; who: string }>).map(
      (s): [string, string] => [s.messageId, s.who],
    );
    expect(cited.length).toBeGreaterThanOrEqual(1);
    expect(cited.map((c) => c[0])).toContain(second.id);
    expect(cited.every((c) => [first.id, second.id].includes(c[0]) || c[1])).toBe(true);
    expect(t.ctx.metrics.answers.get({ where: 'brief', cited: 'yes' })).toBe(1);
  });
});

describe('a conversation’s calls, read by what Cai wrote up of them (M17 I12b)', () => {
  it('Ask, the catch-up and the brief read the write-up beside the call’s line, cited as the call', async () => {
    const lina = await signup(t, { displayName: 'Lina Haddad' });
    const omar = await signup(t, { displayName: 'Omar Said' });
    const r = await lina.post('/v1/connections/requests', { toUserId: omar.user.id });
    const convo = (await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
      .conversationId as string;
    await lina.req('PATCH', '/v1/me', { aiEnabled: true });
    await say(lina, convo, 'Can we talk about the launch?');
    const { call } = await lina.post(`/v1/conversations/${convo}/calls`, {
      kind: 'voice',
      deviceId: uuidv4(),
    });
    await omar.post(`/v1/calls/${call.id}/accept`, { deviceId: uuidv4() });
    t.clock.advance(10 * 60_000);
    await lina.post(`/v1/calls/${call.id}/end`, {});
    const line = await t.ctx.db
      .selectFrom('messages')
      .select(['id', 'seq'])
      .where('conversation_id', '=', convo)
      .where('kind', '=', 'system')
      .orderBy('seq', 'desc')
      .executeTakeFirstOrThrow();
    await t.ctx.db
      .insertInto('call_note_summaries')
      .values({
        call_id: call.id,
        conversation_id: convo,
        message_id: line.id,
        state: 'written',
        written_at: t.ctx.now(),
        summary: JSON.stringify({
          summary: 'The launch moves to May.',
          topics: [],
          decisions: [{ text: 'Launch in May.', at: null }],
          nextSteps: [{ who: 'Omar', what: 'Send the budget', due: 'Friday', at: null }],
        }),
      })
      .execute();
    const callSource = {
      kind: 'call',
      callId: call.id,
      conversationId: convo,
      seq: Number(line.seq),
      lineId: null,
      who: 'Cai',
    };

    modelSays({ answer: 'It moves to May.', sources: [2] });
    const asked = await lina.post(`/v1/conversations/${convo}/ask`, {
      question: 'When is the launch now?',
    });
    expect(asked.sources[0]).toMatchObject(callSource);
    expect(requests.at(-1)!.content).toContain(
      "Cai's notes: The launch moves to May. Decided: Launch in May. Next: Omar: Send the budget: by Friday.",
    );

    modelSays({ summary: 'You agreed on May.', sources: [2] });
    const caught = await lina.post(`/v1/conversations/${convo}/catch-up`, {});
    expect(caught.sources[0]).toMatchObject(callSource);
    expect(requests.at(-1)!.content).toContain("Cai's notes: The launch moves to May.");

    // The next time they meet, the brief reads what the last call decided.
    const card = (
      await lina.post(`/v1/conversations/${convo}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: {
            title: 'Launch weekly',
            start: {
              at: new Date(t.ctx.now().getTime() + 3 * 3_600_000).toISOString(),
              hasTime: true,
            },
            durationMinutes: 30,
          },
        },
      })
    ).message as { id: string };
    await omar.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    await t.ctx.flush();
    modelSays({ summary: 'Last time: the launch moved to May.', sources: [2] });
    const brief = await lina.get(`/v1/messages/${card.id}/brief`);
    expect(brief.summary).toBe('Last time: the launch moved to May.');
    expect(brief.sources[0]).toMatchObject(callSource);
    expect(requests.at(-1)!.content).toContain('Cai: Notes of the call: The launch moves to May.');
  });
});
