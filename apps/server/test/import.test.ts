import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { productMetrics } from '../src/lib/product-metrics';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let alex: Client;
let sam: Client;

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: { sphere: 'work', role: 'colleague', orgName: 'DATA C' },
  });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}

const lines = [
  { at: '2024-03-13T09:05:00.000Z', mine: false, text: 'Yes, 10:30.\nI’ll bring the forms' },
  { at: '2024-03-13T09:02:00.000Z', mine: true, text: 'Morning! Still on for the clinic?' },
  { at: '2024-03-14T10:31:00.000Z', mine: true, text: 'Here now' },
];

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  alex = await signup(t, { displayName: 'Alex Chen' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
});
afterAll(async () => {
  await t.close();
});

describe('a chat brought over from WhatsApp (R45)', () => {
  it('takes only a connection', async () => {
    const r = await noor.req('POST', '/v1/conversations/import', {
      userId: sam.user.id,
      source: 'whatsapp',
      messages: lines,
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.message).toBe('Connect first to bring a chat over.');
    const me = await noor.req('POST', '/v1/conversations/import', {
      userId: noor.user.id,
      source: 'whatsapp',
      messages: lines,
    });
    expect(me.statusCode).toBe(400);
  });

  it('lands as a topic, dated as written, read by both, each message saying where it came from', async () => {
    const general = await connect(noor, alex);
    const r = await noor.req('POST', '/v1/conversations/import', {
      userId: alex.user.id,
      source: 'whatsapp',
      messages: lines,
    });
    expect(r.statusCode).toBe(201);
    const { conversationId, imported } = r.json();
    expect(imported).toBe(3);
    expect(conversationId).not.toBe(general);

    // A topic of the one-to-one, named for where it came from, with both people in it.
    const { conversation } = await alex.get(`/v1/conversations/${conversationId}`);
    expect(conversation).toMatchObject({
      kind: 'direct',
      isGeneral: false,
      parentId: general,
      name: 'WhatsApp',
    });
    // Alex read what he wrote; the line saying Noor brought it over is new to him, and only that.
    expect(conversation.me.lastReadSeq).toBe(3);
    const mine = await noor.get(`/v1/conversations/${conversationId}`);
    expect(mine.conversation.me.lastReadSeq).toBe(4);
    expect(conversation.other.userId).toBe(noor.user.id);
    // Where each last wrote (M16 D1): Alex at his line, Noor at the line saying she brought it.
    const sent = await t.ctx.db
      .selectFrom('participants')
      .select(['user_id', 'last_sent_seq'])
      .where('conversation_id', '=', conversationId)
      .execute();
    expect(Object.fromEntries(sent.map((p) => [p.user_id, Number(p.last_sent_seq)]))).toEqual({
      [noor.user.id]: 4,
      [alex.user.id]: 2,
    });

    // In the order they were written, not the order they were sent; the line at the end.
    const page = await alex.get(`/v1/conversations/${conversationId}/messages`);
    const messages = page.messages as Array<Record<string, unknown>>;
    expect(messages.map((m) => [m.seq, m.kind, m.body, m.createdAt])).toEqual([
      [1, 'text', 'Morning! Still on for the clinic?', '2024-03-13T09:02:00.000Z'],
      [2, 'text', 'Yes, 10:30.\nI’ll bring the forms', '2024-03-13T09:05:00.000Z'],
      [3, 'text', 'Here now', '2024-03-14T10:31:00.000Z'],
      [4, 'system', null, expect.any(String)],
    ]);
    expect(messages[0]?.senderId).toBe(noor.user.id);
    expect(messages[1]?.senderId).toBe(alex.user.id);
    for (const m of messages.slice(0, 3))
      expect(m.payload).toEqual({ imported: { source: 'whatsapp', by: noor.user.id } });
    expect(messages[3]?.payload).toMatchObject({
      event: 'imported',
      source: 'whatsapp',
      count: 3,
      by: 'Noor Haddad',
      byId: noor.user.id,
    });
    // Nobody is told of the past: no notification, nothing to answer.
    const { notifications } = await alex.get('/v1/notifications');
    expect(
      (notifications as Array<{ conversationId?: string }>).filter(
        (n) => n.conversationId === conversationId,
      ),
    ).toEqual([]);
    // The general conversation has none of it.
    const own = await noor.get(`/v1/conversations/${general}/messages`);
    expect(own.messages.filter((m: { kind: string }) => m.kind === 'text')).toEqual([]);
    // And it can be found, as anything said here can.
    const found = await alex.get('/v1/search?q=clinic');
    expect(JSON.stringify(found.results)).toContain(conversationId);
  });

  it('from Telegram the same way: the topic named for it, its line saying so (M18 J6)', async () => {
    // Connected by the test before: their general conversation is the one a direct opens.
    const general = (
      await noor.req('POST', '/v1/conversations', { kind: 'direct', userId: alex.user.id })
    ).json().conversation.id as string;
    const r = await noor.req('POST', '/v1/conversations/import', {
      userId: alex.user.id,
      source: 'telegram',
      messages: lines.slice(0, 2),
    });
    expect(r.statusCode).toBe(201);
    const { conversationId, imported } = r.json();
    expect(imported).toBe(2);
    const { conversation } = await alex.get(`/v1/conversations/${conversationId}`);
    expect(conversation).toMatchObject({ parentId: general, name: 'Telegram' });
    const { messages } = await alex.get(`/v1/conversations/${conversationId}/messages`);
    for (const m of messages.slice(0, 2))
      expect(m.payload).toEqual({ imported: { source: 'telegram', by: noor.user.id } });
    expect(messages[2]?.payload).toMatchObject({ event: 'imported', source: 'telegram', count: 2 });
    // Anything else isn't a place a chat comes from.
    const other = await noor.req('POST', '/v1/conversations/import', {
      userId: alex.user.id,
      source: 'signal',
      messages: lines.slice(0, 1),
    });
    expect(other.statusCode).toBe(400);
  });

  it('refuses an empty import, and one the other person has blocked', async () => {
    const empty = await noor.req('POST', '/v1/conversations/import', {
      userId: alex.user.id,
      source: 'whatsapp',
      messages: [],
    });
    expect(empty.statusCode).toBe(400);
    await alex.post('/v1/blocks', { userId: noor.user.id });
    const blocked = await noor.req('POST', '/v1/conversations/import', {
      userId: alex.user.id,
      source: 'whatsapp',
      messages: lines,
    });
    expect(blocked.statusCode).toBe(403);
  });
});

describe('a WhatsApp group brought over (M16 C3g)', () => {
  let lina: Client;
  let omar: Client;
  let kim: Client;
  let stranger: Client;
  let group: string;
  let topic: string;
  // As a phone exported it: Lina and Omar are here; Uncle Sami isn't on Caime.
  const authors = (taken: { lina?: string | null; omar?: string | null }) => [
    { name: 'Lina Saad', userId: taken.lina ?? null },
    { name: 'Omar Farouk', userId: taken.omar ?? null },
    { name: 'Uncle Sami', userId: null },
  ];
  const said = [
    { at: '2024-05-01T18:00:00.000Z', author: 0, text: 'Dinner at ours on Friday?' },
    { at: '2024-05-01T18:04:00.000Z', author: 2, text: 'I’ll bring the dessert' },
    { at: '2024-05-01T18:02:00.000Z', author: 1, text: 'Count us in' },
  ];

  beforeAll(async () => {
    lina = await signup(t, { displayName: 'Lina Saad' });
    omar = await signup(t, { displayName: 'Omar Farouk' });
    kim = await signup(t, { displayName: 'Kim Park' });
    stranger = await signup(t, { displayName: 'Rita Stranger' });
    await connect(lina, omar);
    await connect(lina, kim);
    group = (
      await lina.post('/v1/conversations', {
        kind: 'group',
        title: 'Family',
        memberIds: [omar.user.id, kim.user.id],
      })
    ).conversation.id;
  });

  it('lands as a topic of the group: names taken as its people, the rest kept as names', async () => {
    const r = await lina.req('POST', `/v1/conversations/${group}/import`, {
      source: 'whatsapp',
      authors: authors({ lina: lina.user.id, omar: omar.user.id }),
      messages: said,
    });
    expect(r.statusCode, r.body).toBe(201);
    const { conversationId, imported } = r.json();
    expect(imported).toBe(3);
    topic = conversationId;
    // A topic of the group, and everyone in the group is in it, Kim too, who wrote nothing there.
    const { conversation } = await kim.get(`/v1/conversations/${conversationId}`);
    expect(conversation).toMatchObject({ kind: 'group', parentId: group, name: 'WhatsApp' });
    expect(conversation.me.lastReadSeq).toBe(3);
    const page = await kim.get(`/v1/conversations/${conversationId}/messages`);
    const messages = page.messages as Array<{
      senderId: string;
      body: string | null;
      payload: Record<string, unknown>;
    }>;
    // In the order written; Lina's and Omar's lines are theirs, Uncle Sami's his name alone.
    expect(messages.slice(0, 3).map((m) => [m.body, m.senderId])).toEqual([
      ['Dinner at ours on Friday?', lina.user.id],
      ['Count us in', omar.user.id],
      ['I’ll bring the dessert', lina.user.id],
    ]);
    expect(messages[0]?.payload).toEqual({ imported: { source: 'whatsapp', by: lina.user.id } });
    expect(messages[2]?.payload).toEqual({
      imported: { source: 'whatsapp', by: lina.user.id, author: 'Uncle Sami' },
    });
    // Nobody is told of the past.
    const { notifications } = await kim.get('/v1/notifications');
    expect(
      (notifications as Array<{ conversationId?: string }>).filter(
        (n) => n.conversationId === conversationId,
      ),
    ).toEqual([]);
  });

  it('is its owner’s and admins’ to bring, into a group of its own, naming only its people', async () => {
    // Omar is in it, but doesn't run it.
    const member = await omar.req('POST', `/v1/conversations/${group}/import`, {
      source: 'whatsapp',
      authors: authors({ omar: omar.user.id }),
      messages: said,
    });
    expect(member.statusCode).toBe(403);
    // A name taken as someone who isn't in the group.
    const outside = await lina.req('POST', `/v1/conversations/${group}/import`, {
      source: 'whatsapp',
      authors: authors({ lina: lina.user.id, omar: stranger.user.id }),
      messages: said,
    });
    expect(outside.statusCode).toBe(400);
    // A message naming a name that isn't there.
    const missing = await lina.req('POST', `/v1/conversations/${group}/import`, {
      source: 'whatsapp',
      authors: authors({ lina: lina.user.id }),
      messages: [{ at: '2024-05-01T18:00:00.000Z', author: 7, text: 'Who?' }],
    });
    expect(missing.statusCode).toBe(400);
    // Not a group: a one-to-one takes the one-to-one's way in.
    const general = await connect(lina, stranger);
    const direct = await lina.req('POST', `/v1/conversations/${general}/import`, {
      source: 'whatsapp',
      authors: authors({ lina: lina.user.id }),
      messages: said,
    });
    expect(direct.statusCode).toBe(400);
    // And someone not in it at all is told there's nothing there.
    const nobody = await stranger.req('POST', `/v1/conversations/${group}/import`, {
      source: 'whatsapp',
      authors: authors({}),
      messages: said,
    });
    expect(nobody.statusCode).toBe(404);
  });

  it('counts for the product’s metrics: chats and groups brought over, and their lines', async () => {
    t.clock.set(new Date(Date.now() + 60_000).toISOString());
    const { imports } = (await productMetrics(t.ctx, 30)).growth;
    // The one-to-one above (three lines), the Telegram one (two) and this group (three lines),
    // and by the app each came from (R120 K5).
    expect(imports).toEqual({
      chats: 2,
      groups: 1,
      messages: 8,
      bySource: { whatsapp: 2, telegram: 1 },
    });
  });

  it('comes over into a new topic, never into one of the same name already there', async () => {
    const again = await lina.req('POST', `/v1/conversations/${group}/import`, {
      source: 'whatsapp',
      authors: authors({ lina: lina.user.id }),
      messages: said,
    });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.message).toBe(
      'This group has a topic called “WhatsApp” already. Name this one otherwise.',
    );
    // The first is as it was: its three lines and the line saying who brought them.
    const page = await kim.get(`/v1/conversations/${topic}/messages`);
    expect(page.messages).toHaveLength(4);
    const named = await lina.req('POST', `/v1/conversations/${group}/import`, {
      source: 'whatsapp',
      title: 'WhatsApp 2023',
      authors: authors({ lina: lina.user.id }),
      messages: said,
    });
    expect(named.statusCode, named.body).toBe(201);
    expect(named.json().conversationId).not.toBe(topic);
  });
});
