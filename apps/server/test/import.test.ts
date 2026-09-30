import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
