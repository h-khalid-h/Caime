import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv7 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { briefText, digestText, offerFollowUp } from '../src/lib/cai';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * Nothing from a private conversation is kept on the server (R18, M16 G7): no to-do or decision
 * is made for one however it's asked for, and whatever an older one says stays out of the
 * server's search, Ask Cai in Search, Cai's brief and digest, and its follow-up offers.
 */
let t: TestApp;
let stub: Server;
/** What each call to the Messages API stand-in was handed. */
const handed: string[] = [];
let ana: Client;
let ben: Client;
let open: string;
let secret: string;

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
}

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    handed.push(JSON.stringify(body.messages));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'msg_stub',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [
          {
            type: 'text',
            text: JSON.stringify({ answer: 'It’s in what you decided.', sources: [1] }),
          },
        ],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const { port } = stub.address() as AddressInfo;
  t = await createTestApp({
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
  });
  ana = await signup(t, { displayName: 'Ana Silva' });
  ben = await signup(t, { displayName: 'Ben Okafor' });
  await connect(ana, ben);
  open = (await ana.post('/v1/conversations', { kind: 'direct', userId: ben.user.id })).conversation
    .id;
  secret = (
    await ana.post('/v1/conversations', { kind: 'direct', userId: ben.user.id, private: true })
  ).conversation.id;
});

afterAll(async () => {
  await t?.close();
  await new Promise((done) => stub?.close(done));
});

const REFUSED = 'Nothing from a private conversation is kept on the server.';

describe('a private conversation keeps nothing on the server (R18, M16 G7)', () => {
  it('makes no to-do or decision for one, however it’s asked', async () => {
    const decided = await ana.req('POST', '/v1/decisions', {
      conversationId: secret,
      title: 'The garden for the party',
    });
    expect(decided.statusCode).toBe(400);
    expect(decided.json().error.message).toBe(REFUSED);
    const kept = await ana.req('POST', '/v1/tasks', {
      title: 'Pay the garden’s deposit',
      conversationId: secret,
    });
    expect(kept.statusCode).toBe(400);
    expect(kept.json().error.message).toBe(REFUSED);
    // A to-do of one's own, tied to nothing, and anything in a standard conversation, as before.
    expect((await ana.req('POST', '/v1/tasks', { title: 'Call the florist' })).statusCode).toBe(
      201,
    );
    expect(
      (
        await ana.req('POST', '/v1/decisions', {
          conversationId: open,
          title: 'The garden gate is painted green',
        })
      ).statusCode,
    ).toBe(201);
    const rows = await t.ctx.db
      .selectFrom('decisions')
      .select('title')
      .where('conversation_id', '=', secret)
      .execute();
    expect(rows).toEqual([]);
  });

  it('what an older one says stays out of search, Ask Cai, the brief, the digest and follow-ups', async () => {
    // Kept before the server refused them (or by any other way): a wait and a decision.
    const waitId = uuidv7();
    await t.ctx.db
      .insertInto('tasks')
      .values({
        id: waitId,
        owner_id: ana.user.id,
        assignee_id: ben.user.id,
        title: 'Garden deposit of 900',
        conversation_id: secret,
        cai_follow_up: true,
        created_at: t.ctx.now(),
        updated_at: t.ctx.now(),
      })
      .execute();
    await t.ctx.db
      .insertInto('decisions')
      .values({
        id: uuidv7(),
        conversation_id: secret,
        title: 'The garden is chosen',
        decided_by: ana.user.id,
        recorded_by: ana.user.id,
        decided_at: t.ctx.now(),
      })
      .execute();
    // Search finds the standard decision, never the private ones.
    const found = await ana.get('/v1/search?q=garden');
    const titles = [
      ...(found.results.tasks ?? []).map((x: { title: string }) => x.title),
      ...(found.results.decisions ?? []).map((x: { title: string }) => x.title),
    ];
    expect(titles).toContain('The garden gate is painted green');
    expect(titles).not.toContain('Garden deposit of 900');
    expect(titles).not.toContain('The garden is chosen');
    // Ask Cai in Search hands the model the standard one alone.
    await ana.patch('/v1/me', { aiEnabled: true });
    const answer = await ana.req('POST', '/v1/search/answer', { q: 'garden' });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(handed).toHaveLength(1);
    expect(handed[0]).toContain('The garden gate is painted green');
    expect(handed[0]).not.toContain('Garden deposit');
    expect(handed[0]).not.toContain('The garden is chosen');
    // Cai's brief and digest, kept in Cai's chat, say nothing of it.
    expect((await briefText(t.ctx, ana.user.id)).text).not.toMatch(/waiting on/);
    expect((await digestText(t.ctx, ana.user.id)).text).not.toContain('Garden deposit');
    // And its follow-up is a plain reminder, never an offer in Cai's chat.
    expect(
      await offerFollowUp(t.ctx, {
        id: waitId,
        owner_id: ana.user.id,
        assignee_id: ben.user.id,
        title: 'Garden deposit of 900',
        conversation_id: secret,
      }),
    ).toBe(false);
  });
});
