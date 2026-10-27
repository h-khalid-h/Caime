/**
 * Cai answers for someone who turned it on (R116, M17 I16a, I16a2, ADR-18): a stranger's message
 * request is met by Cai's introduction with two choices; leaving the message changes nothing;
 * talking spends the stranger's own allowance, Cai answering from what the stranger may know of the
 * receiver alone, until it has what they need; the receiver is told in their own chat with Cai,
 * and their own reply ends it. The people they know, by the ways they picked, are met after the
 * wait they chose or while they're busy, on the receiver's allowance for those they cover (two a
 * caller a day), and what can't wait reaches them at once for those they picked. Never for someone
 * under 18, never as a member, never their account.
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
      // Cai's answer says whether it can't wait; nothing does unless the case says so.
      content: [{ type: 'text', text: JSON.stringify({ urgent: false, ...(json as object) }) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  });

let stub: Server;
let t: TestApp;
let sara: Client;

const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  days: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
  leadMinutes: 60,
  horizonDays: 14,
};
const LOGO = {
  id: 'logo',
  name: 'Logo design call',
  price: { value: 80, currency: 'EUR' },
  unit: 'minutes',
  minutes: 60,
  capacity: 1,
  maxQuantity: 1,
  audience: 'public',
  providers: null,
  askTopic: false,
};

const words = (body: string) => ({ clientId: uuidv4(), kind: 'text', body });
/** A stranger's request to Sara: their one-to-one, and their first message in it. */
async function writesToSara(name: string, body: string, opts: { ai?: boolean } = {}) {
  const who = await signup(t, { displayName: name });
  if (opts.ai !== false) await who.req('PATCH', '/v1/me', { aiEnabled: true });
  const id = (await who.post('/v1/conversations', { kind: 'direct', userId: sara.user.id }))
    .conversation.id as string;
  await who.post(`/v1/conversations/${id}/messages`, words(body));
  await t.ctx.flush();
  return { who, id };
}
const linesIn = async (c: Client, id: string) =>
  (await c.get(`/v1/conversations/${id}/messages`)).messages as Array<{
    id: string;
    senderId: string;
    body: string;
    payload: Record<string, unknown>;
  }>;
const caiLines = async (c: Client, id: string) =>
  (await linesIn(c, id)).filter((m) => m.senderId === CAI_ID);
/** The job's answer to the latest line, a moment after it. */
async function answered() {
  await t.ctx.flush();
  t.clock.advance(1000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
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
  t.clock.set('2026-10-01T05:00:00Z');
  sara = await signup(t, { displayName: 'Sara Designer' });
  await sara.req('PATCH', '/v1/me', {
    aiEnabled: true,
    headline: 'Brand designer in Cairo',
    preferences: { caiAnswers: { strangers: true } },
  });
  const set = await sara.req('PUT', '/v1/me/booking', { booking: HOURS, items: [LOGO] });
  expect(set.statusCode, set.body).toBe(200);
});

afterAll(async () => {
  await t?.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

describe('Cai answers a stranger for someone who turned it on (M17 I16a)', () => {
  it('introduces itself for them with two choices, as Cai and never a member', async () => {
    const { who, id } = await writesToSara('Omar Client', 'Hello, do you design logos?');
    const [intro] = await caiLines(who, id);
    expect(intro?.body).toBe(
      'Hi Omar, I’m Cai, an AI assistant answering for Sara Designer on Caime. Sara Designer hasn’t read your message yet. You can leave it for them, or talk to me now: I can tell you what Sara Designer offers and pass on what you need.',
    );
    expect(intro?.payload).toEqual({ answering: { for: sara.user.id, offer: ['leave', 'talk'] } });
    // Sara reads it too, and it's still her request to answer; Cai is in nobody's list of people.
    expect((await caiLines(sara, id)).map((m) => m.id)).toEqual([intro?.id]);
    const view = (await who.get(`/v1/conversations/${id}`)).conversation;
    expect(view.participants.map((p: { userId: string }) => p.userId).sort()).toEqual(
      [who.user.id, sara.user.id].sort(),
    );
    expect(view.caiAnswering).toEqual({
      state: 'offered',
      receiverId: sara.user.id,
      side: 'caller',
      talk: true,
      covered: false,
    });
    expect((await sara.get(`/v1/conversations/${id}`)).conversation.request).toBe('incoming');
    // Sending more still waits on Sara, until they choose to talk to Cai.
    expect(
      (await who.req('POST', `/v1/conversations/${id}/messages`, words('Are you there?')))
        .statusCode,
    ).toBe(403);
  });

  it('leaves the message as it was when they choose to', async () => {
    const { who, id } = await writesToSara('Lina Visitor', 'A question for later.');
    await who.post(`/v1/conversations/${id}/cai-answer`, { choice: 'leave' });
    const lines = await caiLines(who, id);
    expect(lines.at(-1)?.body).toBe(
      'Your message stays for Sara Designer, who answers when they can.',
    );
    expect((await who.get(`/v1/conversations/${id}`)).conversation.caiAnswering.state).toBe('left');
    const again = await who.req('POST', `/v1/conversations/${id}/cai-answer`, { choice: 'talk' });
    expect(again.statusCode).toBe(400);
    // Nothing went to the model.
    expect(requests).toHaveLength(0);
  });

  it('talks on the stranger’s allowance, from what they may know of Sara alone, then tells Sara', async () => {
    // Something of Sara's they mustn't hear of: another conversation's words.
    const friend = await signup(t, { displayName: 'Friend Private' });
    const r = await sara.post('/v1/connections/requests', { toUserId: friend.user.id });
    const theirs = (await friend.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
      .conversationId;
    await sara.post(`/v1/conversations/${theirs}/messages`, words('The secret word is pistachio.'));
    const { who, id } = await writesToSara('Karim Buyer', 'Hi Sara, I need a logo.');
    await who.post(`/v1/conversations/${id}/cai-answer`, { choice: 'talk' });
    expect((await caiLines(who, id)).at(-1)?.body).toBe(
      'Go ahead: what would you like Sara Designer to know?',
    );
    modelSays({
      reply: 'Sara offers a logo design call, 60 minutes.',
      done: false,
      summary: 'Karim wants a logo.',
    });
    const asked = await who.req(
      'POST',
      `/v1/conversations/${id}/messages`,
      words('How much is a logo, and can I book?'),
    );
    expect(asked.statusCode, asked.body).toBe(201);
    expect(asked.json().message.payload).toEqual({ toCai: true });
    await answered();
    const sent = requests.at(-1)!;
    expect(sent.system).toContain('answering for Sara Designer');
    expect(sent.content).toContain('Name: Sara Designer');
    expect(sent.content).toContain('What they do: Brand designer in Cairo');
    expect(sent.content).toMatch(/Offers: Logo design call, 60 min, .*80.*; booked at http/);
    expect(sent.content).not.toContain('pistachio');
    expect(sent.content).not.toContain('Friend Private');
    expect((await caiLines(who, id)).at(-1)?.body).toBe(
      'Sara offers a logo design call, 60 minutes.',
    );
    // The turn spent the stranger's allowance, never Sara's.
    const runs = await t.ctx.db
      .selectFrom('ai_runs')
      .select(['user_id', 'feature'])
      .where('feature', '=', 'cai-answer')
      .execute();
    expect(runs).toEqual([{ user_id: who.user.id, feature: 'cai-answer' }]);
    // Done: Cai passes it on, and Sara hears it in her own chat with Cai.
    modelSays({
      reply: 'Thanks, I’ll pass this on to Sara.',
      done: true,
      summary: 'Karim wants a logo and asked the price.',
    });
    await who.post(`/v1/conversations/${id}/messages`, words('Great, thanks, that’s all.'));
    await answered();
    expect((await who.get(`/v1/conversations/${id}`)).conversation.caiAnswering.state).toBe(
      'ended',
    );
    const chat = (await sara.post('/v1/conversations', { kind: 'direct', userId: CAI_ID }))
      .conversation.id;
    const told = (await linesIn(sara, chat)).find((m) => m.payload?.answered);
    expect(told?.body).toBe(
      'Karim Buyer wrote to you and talked with me. Karim wants a logo and asked the price. Their message is in your requests: reply, or leave it.',
    );
    expect(told?.payload.answered).toEqual({ conversationId: id, callerId: who.user.id });
    const notes = (await sara.get('/v1/notifications')).notifications as Array<{ title: string }>;
    expect(notes.some((n) => n.title === 'Cai talked with Karim Buyer for you')).toBe(true);
    // Over, it takes nothing more past the request's rule.
    expect(
      (await who.req('POST', `/v1/conversations/${id}/messages`, words('One more thing')))
        .statusCode,
    ).toBe(403);
  });

  it('stops once Sara answers herself', async () => {
    const { who, id } = await writesToSara('Mona Asker', 'Do you do websites?');
    await who.post(`/v1/conversations/${id}/cai-answer`, { choice: 'talk' });
    await sara.post(`/v1/conversations/${id}/messages`, words('Hi Mona, I do!'));
    await t.ctx.flush();
    expect((await who.get(`/v1/conversations/${id}`)).conversation.caiAnswering.state).toBe(
      'ended',
    );
    const before = requests.length;
    await who.post(`/v1/conversations/${id}/messages`, words('Great, when?'));
    await answered();
    expect(requests.length).toBe(before);
  });

  it('offers only leaving to someone without AI assist, and nothing at all under 18', async () => {
    const { who, id } = await writesToSara('Nadia Plain', 'Hello!', { ai: false });
    expect((await caiLines(who, id))[0]?.payload).toEqual({ answering: { for: sara.user.id } });
    expect(
      (await who.req('POST', `/v1/conversations/${id}/cai-answer`, { choice: 'talk' })).statusCode,
    ).toBe(403);
    const teen = await signup(t, { displayName: 'Teen Writer', birthDate: '2011-01-01' });
    const asked = await teen.req('POST', '/v1/conversations', {
      kind: 'direct',
      userId: sara.user.id,
    });
    if (asked.statusCode === 200 || asked.statusCode === 201) {
      const tid = asked.json().conversation.id;
      await teen.req('POST', `/v1/conversations/${tid}/messages`, words('hi'));
      await t.ctx.flush();
      expect(await caiLines(teen, tid)).toEqual([]);
    }
  });
});

describe('Cai answers the people someone knows, as they chose (M17 I16a2)', () => {
  let rania: Client;
  /** Someone Rania knows one way, connected by her request: their one-to-one. */
  async function knownTo(name: string, sphere: string, role: string, opts: { ai?: boolean } = {}) {
    const who = await signup(t, { displayName: name });
    if (opts.ai !== false) await who.req('PATCH', '/v1/me', { aiEnabled: true });
    const r = await rania.post('/v1/connections/requests', {
      toUserId: who.user.id,
      relationship: { sphere, role },
    });
    const id = (await who.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
      .conversationId as string;
    return { who, id };
  }
  /** The minutes she chose pass, and the waits that came due run. */
  async function waited(minutes: number) {
    await t.ctx.flush();
    t.clock.advance(minutes * 60_000);
    await runDueJobs(t.ctx);
    await t.ctx.flush();
  }

  beforeAll(async () => {
    rania = await signup(t, { displayName: 'Rania Lawyer' });
    await rania.req('PATCH', '/v1/me', {
      aiEnabled: true,
      preferences: {
        caiAnswers: {
          strangers: false,
          spheres: ['work', 'customer'],
          after: 30,
          whileBusy: true,
          covers: ['customer'],
          coverMonthly: 5,
          ringThrough: ['customer'],
        },
      },
    });
  });

  it('meets a colleague after the wait she chose, on the colleague’s allowance, and not a friend', async () => {
    const { who: friend, id: withFriend } = await knownTo('Fadi Friend', 'friend', 'friend');
    await friend.post(`/v1/conversations/${withFriend}/messages`, words('Dinner tonight?'));
    const { who, id } = await knownTo('Walid Colleague', 'work', 'colleague');
    await who.post(`/v1/conversations/${id}/messages`, words('Did you see the contract?'));
    await waited(10);
    expect(await caiLines(who, id)).toEqual([]);
    await waited(25);
    expect(await caiLines(friend, withFriend)).toEqual([]);
    const [intro] = await caiLines(who, id);
    expect(intro?.body).toBe(
      'Hi Walid, I’m Cai, an AI assistant answering for Rania Lawyer on Caime. Rania Lawyer hasn’t answered yet. You can leave your message for them, or talk to me now: I can pass on what you need.',
    );
    expect((await who.get(`/v1/conversations/${id}`)).conversation.caiAnswering).toEqual({
      state: 'offered',
      receiverId: rania.user.id,
      side: 'caller',
      talk: true,
      covered: false,
    });
    await who.post(`/v1/conversations/${id}/cai-answer`, { choice: 'talk' });
    modelSays({
      reply: 'I’ll tell Rania you asked.',
      done: true,
      summary: 'Walid asked about the contract.',
    });
    const asked = await who.post(`/v1/conversations/${id}/messages`, {
      ...words('Only whether she read it.'),
      toCai: true,
    });
    expect(asked.message.payload).toEqual({ toCai: true });
    await answered();
    const sent = requests.at(-1)!;
    expect(sent.system).toContain('Someone Rania Lawyer knows wrote to Rania Lawyer');
    // The two's own words before it are read too; her label for him is never said.
    expect(sent.content).toContain('Did you see the contract?');
    expect(sent.content).not.toMatch(/colleague|work/i);
    const runs = await t.ctx.db
      .selectFrom('ai_runs')
      .select('user_id')
      .where('feature', '=', 'cai-answer')
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(runs.user_id).toBe(who.user.id);
    const chat = (await rania.post('/v1/conversations', { kind: 'direct', userId: CAI_ID }))
      .conversation.id;
    const told = (await linesIn(rania, chat)).filter((m) => m.payload?.answered).at(-1);
    expect(told?.body).toBe(
      'Walid Colleague wrote to you and talked with me. Walid asked about the contract. Reply when you can.',
    );
  });

  it('says nothing when she answers within the wait, and a line marked for Cai is just a line then', async () => {
    const { who, id } = await knownTo('Nour Colleague', 'work', 'colleague');
    await who.post(`/v1/conversations/${id}/messages`, words('Call me when free'));
    await waited(5);
    await rania.post(`/v1/conversations/${id}/messages`, words('Will do'));
    await waited(40);
    expect(await caiLines(who, id)).toEqual([]);
    const plain = await who.post(`/v1/conversations/${id}/messages`, {
      ...words('Thanks'),
      toCai: true,
    });
    expect(plain.message.payload?.toCai).toBeUndefined();
  });

  it('covers a client’s talk from her allowance, rings her through when it can’t wait, two a day', async () => {
    const { who, id } = await knownTo('Hala Client', 'customer', 'client', { ai: false });
    const talk = async (body: string, reply: Record<string, unknown>) => {
      modelSays(reply);
      await who.post(`/v1/conversations/${id}/messages`, { ...words(body), toCai: true });
      await answered();
    };
    // The first time: covered, though she has no assist of her own.
    await who.post(`/v1/conversations/${id}/messages`, words('Urgent question about my case'));
    await waited(31);
    expect((await who.get(`/v1/conversations/${id}`)).conversation.caiAnswering).toMatchObject({
      state: 'offered',
      talk: true,
      covered: true,
    });
    await who.post(`/v1/conversations/${id}/cai-answer`, { choice: 'talk' });
    await talk('The hearing moved to tomorrow morning and I need the papers.', {
      reply: 'I see; that can’t wait.',
      done: false,
      summary: 'Hala’s hearing moved to tomorrow morning; she needs the papers.',
      urgent: true,
    });
    const run = await t.ctx.db
      .selectFrom('ai_runs')
      .select('user_id')
      .where('feature', '=', 'cai-answer')
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(run.user_id).toBe(rania.user.id);
    expect((await caiLines(who, id)).at(-1)?.body).toBe(
      'I’ve let Rania Lawyer know it can’t wait.',
    );
    const rung = await t.ctx.db
      .selectFrom('notifications')
      .select(['title', 'level'])
      .where('user_id', '=', rania.user.id)
      .where('group_key', '=', `cai-rang:${id}`)
      .executeTakeFirstOrThrow();
    expect(rung).toEqual({ title: 'Hala Client needs you now', level: 'urgency' });
    // Rung once a talk: urgent again, nothing more.
    await talk('Please hurry', {
      reply: 'Rania knows.',
      done: false,
      summary: 'Still urgent.',
      urgent: true,
    });
    expect((await caiLines(who, id)).filter((m) => m.body.startsWith('I’ve let'))).toHaveLength(1);
    // Her own line ends it, and nobody is told what she already read.
    await rania.post(`/v1/conversations/${id}/messages`, words('On it, Hala.'));
    await t.ctx.flush();
    expect((await who.get(`/v1/conversations/${id}`)).conversation.caiAnswering.state).toBe(
      'ended',
    );
    // A second stretch the same day: covered again.
    await who.post(`/v1/conversations/${id}/messages`, words('One more thing'));
    await waited(31);
    const again = await caiLines(who, id);
    expect(again.at(-1)?.body).toBe(
      'Cai here again, for Rania Lawyer, who hasn’t answered yet. You can leave your message for them, or talk to me now.',
    );
    await who.post(`/v1/conversations/${id}/cai-answer`, { choice: 'talk' });
    await rania.post(`/v1/conversations/${id}/messages`, words('Here now.'));
    await t.ctx.flush();
    // A third: two covered today already, and she can't talk on her own, so Cai says nothing.
    const before = (await caiLines(who, id)).length;
    await who.post(`/v1/conversations/${id}/messages`, words('And another'));
    await waited(31);
    expect(await caiLines(who, id)).toHaveLength(before);
  });

  it('answers at once while she’s in a meeting', async () => {
    const { who, id } = await knownTo('Sami Colleague', 'work', 'manager');
    const { who: boss, id: withBoss } = await knownTo('Boss Person', 'work', 'manager');
    const meeting = await rania.post(`/v1/conversations/${withBoss}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: {
          title: 'Board',
          start: { at: new Date(t.ctx.now().getTime() + 5 * 60_000).toISOString(), hasTime: true },
          durationMinutes: 60,
        },
      },
    });
    await boss.post(`/v1/messages/${meeting.message.id}/kit`, { to: 'accepted' });
    await waited(10);
    await who.post(`/v1/conversations/${id}/messages`, words('Quick one?'));
    await t.ctx.flush();
    expect((await caiLines(who, id))[0]?.body).toMatch(/^Hi Sami, I’m Cai/);
  });
});
