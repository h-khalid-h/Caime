import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv4, uuidv7 } from '@caishy/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { agentReply } from '../src/lib/agent';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/** A stand-in for the Messages API: records each request and answers from a queue. */
const requests: any[] = [];
const replies: Array<{ status: number; json: unknown }> = [];
let stub: Server;
const agentSays = (action: string, message: string) => ({
  status: 200,
  json: {
    id: 'msg_stub',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [{ type: 'text', text: JSON.stringify({ action, message }) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 300, output_tokens: 40 },
  },
});

let t: TestApp;
let noor: Client; // owner
let omar: Client; // on the team
let lina: Client; // a customer
let teen: Client;
let orgId: string;
let convo: string;

const KNOWLEDGE =
  'Nile Dental is open Sunday to Thursday 9am to 6pm and Saturday 9am to 1pm. A check-up is 400 EGP. Book by calling 02 2345 6789.';
const send = (c: Client, body: string, conversationId = convo) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const messages = async (c: Client, conversationId = convo) =>
  (await c.get(`/v1/conversations/${conversationId}/messages`)).messages as any[];
/** The agent waits a moment after a customer writes, then the job runs. */
async function agentTurn() {
  t.clock.advance(5000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
}
const threadOf = async (c: Client, conversationId = convo) =>
  (await c.get(`/v1/conversations/${conversationId}`)).conversation.business.thread;
async function newCustomer(name: string, birthYear = 1990) {
  const c = await signup(t, { displayName: name, birthYear });
  const conversationId = (await c.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  return { c, conversationId };
}

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests.push(raw ? JSON.parse(raw) : null);
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
  });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Farah', email: 'lina.farah@example.com' });
  teen = await signup(t, { displayName: 'Rami Young', birthYear: 2011 });
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  orgId = (
    await noor.post('/v1/orgs', { name: 'Nile Dental', handle: 'nile.dental', kind: 'business' })
  ).org.id;
  // Verified, so someone under 18 can write to it (R29): the agent still never answers them.
  await t.ctx.db
    .updateTable('organizations')
    .set({ verified_at: new Date() })
    .where('id', '=', orgId)
    .execute();
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  convo = (await lina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
  await new Promise((done) => stub.close(done));
});
beforeEach(() => {
  replies.length = 0;
  requests.length = 0;
});

describe('an organization’s AI agent (PRD §74–75)', () => {
  it('its owner or admins set it up; it joins the team as an AI, and everyone can see it answers first', async () => {
    const body = { name: 'Nile Dental Assistant', knowledge: KNOWLEDGE };
    expect((await omar.req('PUT', `/v1/orgs/${orgId}/agent`, body)).statusCode).toBe(403);
    expect(
      (await noor.req('PUT', `/v1/orgs/${orgId}/agent`, { ...body, knowledge: 'hi' })).statusCode,
    ).toBe(400);
    const made = await noor.req('PUT', `/v1/orgs/${orgId}/agent`, body);
    expect(made.statusCode).toBe(200);
    expect(made.json().agent).toMatchObject({
      name: 'Nile Dental Assistant',
      paused: false,
      repliesToday: 0,
      repliesPerDay: 50,
    });
    const team = (await noor.get(`/v1/orgs/${orgId}`)).org.members;
    expect(team).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'AI agent', role: 'agent' })]),
    );
    expect((await lina.get(`/v1/orgs/${orgId}`)).org.agent).toEqual({
      name: 'Nile Dental Assistant',
    });
    // Its plan counts people, never the agent.
    expect((await noor.get(`/v1/orgs/${orgId}`)).org.plan.used.teamSize).toBe(2);
    expect(requests).toHaveLength(0);
  });

  it('answers a customer from what it was told, as the organization, marked as an AI', async () => {
    const asking = (await send(lina, 'Hi! Are you open on Saturday?')).message;
    replies.push(
      agentSays(
        'answer',
        'Hi, I’m Nile Dental’s AI agent. Yes: on Saturday we’re open from 9am to 1pm.',
      ),
    );
    await agentTurn();
    expect(requests).toHaveLength(1);
    const asked = requests[0];
    expect(asked.system).toContain(
      'You are Nile Dental Assistant, the AI agent that answers customers of Nile Dental',
    );
    const content = asked.messages[0].content as string;
    expect(content).toContain(KNOWLEDGE);
    expect(content).toContain('[1] Customer: Hi! Are you open on Saturday?');
    expect(content).toContain('begin by saying');
    // Nobody's name or address reaches the model.
    expect(JSON.stringify(asked)).not.toContain('Lina');
    expect(JSON.stringify(asked)).not.toContain('lina.farah@example.com');

    const seen = (await messages(lina)).at(-1);
    expect(seen).toMatchObject({
      body: 'Hi, I’m Nile Dental’s AI agent. Yes: on Saturday we’re open from 9am to 1pm.',
      automated: true,
      aiAgent: true,
      // The customer sees the organization (R15).
      senderId: orgId,
    });
    // It isn't the team's answer: the customer still waits for a person (R16).
    const thread = await threadOf(noor);
    expect(thread.state).toBe('new');
    expect(thread.lastMessage).toMatchObject({ fromAgent: true });
    expect(thread.assignee).toBeNull();
    const plan = (await noor.get(`/v1/orgs/${orgId}`)).org.plan;
    expect(plan.used.agentRepliesToday).toBe(1);

    // Each message once: the job running again, as a retry would, says and asks nothing more.
    await agentReply(t.ctx, { conversationId: convo, seq: asking.seq });
    await agentTurn();
    expect(requests).toHaveLength(1);
    expect((await messages(lina)).filter((m) => m.aiAgent)).toHaveLength(1);
  });

  it('reads a burst of messages once, after the last', async () => {
    await send(lina, 'Also,');
    await send(lina, 'how much is a check-up?');
    replies.push(agentSays('answer', 'A check-up is 400 EGP.'));
    await agentTurn();
    expect(requests).toHaveLength(1);
    const content = requests[0].messages[0].content as string;
    expect(content).toMatch(/\[\d+\] You: Hi, I’m Nile Dental’s AI agent/);
    expect(content).toContain('Customer: how much is a check-up?');
    expect(content).toContain('You have written in this conversation before.');
    expect((await messages(lina)).at(-1).body).toBe('A check-up is 400 EGP.');
  });

  it('two workers on the same message post one answer', async () => {
    const racing = await newCustomer('Tarek Racing');
    const asked = (await send(racing.c, 'Where are you?', racing.conversationId)).message;
    replies.push(agentSays('answer', 'We’re at 12 Nile Street.'));
    replies.push(agentSays('answer', 'We’re at 12 Nile Street.'));
    await Promise.all([
      agentReply(t.ctx, { conversationId: racing.conversationId, seq: asked.seq }),
      agentReply(t.ctx, { conversationId: racing.conversationId, seq: asked.seq }),
    ]);
    await t.ctx.flush();
    const said = (await messages(racing.c, racing.conversationId)).filter((m) => m.aiAgent);
    expect(said).toHaveLength(1);
  });

  it('hands over what needs a person, tells the team, and stays out until it’s resolved', async () => {
    await send(lina, 'Can I book for Monday at 10?');
    replies.push(
      agentSays(
        'hand_over',
        'I’ve passed this to the team at Nile Dental. Someone will answer here.',
      ),
    );
    await agentTurn();
    const thread = await threadOf(noor);
    expect(thread.agentHandedOverAt).not.toBeNull();
    expect(thread.state).toBe('new');
    const told = (await omar.get('/v1/notifications')).notifications.find(
      (n: any) => n.data?.conversationId === convo && n.title.includes('handed a conversation'),
    );
    expect(told).toMatchObject({
      title: 'Nile Dental Assistant handed a conversation to the team',
    });

    await send(lina, 'Hello?');
    await agentTurn();
    expect(requests).toHaveLength(1);

    // Resolved, and written to again: it may answer again.
    await noor.post(`/v1/business/${convo}/resolve`, {});
    await send(lina, 'Are you open on Sunday?');
    replies.push(agentSays('answer', 'Yes, on Sunday from 9am to 6pm.'));
    await agentTurn();
    expect(requests).toHaveLength(2);
    expect((await threadOf(noor)).agentHandedOverAt).toBeNull();
  });

  it('closes a conversation the customer is done with; stays out of one a person has taken', async () => {
    await send(lina, 'Thanks, that’s all!');
    replies.push(agentSays('resolve', 'You’re welcome, Lina. Take care!'));
    await agentTurn();
    expect((await threadOf(noor)).state).toBe('resolved');

    await send(lina, 'One more thing: do you do whitening?');
    await send(omar, 'Hi Lina, Omar here: yes, we do.');
    await agentTurn();
    expect(requests).toHaveLength(1);
    await send(lina, 'How much is it?');
    await agentTurn();
    // Omar has it now.
    expect(requests).toHaveLength(1);

    // Resolved, and asked something new later: it may answer again; Omar keeps it.
    await omar.post(`/v1/business/${convo}/resolve`, {});
    await send(lina, 'Are you open tomorrow?');
    replies.push(agentSays('answer', 'Yes, from 9am to 6pm.'));
    await agentTurn();
    expect(requests).toHaveLength(2);
    expect((await messages(lina)).at(-1)).toMatchObject({
      body: 'Yes, from 9am to 6pm.',
      aiAgent: true,
    });
    expect((await threadOf(noor)).assignee).toMatchObject({ userId: omar.user.id });
    // Once Omar writes, it's his conversation again.
    await send(omar, 'Hi Lina, we are. See you then!');
    await send(lina, 'Great, and on Friday?');
    await agentTurn();
    expect(requests).toHaveLength(2);
  });

  it('never answers anyone under 18, a private conversation, or while it’s paused', async () => {
    const young = await teen.post(`/v1/orgs/${orgId}/conversations`, {});
    await send(teen, 'Are you open on Saturday?', young.conversationId);
    await agentTurn();
    expect(requests).toHaveLength(0);

    const quiet = await newCustomer('Hala Private');
    await t.ctx.db
      .updateTable('conversations')
      .set({ privacy_class: 'private' })
      .where('id', '=', quiet.conversationId)
      .execute();
    await send(quiet.c, 'Are you open on Saturday?', quiet.conversationId);
    await agentTurn();
    expect(requests).toHaveLength(0);

    await noor.req('PUT', `/v1/orgs/${orgId}/agent`, {
      name: 'Nile Dental Assistant',
      knowledge: KNOWLEDGE,
      paused: true,
    });
    const later = await newCustomer('Sami Later');
    await send(later.c, 'Are you open on Saturday?', later.conversationId);
    await agentTurn();
    expect(requests).toHaveLength(0);
    expect((await later.c.get(`/v1/orgs/${orgId}`)).org.agent).toBeNull();
    await noor.req('PUT', `/v1/orgs/${orgId}/agent`, {
      name: 'Nile Dental Assistant',
      knowledge: KNOWLEDGE,
    });
  });

  it('stops for the day at what the plan includes, and when the model fails the team answers', async () => {
    const bot = (
      await t.ctx.db
        .selectFrom('org_agents')
        .select('bot_user_id')
        .where('org_id', '=', orgId)
        .executeTakeFirstOrThrow()
    ).bot_user_id;
    const busy = await newCustomer('Dina Busy');
    await send(busy.c, 'Are you open on Saturday?', busy.conversationId);
    replies.push({
      status: 400,
      json: { type: 'error', error: { type: 'invalid_request_error', message: 'not today' } },
    });
    await agentTurn();
    expect(requests).toHaveLength(1);
    expect((await messages(busy.c, busy.conversationId)).filter((m) => m.aiAgent)).toHaveLength(0);
    const failed = await t.ctx.db
      .selectFrom('ai_runs')
      .select(['feature', 'outcome'])
      .where('user_id', '=', bot)
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(failed).toEqual({ feature: 'agent', outcome: 'unavailable' });

    // Free includes 50 answers a day.
    await t.ctx.db
      .insertInto('ai_runs')
      .values(
        Array.from({ length: 50 }, () => ({
          id: uuidv7(),
          user_id: bot,
          feature: 'agent',
          provider: 'anthropic',
          outcome: 'ok',
          created_at: t.clock.now,
        })),
      )
      .execute();
    const full = await newCustomer('Yara Full');
    await send(full.c, 'Are you open on Saturday?', full.conversationId);
    await agentTurn();
    expect(requests).toHaveLength(1);
    await t.ctx.db
      .deleteFrom('ai_runs')
      .where('user_id', '=', bot)
      .where('outcome', '=', 'ok')
      .execute();
  });

  it('hands a long conversation to a person after ten answers in a day', async () => {
    const chatty = await newCustomer('Kareem Chatty');
    for (let i = 0; i < 10; i++) {
      await send(chatty.c, `Question ${i + 1}?`, chatty.conversationId);
      replies.push(agentSays('answer', `Answer ${i + 1}.`));
      await agentTurn();
    }
    expect(requests).toHaveLength(10);
    await send(chatty.c, 'Question 11?', chatty.conversationId);
    await agentTurn();
    // No eleventh answer, and no model call: the team has it.
    expect(requests).toHaveLength(10);
    expect((await threadOf(noor, chatty.conversationId)).agentHandedOverAt).not.toBeNull();
    const said = (await messages(chatty.c, chatty.conversationId)).filter((m) => m.aiAgent);
    expect(said).toHaveLength(10);
  });

  it('is tried on a question before it answers anyone, by the owner and admins only', async () => {
    const question = {
      name: 'Nile Dental Assistant',
      knowledge: KNOWLEDGE,
      question: 'Do you take walk-ins?',
    };
    expect((await omar.req('POST', `/v1/orgs/${orgId}/agent/try`, question)).statusCode).toBe(403);
    replies.push(
      agentSays(
        'hand_over',
        'I’ve passed this to the team at Nile Dental. Someone will answer here.',
      ),
    );
    const tried = await noor.post(`/v1/orgs/${orgId}/agent/try`, question);
    expect(tried).toEqual({
      action: 'hand_over',
      message: 'I’ve passed this to the team at Nile Dental. Someone will answer here.',
    });
    expect(requests[0].messages[0].content).toContain('[1] Customer: Do you take walk-ins?');
    // A try isn't an answer to anyone, and doesn't count as one.
    expect((await noor.get(`/v1/orgs/${orgId}/agent`)).agent.repliesToday).toBe(10);
  });

  it('removed, it leaves the team at once, and what it wrote stays under its name', async () => {
    await noor.req('DELETE', `/v1/orgs/${orgId}/agent`);
    expect((await noor.get(`/v1/orgs/${orgId}/agent`)).agent).toBeNull();
    expect((await lina.get(`/v1/orgs/${orgId}`)).org.agent).toBeNull();
    const team = (await noor.get(`/v1/orgs/${orgId}`)).org.members;
    expect(team.some((m: any) => m.title === 'AI agent')).toBe(false);
    expect((await messages(noor)).filter((m) => m.aiAgent).length).toBeGreaterThan(0);
    await send(lina, 'Are you there?');
    await agentTurn();
    expect(requests).toHaveLength(0);
  });
});
