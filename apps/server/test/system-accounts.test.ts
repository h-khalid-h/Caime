/**
 * Caime's own accounts (R67, R71): Cai and each Caime Friend answer small talk and what's open by
 * the rules, in the language it was written in, and anything else with the model only when the
 * person may use AI assist (a friend in its own character, reading only what's its to know);
 * none notifies, needs anyone, takes a card, a task or a request, or opens twice.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CAI_ID, SYSTEM_ACCOUNTS, uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { publicPageFor, renderPublic } from '../src/lib/public-pages';
import { personaOf, tipFor } from '../src/lib/system-accounts';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const requests: any[] = [];
const replies: string[] = [];
let stub: Server;
let t: TestApp;
let hassan: Client;
let sarah: Client;
let teen: Client;
let cai: string;
const friend = (handle: string) => SYSTEM_ACCOUNTS.find((a) => a.handle === handle)!.id;
const MOMO = friend('momo');
const PANDA = friend('panda');
const LUMI = friend('lumi');
const ZUZU = friend('zuzu');

const open = (c: Client, userId: string) => c.post('/v1/conversations', { kind: 'direct', userId });
const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const messages = async (c: Client, conversationId: string) =>
  (await c.get(`/v1/conversations/${conversationId}/messages`)).messages as any[];
/** It answers a moment after someone writes. */
async function answered(c: Client, conversationId: string) {
  await t.ctx.flush();
  t.clock.advance(1000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
  return messages(c, conversationId);
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
  hassan = await signup(t, { displayName: 'Hassan Khalid' });
  sarah = await signup(t, { displayName: 'Sarah Smith' });
  teen = await signup(t, { displayName: 'Rami Young', birthDate: '2011-12-31' });
  const r = await hassan.post('/v1/connections/requests', { toUserId: sarah.user.id });
  const convo = (await sarah.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId;
  await hassan.post('/v1/tasks', {
    title: 'Access approval',
    assigneeId: sarah.user.id,
    shared: true,
    conversationId: convo,
  });
  await sarah.post('/v1/tasks', {
    title: 'Book the venue',
    assigneeId: hassan.user.id,
    shared: true,
    conversationId: convo,
  });
});
afterAll(async () => {
  await t.close();
  await new Promise((done) => stub.close(done));
});

describe('Cai (R67)', () => {
  it('opens once, greets by name, and is Caime’s own AI', async () => {
    const first = await hassan.req('POST', '/v1/conversations', { kind: 'direct', userId: CAI_ID });
    expect(first.statusCode).toBe(201);
    cai = first.json().conversation.id;
    expect((await open(hassan, CAI_ID)).conversation.id).toBe(cai);
    const said = await messages(hassan, cai);
    expect(said).toHaveLength(1);
    expect(said[0].body).toMatch(/^Hi Hassan, I’m Cai\. /);
    expect(said[0].body).toContain('Turn on AI assist in Settings');
    expect(said[0]).toMatchObject({ automated: true, aiAgent: true });
    const view = (await hassan.get(`/v1/conversations/${cai}`)).conversation;
    const other = view.participants.find((p: any) => p.userId === CAI_ID).person;
    expect(other).toMatchObject({ handle: 'cai', kind: 'assistant' });
    expect(other.trust.label).toBe('Caime’s assistant');
  });

  it('answers what’s open by the rules, at no cost, and needs nobody', async () => {
    await send(hassan, cai, 'What am I waiting for?');
    let said = await answered(hassan, cai);
    expect(said.at(-1).body).toBe('You’re waiting on one thing:\n• Sarah Smith · Access approval');
    await send(hassan, cai, 'who is waiting on me');
    said = await answered(hassan, cai);
    expect(said.at(-1).body).toBe('One thing is asked of you:\n• Sarah Smith · Book the venue');
    await send(hassan, cai, 'my tasks');
    expect((await answered(hassan, cai)).at(-1).body).toBe('Nothing you said you’d do is open.');
    expect(requests).toHaveLength(0);
    // Nothing it says is a notification, and its conversation never needs Hassan.
    const notes = (await hassan.get('/v1/notifications')).notifications as any[];
    expect(notes.filter((n) => n.conversationId === cai)).toEqual([]);
    const inbox = (await hassan.get('/v1/inbox?view=all')).conversations as any[];
    expect(inbox.find((i) => i.id === cai).section).not.toBe('needs_you');
  });

  it('asks the model only with AI assist on, and reads it nothing private', async () => {
    await send(hassan, cai, 'Write a short toast for my sister’s wedding');
    let said = await answered(hassan, cai);
    expect(said.at(-1).body).toMatch(/^I can answer that with AI assist on/);
    expect(requests).toHaveLength(0);
    await hassan.patch('/v1/me', { aiEnabled: true });
    replies.push('To love, laughter and a long life together!');
    await send(hassan, cai, 'Write a short toast for my sister’s wedding');
    said = await answered(hassan, cai);
    expect(said.at(-1)).toMatchObject({
      body: 'To love, laughter and a long life together!',
      aiAgent: true,
    });
    expect(requests).toHaveLength(1);
    const asked = requests[0];
    expect(JSON.stringify(asked.system)).toContain('You are Cai');
    const content = asked.messages[0].content as string;
    expect(content).toContain('• Sarah Smith · Access approval');
    expect(content).toMatch(/\[\d+\] Person: Write a short toast/);
    expect(content).not.toContain('Hassan Khalid');
    // A failure answers in words, with what the rules still do.
    await send(hassan, cai, 'And a poem?');
    expect((await answered(hassan, cai)).at(-1).body).toMatch(/I can always tell you/);
  });

  it('never asks the model for someone under 18', async () => {
    const id = (await open(teen, CAI_ID)).conversation.id;
    expect((await messages(teen, id))[0].body).not.toContain('AI assist');
    await send(teen, id, 'Tell me a joke');
    const before = requests.length;
    expect((await answered(teen, id)).at(-1).body).toMatch(/^That one’s beyond me\. /);
    expect(requests).toHaveLength(before);
  });

  it('takes words and stickers only, and no tasks, requests, topics or calls', async () => {
    const kit = await hassan.req('POST', `/v1/conversations/${cai}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit: 'meeting', fields: { title: 'Lunch' } },
    });
    expect(kit.statusCode).toBe(400);
    expect(
      (
        await hassan.req('POST', '/v1/tasks', {
          title: 'Do it',
          assigneeId: CAI_ID,
          conversationId: cai,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await hassan.req('POST', '/v1/connections/requests', { toUserId: CAI_ID })).statusCode,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await hassan.req('POST', '/v1/conversations', {
          kind: 'direct',
          userId: CAI_ID,
          title: 'Ideas',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await hassan.req('POST', `/v1/conversations/${cai}/calls`, { video: false })).statusCode,
    ).toBeGreaterThanOrEqual(400);
  });
});

describe('their public pages (R67)', () => {
  it('say what each is, never a person', async () => {
    const page = await publicPageFor(t.ctx.db, '/@cai', t.clock.now);
    expect(page).toMatchObject({
      kind: 'person',
      system: 'assistant',
      bio: 'Caime’s assistant. Knows what’s waiting, what you said you’d do and what’s next.',
    });
    const html = renderPublic(page, 'https://caime.test', '/@cai');
    expect(html.status).toBe(200);
    expect(html.head).toContain('"@type":"SoftwareApplication"');
    expect(html.body).toContain('Caime’s assistant');
    const momo = await publicPageFor(t.ctx.db, '/@momo', t.clock.now);
    expect(renderPublic(momo, 'https://caime.test', '/@momo').head).toContain('"@type":"Thing"');
  });
});

describe('the Caime Friends (R67, R71)', () => {
  it('say hello with a sticker, and answer small talk in the language it was written in', async () => {
    const id = (await open(sarah, MOMO)).conversation.id;
    let said = await messages(sarah, id);
    expect(said.map((m) => m.kind)).toEqual(['sticker', 'text']);
    expect(said[0].payload).toEqual({ pack: 'caishy-friends', sticker: 'momo.excited' });
    expect(said[1]).toMatchObject({ automated: true, aiAgent: true });
    const before = requests.length;
    await send(sarah, id, 'hi Momo');
    said = await answered(sarah, id);
    expect(said.slice(-2).map((m) => m.kind)).toEqual(['sticker', 'text']);
    expect(said.at(-1).body).toBe(
      'Yay, you found me! I’m Momo. When nothing needs you, I’m the one cheering.',
    );
    // Sarah's account is in English: what she writes in Arabic is answered in Arabic.
    await send(sarah, id, 'السلام عليكم');
    said = await answered(sarah, id);
    expect(said.at(-1).body).toBe(
      'وعليكم السلام! رائع، وجدتني! أنا Momo. حين لا شيء يحتاج إليك، يحين وقت الاحتفال.',
    );
    await send(sarah, id, 'انت ممكن تساعدنى اذاى');
    said = await answered(sarah, id);
    expect(said.at(-1).body).toBe(
      'أحتفل معك حين لا يبقى شيء بانتظارك. اسألني ما الذي يحتاج إليك، أو ما القادم. شغّل مساعدة الذكاء الاصطناعي من الإعدادات، وسيمكنك سؤالي عن أي شيء آخر أيضًا.',
    );
    await send(sarah, id, 'merci beaucoup !');
    said = await answered(sarah, id);
    expect(said.slice(-2).map((m) => m.kind)).toEqual(['sticker', 'text']);
    expect(said.at(-1).body).toBe('Youpi ! Avec grand plaisir !');
    // A sticker is answered with its own, and nothing here asked the model.
    await sarah.post(`/v1/conversations/${id}/messages`, {
      clientId: uuidv4(),
      kind: 'sticker',
      payload: { pack: 'caishy-friends', sticker: 'caishy.happy' },
    });
    said = await answered(sarah, id);
    expect(said.at(-1)).toMatchObject({ kind: 'sticker', senderId: MOMO });
    expect(requests).toHaveLength(before);
  });

  it('answer what’s open by the rules, and without the model share their tips in turn', async () => {
    const id = (await open(sarah, PANDA)).conversation.id;
    const before = requests.length;
    await send(sarah, id, 'What am I waiting for?');
    let said = await answered(sarah, id);
    expect(said.at(-1).body).toBe('You’re waiting on one thing:\n• Hassan Khalid · Book the venue');
    const bodies: string[] = [];
    for (const words of ['tell me something', 'and?', 'more', 'go on']) {
      await send(sarah, id, words);
      said = await answered(sarah, id);
      // Words every time: never a sticker on its own.
      expect(said.at(-1).kind).toBe('text');
      bodies.push(said.at(-1).body);
    }
    // Her second, third, fourth and fifth messages: the tips in turn, round again, and on each
    // round's first what AI assist would add.
    expect(bodies).toEqual([
      'When a wait goes quiet for three days, Attention asks whether it’s still open.',
      'How you know someone can offer a follow-up when a question goes unanswered.',
      'Ask someone for something, and it waits under “Waiting for” in Actions until they answer. Turn on AI assist in Settings, and you can ask me anything else too.',
      'When a wait goes quiet for three days, Attention asks whether it’s still open.',
    ]);
    expect(requests).toHaveLength(before);
  });

  it('answer anything else in their own character, reading only what’s theirs to know', async () => {
    // Hassan has AI assist on (above).
    const id = (await open(hassan, MOMO)).conversation.id;
    replies.push('Yay! A picnic by the river sounds perfect.');
    await send(hassan, id, 'Any idea for the weekend?');
    const said = await answered(hassan, id);
    expect(said.at(-1)).toMatchObject({
      body: 'Yay! A picnic by the river sounds perfect.',
      senderId: MOMO,
      aiAgent: true,
    });
    const asked = requests.at(-1);
    const system = JSON.stringify(asked.system);
    expect(system).toContain('You are Momo, one of the Caime Friends');
    expect(system).toContain('the Cheerful');
    expect(system).toContain('Panda (@panda) knows waiting and follow-ups');
    const content = asked.messages[0].content as string;
    // What's asked of him is Momo's to know; what he waits on is Panda's.
    expect(content).toContain('• Sarah Smith · Book the venue');
    expect(content).not.toContain('Access approval');
    expect(content).toMatch(/\[\d+\] Momo: /);
    expect(content).toMatch(/\[\d+\] Person: Any idea for the weekend\?/);
    expect(content).not.toContain('Hassan Khalid');
    // A friend with nothing of theirs to know reads nothing open, and asks nothing to find out.
    const lumi = (await open(hassan, LUMI)).conversation.id;
    replies.push('Ooh, a topic for the picnic, maybe?');
    await send(hassan, lumi, 'How do I plan a picnic with friends?');
    expect((await answered(hassan, lumi)).at(-1).body).toBe('Ooh, a topic for the picnic, maybe?');
    expect(requests.at(-1).messages[0].content).toContain('(nothing open)');
    // A failure answers in words, with what it helps with.
    await send(hassan, lumi, 'And a poem?');
    expect((await answered(hassan, lumi)).at(-1).body).toMatch(
      /I help you make things together: groups, topics and spaces\./,
    );
  });

  it('never ask the model for someone under 18', async () => {
    const id = (await open(teen, ZUZU)).conversation.id;
    const before = requests.length;
    await send(teen, id, 'Tell me a story');
    const said = await answered(teen, id);
    expect(said.at(-1).body).toBe(
      'What was decided and what’s still open in a conversation are in its details.',
    );
    expect(requests).toHaveLength(before);
  });

  it('each knows its own tips in turn, and who else knows what', () => {
    for (const a of SYSTEM_ACCOUNTS.filter((x) => x.kind === 'character')) {
      const handle = a.handle as Parameters<typeof tipFor>[0];
      expect(tipFor(handle, 1)).toMatchObject({ first: true });
      expect(tipFor(handle, 2)).toMatchObject({ first: false });
      expect(tipFor(handle, 4)).toEqual(tipFor(handle, 1));
      const persona = personaOf(handle);
      expect(persona.name).toBe(a.name);
      expect(persona.facts).toHaveLength(3);
      expect(persona.others).toHaveLength(6);
      expect(persona.others.join(' ')).not.toContain(`@${handle})`);
    }
  });
});
