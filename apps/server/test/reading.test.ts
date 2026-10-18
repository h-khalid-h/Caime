/**
 * Coming back to a conversation and answering a group's message privately (M16 E3b): a mark to
 * come back that reading clears, and a private reply that quotes the group's message only for
 * whoever may still read it there, keeping none of its words.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let alex: Client;
let lina: Client;
let chat: string;

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: { sphere: 'friend' },
  });
  const res = await b.post(`/v1/connections/requests/${r.requestId}/accept`, {
    relationship: { sphere: 'friend' },
  });
  return res.conversationId as string;
}

const send = (c: Client, conversationId: string, body: string, extra: object = {}) =>
  c
    .post(`/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body,
      ...extra,
    })
    .then((r) => r.message);

const itemOf = async (c: Client, id: string) => {
  await t.ctx.flush();
  const all = await c.get('/v1/inbox?view=all');
  return all.conversations.find((i: { id: string }) => i.id === id);
};

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  alex = await signup(t, { displayName: 'Alex Moreau' });
  lina = await signup(t, { displayName: 'Lina Saad' });
  chat = await connect(noor, alex);
  await connect(noor, lina);
  await connect(alex, lina);
});
afterAll(async () => {
  await t.close();
});

describe('marked unread (M16 E3b)', () => {
  it('is a dot in Chats until it is read, or said otherwise', async () => {
    await send(alex, chat, 'See you at six');
    const last = (await itemOf(noor, chat)).lastSeq as number;
    await noor.post(`/v1/conversations/${chat}/receipts`, { read: last });
    expect(await itemOf(noor, chat)).toMatchObject({ unreadCount: 0, markedUnread: false });

    await noor.patch(`/v1/conversations/${chat}`, { markedUnread: true });
    expect((await itemOf(noor, chat)).markedUnread).toBe(true);
    // Only theirs: the other side sees nothing of it.
    expect((await itemOf(alex, chat)).markedUnread).toBe(false);
    expect((await noor.get(`/v1/conversations/${chat}`)).conversation.me.markedUnread).toBe(true);

    // Reading something new clears it.
    const next = await send(alex, chat, 'Bring the keys');
    await noor.post(`/v1/conversations/${chat}/receipts`, { read: next.seq });
    expect((await itemOf(noor, chat)).markedUnread).toBe(false);

    // Said otherwise, with nothing new to read.
    await noor.patch(`/v1/conversations/${chat}`, { markedUnread: true });
    await noor.patch(`/v1/conversations/${chat}`, { markedUnread: false });
    expect((await itemOf(noor, chat)).markedUnread).toBe(false);
  });
});

describe('reply privately (M16 E3b)', () => {
  let group: string;
  let asked: { id: string; seq: number };

  beforeAll(async () => {
    group = (
      await noor.post('/v1/conversations', {
        kind: 'group',
        title: 'Book club',
        memberIds: [alex.user.id, lina.user.id],
      })
    ).conversation.id;
    asked = await send(alex, group, 'Who brings the cake?');
  });

  it('quotes the group’s message in the chat of two people in it, for both of them', async () => {
    const reply = await send(noor, chat, 'I will, quietly', {
      privateReplyTo: { conversationId: group, messageId: asked.id },
    });
    const quote = {
      conversationId: group,
      messageId: asked.id,
      title: 'Book club',
      seq: asked.seq,
      senderId: alex.user.id,
      preview: 'Who brings the cake?',
    };
    expect(reply.privateReply).toEqual(quote);
    const seen = (await alex.get(`/v1/conversations/${chat}/messages`)).messages.find(
      (m: { id: string }) => m.id === reply.id,
    );
    expect(seen.privateReply).toEqual(quote);
    // None of the group's words are kept with the reply.
    const row = await t.ctx.db
      .selectFrom('messages')
      .select(['payload'])
      .where('id', '=', reply.id)
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(row.payload)).not.toContain('cake');
  });

  it('is refused anywhere else, or for a message one of them can’t read there', async () => {
    const refused = (by: Client, into: string, messageId: string, conversationId = group) =>
      by
        .req('POST', `/v1/conversations/${into}/messages`, {
          clientId: uuidv4(),
          kind: 'text',
          body: 'Privately',
          privateReplyTo: { conversationId, messageId },
        })
        .then((r) => r.statusCode);
    // Not into the group itself, nor quoting a chat's message.
    expect(await refused(noor, group, asked.id)).toBe(400);
    const inChat = await send(alex, chat, 'Just us');
    const linaChat = (
      await noor.post('/v1/conversations', { kind: 'direct', userId: lina.user.id })
    ).conversation.id;
    expect(await refused(noor, linaChat, inChat.id, chat)).toBe(400);
    // A chat with someone not in that group.
    const outsider = await signup(t, { displayName: 'Omar Fathy' });
    const omarChat = await connect(noor, outsider);
    expect(await refused(noor, omarChat, asked.id)).toBe(400);
    // A message deleted for everyone.
    const gone = await send(alex, group, 'Never mind');
    await alex.del(`/v1/messages/${gone.id}?forEveryone=true`);
    expect(await refused(noor, chat, gone.id)).toBe(400);
  });

  it('says where, never what, once the message is gone or the reader has left', async () => {
    const said = await send(lina, group, 'I can host in May');
    const reply = await send(
      noor,
      (await noor.post('/v1/conversations', { kind: 'direct', userId: lina.user.id })).conversation
        .id,
      'May works',
      {
        privateReplyTo: { conversationId: group, messageId: said.id },
      },
    );
    await lina.del(`/v1/messages/${said.id}?forEveryone=true`);
    const after = (
      await noor.get(`/v1/conversations/${reply.conversationId}/messages`)
    ).messages.find((m: { id: string }) => m.id === reply.id);
    expect(after.privateReply).toMatchObject({ title: 'Book club', preview: null, seq: null });

    const kept = await send(noor, chat, 'Still on for cake', {
      privateReplyTo: { conversationId: group, messageId: asked.id },
    });
    await alex.del(`/v1/conversations/${group}/members/${alex.user.id}`);
    const left = (await alex.get(`/v1/conversations/${chat}/messages`)).messages.find(
      (m: { id: string }) => m.id === kept.id,
    );
    expect(left.privateReply).toMatchObject({ title: null, preview: null, senderId: null });
  });

  it('forwards as its words, never with the quote of its group', async () => {
    // Between two people still in it (Alex has left by now).
    const linaChat = (
      await noor.post('/v1/conversations', { kind: 'direct', userId: lina.user.id })
    ).conversation.id;
    const reply = await send(noor, linaChat, 'Cake is on me', {
      privateReplyTo: { conversationId: group, messageId: asked.id },
    });
    expect(reply.privateReply).toMatchObject({ title: 'Book club' });
    const res = await noor.post(`/v1/messages/${reply.id}/forward`, {
      conversationIds: [chat],
      clientId: uuidv4(),
    });
    const copy = (await alex.get(`/v1/conversations/${chat}/messages`)).messages.find(
      (m: { id: string }) => m.id === res.messageIds[0],
    );
    expect(copy).toMatchObject({ body: 'Cake is on me', forwarded: true, privateReply: null });
  });
});
