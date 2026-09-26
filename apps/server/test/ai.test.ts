import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/** A stand-in for the Messages API: records each request and answers from a queue. */
type Reply = { status: number; headers?: Record<string, string>; json: unknown };
const requests: Array<{ path: string; headers: IncomingHttpHeaders; body: any }> = [];
const replies: Reply[] = [];
let stub: Server;

const message = (text: string, stop = 'end_turn'): Reply => ({
  status: 200,
  json: {
    id: 'msg_stub',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: text ? [{ type: 'text', text }] : [],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  },
});
const refusal = (): Reply => message('', 'refusal');
const tooMany = (): Reply => ({
  status: 429,
  headers: { 'retry-after-ms': '1' },
  json: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
});

let t: TestApp;
let noor: Client;
let sam: Client;
let teen: Client;
let convo: string;

async function connect(a: Client, b: Client, relationship?: unknown): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id, relationship });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}
const say = async (c: Client, conversationId: string, body: string) =>
  (await c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body }))
    .message;
const last = () => requests[requests.length - 1]!;

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests.push({
      path: req.url ?? '',
      headers: req.headers,
      body: raw ? JSON.parse(raw) : null,
    });
    const r = replies.shift() ?? {
      status: 500,
      json: { type: 'error', error: { type: 'api_error', message: 'no reply queued' } },
    };
    res.writeHead(r.status, { 'content-type': 'application/json', ...r.headers });
    res.end(JSON.stringify(r.json));
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const { port } = stub.address() as AddressInfo;
  t = await createTestApp({
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
  });
  noor = await signup(t, { displayName: 'Noor Haddad', email: 'noor.haddad@example.com' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  teen = await signup(t, { displayName: 'Rami Teen', birthYear: 2011 });
  convo = await connect(noor, sam, { sphere: 'work', role: 'colleague', orgName: 'DATA C' });
});
afterAll(async () => {
  await t.close();
  await new Promise((done) => stub.close(done));
});
beforeEach(() => {
  replies.length = 0;
});

describe('AI assist (PRD §45, R17, R18)', () => {
  it('is off until the person turns it on, and for adults only', async () => {
    expect(await noor.get('/v1/ai')).toEqual({ available: true, enabled: false, eligible: true });
    const off = await noor.req('POST', '/v1/ai/rewrite', {
      text: 'send it',
      style: 'clearer',
      conversationId: convo,
    });
    expect(off.statusCode).toBe(403);
    expect(off.json().error.code).toBe('ai_off');

    await teen.patch('/v1/me', { aiEnabled: true });
    expect((await teen.get('/v1/ai')).eligible).toBe(false);
    const teenConvo = await connect(teen, sam);
    const minor = await teen.req('POST', '/v1/ai/rewrite', {
      text: 'send it',
      style: 'clearer',
      conversationId: teenConvo,
    });
    expect(minor.statusCode).toBe(403);
    expect(minor.json().error.code).toBe('ai_adults_only');

    await noor.patch('/v1/me', { aiEnabled: true });
    expect((await noor.get('/v1/ai')).enabled).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it('rewrites a draft in the relationship’s tone, sending only the draft', async () => {
    replies.push(message('“Could you send me the signed contract by Friday?”'));
    const r = await noor.post('/v1/ai/rewrite', {
      text: 'send me the signed contract by friday',
      style: 'formal',
      conversationId: convo,
    });
    // Quotes the model added are taken off; the label always travels with it.
    expect(r).toEqual({
      suggestion: 'Could you send me the signed contract by Friday?',
      label: 'Suggested by Caishy',
    });
    const sent = last();
    expect(sent.path).toMatch(/^\/v1\/messages/);
    expect(sent.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(sent.body).toMatchObject({
      model: 'claude-opus-5',
      fallbacks: 'default',
      output_config: { effort: 'low' },
      messages: [
        { role: 'user', content: '<message>\nsend me the signed contract by friday\n</message>' },
      ],
    });
    // Noor filed Sam under work: the professional tone applies.
    expect(sent.body.system).toContain('more formal');
    expect(sent.body.system).toContain('keep it professional');
    const everything = JSON.stringify(sent.body);
    for (const secret of [noor.user.id, sam.user.id, 'noor.haddad@example.com', convo])
      expect(everything).not.toContain(secret);
  });

  it('translates a message into the reader’s language', async () => {
    const m = await say(sam, convo, 'هل وصل العقد؟');
    replies.push(message('Did the contract arrive?'));
    const r = await noor.post('/v1/ai/translate', { messageId: m.id });
    expect(r).toEqual({
      translation: 'Did the contract arrive?',
      to: 'en',
      language: 'English',
      label: 'Suggested by Caishy',
    });
    expect(last().body.system).toContain('into English');
    expect(last().body.messages[0].content).toContain('هل وصل العقد؟');
    // Only people in the conversation can have its messages translated.
    const outsider = await signup(t, { displayName: 'Outsider' });
    await outsider.patch('/v1/me', { aiEnabled: true });
    const before = requests.length;
    const denied = await outsider.req('POST', '/v1/ai/translate', { messageId: m.id });
    const missing = await outsider.req('POST', '/v1/ai/translate', { messageId: uuidv4() });
    expect(denied.statusCode).toBe(404);
    expect(denied.json()).toEqual(missing.json());
    expect(requests.length).toBe(before);
  });

  it('catches the reader up on what arrived since they last read', async () => {
    const lina = await signup(t, { displayName: 'Lina Aziz' });
    const c = await connect(lina, noor);
    await say(noor, c, 'Are we still on for the venue visit?');
    await say(lina, c, 'Yes. I booked Thursday 11am.');
    await say(lina, c, 'Can you bring the floor plan?');
    replies.push(
      message(
        'Lina booked the venue visit for Thursday at 11am and asked you to bring the floor plan.',
      ),
    );
    const r = await noor.post(`/v1/conversations/${c}/catch-up`, {});
    expect(r).toEqual({
      summary:
        'Lina booked the venue visit for Thursday at 11am and asked you to bring the floor plan.',
      label: 'Suggested by Caishy',
      newCount: 2,
    });
    const sent = last().body;
    const lines = sent.messages[0].content.split('\n').slice(1, -1);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^\[1\] Wed 23 Sep 10:00 · You: Are we still on/);
    expect(sent.system).toContain('Today is Wednesday 23 September 2026.');
    expect(lines[2]).toMatch(/^\[3\] .* · Lina Aziz: Can you bring the floor plan\?$/);
    expect(sent.system).toContain('Lines from [2] on arrived since the reader last looked');
    expect(sent.system).toContain('in English');
    // An empty conversation needs no model.
    const quiet = await connect(noor, teen);
    const before = requests.length;
    expect(await noor.post(`/v1/conversations/${quiet}/catch-up`, {})).toEqual({
      summary: null,
      label: null,
      newCount: 0,
    });
    expect(requests.length).toBe(before);
  });

  it('finds follow-ups as suggestions, once, with dates read by the server', async () => {
    const omar = await signup(t, { displayName: 'Omar Farouk' });
    const c = await connect(noor, omar);
    const ask = await say(omar, c, 'Could you send the signed contract by Friday 3pm?');
    await say(noor, c, 'Sure.');
    const agreed = await say(omar, c, 'Then we go with the blue venue. I’ll confirm the caterer.');
    await t.ctx.flush();
    const found = {
      items: [
        { kind: 'task', title: 'Send the signed contract', who: null, due: 'Friday 3pm', line: 1 },
        { kind: 'decision', title: 'Go with the blue venue', who: null, due: null, line: 3 },
        { kind: 'waiting', title: 'Confirm the caterer', who: 'Omar', due: null, line: 3 },
        { kind: 'task', title: 'Not a real line', who: null, due: null, line: 99 },
      ],
    };
    const findActions = async () => {
      replies.push(message(JSON.stringify(found)));
      const r = await noor.post(`/v1/conversations/${c}/ai/actions`, {});
      expect(r.label).toBe('Suggested by Caishy');
      return Object.fromEntries(r.found.map((s: any) => [s.kind, s]));
    };
    const heuristic = (await noor.get(`/v1/suggestions?conversationId=${c}`)).suggestions;
    expect(heuristic.map((s: any) => s.kind).sort()).toEqual(['task', 'waiting']);

    // What the heuristics already offered for a message isn't offered twice.
    const first = await findActions();
    expect(last().body.output_config).toMatchObject({
      effort: 'medium',
      format: { type: 'json_schema' },
    });
    expect(Object.keys(first)).toEqual(['decision']);
    expect(first.decision).toMatchObject({
      title: 'Go with the blue venue',
      messageId: agreed.id,
      payload: { source: 'ai', decidedBy: omar.user.id },
    });

    // Without them, the model's task and waiting item are offered, dates read by the server.
    await t.ctx.db
      .deleteFrom('suggestions')
      .where(
        'id',
        'in',
        heuristic.map((s: any) => s.id),
      )
      .execute();
    const second = await findActions();
    expect(Object.keys(second).sort()).toEqual(['task', 'waiting']);
    expect(second.task).toMatchObject({
      title: 'Send the signed contract',
      rationale: 'Omar wrote “Could you send the signed contract by Friday 3pm?”',
      messageId: ask.id,
      // Friday 3pm after Wednesday 10:00 in New York.
      dueAt: '2026-09-25T19:00:00.000Z',
      dueText: 'Friday 3pm',
      payload: { source: 'ai', dueHasTime: true },
    });
    expect(second.waiting).toMatchObject({ subjectUserId: omar.user.id, messageId: agreed.id });

    // They are ordinary suggestions: listed, and accepted with a tap.
    const listed = await noor.get(`/v1/suggestions?conversationId=${c}`);
    expect(listed.suggestions).toHaveLength(3);
    const accepted = await noor.post(`/v1/suggestions/${second.task.id}/accept`, {});
    expect(accepted.accepted.type).toBe('task');
    // Asking again finds nothing new, including what was accepted or dismissed.
    await noor.post(`/v1/suggestions/${second.waiting.id}/dismiss`, {});
    expect(await findActions()).toEqual({});
  });

  it('never reads a private conversation', async () => {
    const priya = await signup(t, { displayName: 'Priya Shah' });
    const c = await connect(noor, priya);
    const m = await say(priya, c, 'Only for us.');
    await t.ctx.db
      .updateTable('conversations')
      .set({ privacy_class: 'private' })
      .where('id', '=', c)
      .execute();
    const before = requests.length;
    for (const [url, body] of [
      ['/v1/ai/rewrite', { text: 'hi', style: 'shorter', conversationId: c }],
      ['/v1/ai/translate', { messageId: m.id }],
      [`/v1/conversations/${c}/catch-up`, {}],
      [`/v1/conversations/${c}/ai/actions`, {}],
    ] as const) {
      const res = await noor.req('POST', url, body);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('ai_private');
    }
    expect(requests.length).toBe(before);
  });

  it('says so plainly when the model declines, is busy, or isn’t configured', async () => {
    const draft = { text: 'hello there', style: 'friendly', conversationId: convo };
    replies.push(refusal());
    const declined = await noor.req('POST', '/v1/ai/rewrite', draft);
    expect(declined.statusCode).toBe(422);
    expect(declined.json().error.code).toBe('ai_declined');

    // Rate limited three times in a row (the first try and two retries).
    replies.push(tooMany(), tooMany(), tooMany());
    const before = requests.length;
    const busy = await noor.req('POST', '/v1/ai/rewrite', draft);
    expect(busy.statusCode).toBe(503);
    expect(busy.json().error.code).toBe('ai_busy');
    expect(requests.length - before).toBe(3);

    const ai = t.ctx.ai;
    t.ctx.ai = null;
    try {
      expect((await noor.get('/v1/ai')).available).toBe(false);
      const none = await noor.req('POST', '/v1/ai/rewrite', draft);
      expect(none.statusCode).toBe(503);
      expect(none.json().error.code).toBe('ai_unavailable');
    } finally {
      t.ctx.ai = ai;
    }
  });
  it('records every call (feature, model, tokens, outcome) and never the text', async () => {
    await t.ctx.flush();
    const runs = await t.ctx.db
      .selectFrom('ai_runs')
      .selectAll()
      .where('user_id', '=', noor.user.id)
      .orderBy('created_at')
      .execute();
    expect(runs.map((r) => `${r.feature} ${r.outcome}`)).toEqual([
      'rewrite ok',
      'translate ok',
      'catch-up ok',
      'actions ok',
      'actions ok',
      'actions ok',
      'rewrite declined',
      'rewrite busy',
    ]);
    // The model that answered and what it cost; a call that never got an answer has no usage.
    expect(runs[0]).toMatchObject({
      provider: 'anthropic',
      model: 'claude-opus-5',
      input_tokens: 10,
      output_tokens: 5,
    });
    expect(runs.at(-1)).toMatchObject({ input_tokens: null, output_tokens: null });
    // They are the person's own data: in their export, as what and when.
    const archive = JSON.parse((await noor.req('GET', '/v1/me/export')).body);
    expect(archive.aiAssist).toHaveLength(8);
    expect(archive.aiAssist[0]).toEqual({
      feature: 'rewrite',
      model: 'claude-opus-5',
      outcome: 'ok',
      at: expect.any(String),
    });
    expect(Object.keys(runs[0]!).sort()).toEqual([
      'created_at',
      'feature',
      'id',
      'input_tokens',
      'latency_ms',
      'model',
      'outcome',
      'output_tokens',
      'provider',
      'user_id',
    ]);
  });
});

describe('AI assist with an organization (R15)', () => {
  it('a customer’s catch-up names the organization, never who on its team wrote', async () => {
    const dina = await signup(t, { displayName: 'Dina Customer' });
    await dina.patch('/v1/me', { aiEnabled: true });
    const { org } = await sam.post('/v1/orgs', {
      name: 'Rivera Tiles',
      handle: 'rivera.tiles',
      kind: 'shop',
    });
    const { conversationId } = await dina.post(`/v1/orgs/${org.id}/conversations`);
    await say(dina, conversationId, 'Do you have the blue tiles in stock?');
    await say(sam, conversationId, 'We do! 40 boxes. Want me to hold some?');
    replies.push(message('Rivera Tiles has the blue tiles in stock and offered to hold some.'));
    await dina.post(`/v1/conversations/${conversationId}/catch-up`, {});
    const transcript = last().body.messages[0].content as string;
    expect(transcript).toContain('Rivera Tiles: We do! 40 boxes.');
    expect(transcript).not.toContain('Sam Rivera');
    // What's open with an organization is its inbox's to track.
    const follow = await dina.req('POST', `/v1/conversations/${conversationId}/ai/actions`, {});
    expect(follow.json().error.code).toBe('ai_business');
  });
});

describe('AI assist and plans (PRD §84, R23)', () => {
  it('Personal includes ten a day; the eleventh waits, and says until when', async () => {
    const ava = await signup(t, { displayName: 'Ava Stone' });
    await ava.patch('/v1/me', { aiEnabled: true });
    const avaConvo = await connect(ava, sam);
    const rewrite = () =>
      ava.req('POST', '/v1/ai/rewrite', {
        text: 'can we move it to 3',
        style: 'clearer',
        conversationId: avaConvo,
      });
    // Failed calls don't count; the first ok one, an hour ago, is the oldest of today's ten.
    const at = (minutesAgo: number) => new Date(t.clock.now.getTime() - minutesAgo * 60_000);
    const runs = [
      ...Array.from({ length: 10 }, (_, i) => ({ outcome: 'ok', created_at: at(60 - i) })),
      { outcome: 'busy', created_at: at(5) },
      { outcome: 'ok', created_at: at(25 * 60) }, // yesterday's
    ];
    await t.ctx.db
      .insertInto('ai_runs')
      .values(
        runs.map((r) => ({
          id: uuidv4(),
          user_id: ava.user.id,
          feature: 'rewrite',
          provider: 'anthropic',
          ...r,
        })),
      )
      .execute();
    const before = requests.length;
    const refused = await rewrite();
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toMatchObject({
      code: 'plan_limit',
      details: { nextAt: new Date(at(60).getTime() + 86_400_000).toISOString() },
    });
    // A day after her oldest (13:00 UTC), in Ava's time zone (New York): tomorrow at 9:00 AM.
    expect(refused.json().error.message).toMatch(
      /^You’ve used today’s 10 AI assists\. The next one is ready tomorrow at 9:00\sAM\. Pro includes 200 a day\.$/,
    );
    expect(requests.length).toBe(before); // The model was never asked.
    expect((await ava.get('/v1/me/plan')).used.aiToday).toBe(10);

    // Once the oldest of the ten is a day old, one is free again.
    t.clock.advance(23 * 3_600_000 + 30_000);
    expect((await ava.get('/v1/me/plan')).used.aiToday).toBe(9);
    replies.push(message('Can we move it to 3?'));
    expect((await rewrite()).statusCode).toBe(200);
    expect((await rewrite()).statusCode).toBe(403);
  });
});
