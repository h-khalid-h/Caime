/**
 * A person's feed (M16 G5, review 2026-10-17 §8 M and §11 step 6): what reached them, the
 * newest first or in order after the cursor it gave, so a bridge can start a recipe on a new
 * message. Nothing is passed over: a message still being written holds the feed back until it's
 * in, never past it. It reads as the inbox does (no request not yet taken, no line Caime wrote,
 * no chat brought over, nothing taken back or hidden, not their own unless asked), a customer
 * hears the organization and never who on its team wrote, and the organization's conversations
 * stay out of its team's own feeds.
 */
import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const METRICS = 'metrics-token-for-the-feed-test-0123456789';
let t: TestApp;
let noor: Client;
let sam: Client;
let lina: Client;
let omar: Client; // runs Nile Dental
let chat: string; // Noor and Sam
let group: string; // Noor, Sam and Lina
let cursor: string;

interface Event {
  id: string;
  event: string;
  createdAt: string;
  data: {
    conversation: { id: string; kind: string; title: string | null; topic: string | null };
    from: { id: string; name: string; handle: string | null } | null;
    text: string;
    card: Record<string, unknown> | null;
    message: { id: string; senderId: string | null; body: string | null };
  };
}

const send = async (c: Client, conversationId: string, body: string) =>
  (await c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body }))
    .message.id as string;
async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}
/** The feed as a person reads it, once whatever runs after a send has finished. */
const feed = async (c: Client, query = '') => {
  await t.ctx.flush();
  return (await c.get(`/v1/feed${query}`)) as { events: Event[]; next: string };
};
const texts = (events: Event[]) => events.map((e) => e.data.text);

beforeAll(async () => {
  t = await createTestApp({ METRICS_TOKEN: METRICS });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  lina = await signup(t, { displayName: 'Lina Farah' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  chat = await connect(noor, sam);
  await connect(noor, lina);
  group = (
    await noor.post('/v1/conversations', {
      kind: 'group',
      title: 'Weekend',
      memberIds: [sam.user.id, lina.user.id],
    })
  ).conversation.id;
});

afterAll(async () => {
  await t.close();
});

describe('a person’s feed (M16 G5)', () => {
  it('hands on what reached them, the newest first, with where it is and who sent it', async () => {
    const asked = await send(sam, chat, 'Are we still on for Friday?');
    await send(noor, chat, 'Yes, see you then.');
    const booked = await send(lina, group, 'I booked the table.');
    const { events, next } = await feed(noor);
    // Her own reply isn't news to her: a recipe that writes back would hear itself.
    expect(texts(events)).toEqual(['I booked the table.', 'Are we still on for Friday?']);
    expect(events[0]).toMatchObject({
      id: booked,
      event: 'message.created',
      data: {
        conversation: { id: group, kind: 'group', title: 'Weekend', topic: null },
        from: { id: lina.user.id, name: 'Lina Farah', handle: lina.user.handle },
        card: null,
        message: { id: booked, senderId: lina.user.id, body: 'I booked the table.' },
      },
    });
    expect(events[1]).toMatchObject({
      id: asked,
      data: {
        conversation: { id: chat, kind: 'direct', title: 'Sam Rivera' },
        from: { id: sam.user.id, name: 'Sam Rivera' },
      },
    });
    expect(texts((await feed(noor, '?mine=1')).events)).toEqual([
      'I booked the table.',
      'Yes, see you then.',
      'Are we still on for Friday?',
    ]);
    expect(texts((await feed(noor, `?conversation=${chat}`)).events)).toEqual([
      'Are we still on for Friday?',
    ]);
    // What she sent is in the others' feeds.
    expect(texts((await feed(sam)).events)).toContain('Yes, see you then.');
    cursor = next;
  });

  it('after its cursor: only what came since, oldest first, a page at a time', async () => {
    for (const words of ['One', 'Two', 'Three']) await send(sam, chat, words);
    const page = await feed(noor, `?after=${cursor}&limit=2`);
    expect(texts(page.events)).toEqual(['One', 'Two']);
    const rest = await feed(noor, `?after=${page.next}&limit=2`);
    expect(texts(rest.events)).toEqual(['Three']);
    const none = await feed(noor, `?after=${rest.next}`);
    expect(none.events).toEqual([]);
    // Nothing new: asked again, still nothing, and nothing handed on twice.
    expect((await feed(noor, `?after=${none.next}`)).events).toEqual([]);
    cursor = none.next;
  });

  it('never passes over a message still being written', async () => {
    const slow = uuidv4();
    let meanwhile: Event[] = [];
    await t.ctx.db.connection().execute(async (conn) => {
      await sql`begin`.execute(conn);
      await sql`insert into messages (id, conversation_id, seq, sender_id, kind, body)
        values (${slow}, ${group}, 999999, ${lina.user.id}, 'text', 'Written slowly')`.execute(
        conn,
      );
      // A message sent after it is in before it is.
      await send(sam, chat, 'Sent after, in first');
      const read = await feed(noor, `?after=${cursor}`);
      meanwhile = read.events;
      cursor = read.next;
      await sql`commit`.execute(conn);
    });
    // The feed waited for the one before it rather than reading past it.
    expect(meanwhile).toEqual([]);
    const read = await feed(noor, `?after=${cursor}`);
    expect(texts(read.events)).toEqual(['Written slowly', 'Sent after, in first']);
    expect(read.events[0]?.id).toBe(slow);
    cursor = read.next;
  });

  it('never waits on a transaction in another database on the same server', async () => {
    const elsewhere = new pg.Client({
      connectionString:
        process.env.TEST_DATABASE_URL ?? 'postgres://caishy:caishy-dev@127.0.0.1:5432/postgres',
    });
    await elsewhere.connect();
    try {
      await elsewhere.query('begin');
      await elsewhere.query('select pg_current_xact_id()');
      await send(sam, chat, 'Not held up');
      const read = await feed(noor, `?after=${cursor}`);
      expect(texts(read.events)).toEqual(['Not held up']);
      cursor = read.next;
    } finally {
      await elsewhere.query('rollback');
      await elsewhere.end();
    }
  });

  it('reads as she may: no request not yet taken, no line Caime wrote, no chat brought over, nothing taken back', async () => {
    const zed = await signup(t, { displayName: 'Zed Stranger' });
    const asks = (await zed.post('/v1/conversations', { kind: 'direct', userId: noor.user.id }))
      .conversation.id as string;
    await send(zed, asks, 'Hello from a stranger');
    const imported = await noor.req('POST', '/v1/conversations/import', {
      userId: sam.user.id,
      source: 'whatsapp',
      messages: [{ at: '2024-03-13T09:05:00.000Z', mine: false, text: 'An old line' }],
    });
    expect(imported.statusCode).toBe(201);
    const gone = await send(sam, chat, 'Oops, not for this chat');
    expect((await sam.req('DELETE', `/v1/messages/${gone}`)).statusCode).toBe(200);
    const hidden = await send(sam, chat, 'Hide this one');
    expect((await noor.req('DELETE', `/v1/messages/${hidden}?forEveryone=false`)).statusCode).toBe(
      200,
    );
    // A new group's opening line is Caime's, not anyone's message.
    await noor.post('/v1/conversations', {
      kind: 'group',
      title: 'Quiet group',
      memberIds: [sam.user.id],
    });
    const read = await feed(noor, `?after=${cursor}`);
    expect(texts(read.events)).toEqual([]);
    // Taken, the request is hers like any conversation.
    await send(noor, asks, 'Hi Zed');
    expect(texts((await feed(noor, `?conversation=${asks}`)).events)).toEqual([
      'Hello from a stranger',
    ]);
    cursor = read.next;
  });

  it('a customer hears the organization, never who on its team wrote', async () => {
    const nile = (
      await omar.post('/v1/orgs', {
        country: 'EG',
        name: 'Nile Dental',
        handle: 'nile.dental',
        kind: 'clinic',
      })
    ).org.id as string;
    const thread = (await noor.post(`/v1/orgs/${nile}/conversations`, {})).conversationId as string;
    await send(noor, thread, 'Can I move my cleaning to Thursday?');
    await send(omar, thread, 'Thursday at ten works.');
    const read = await feed(noor, `?after=${cursor}`);
    expect(read.events).toHaveLength(1);
    expect(read.events[0]?.data).toMatchObject({
      conversation: { id: thread, kind: 'business', title: 'Nile Dental' },
      from: { id: nile, name: 'Nile Dental', handle: 'nile.dental' },
      text: 'Thursday at ten works.',
      message: { senderId: nile },
    });
    const said = JSON.stringify(read);
    expect(said).not.toContain(omar.user.id);
    expect(said).not.toContain('Omar');
    // The organization's conversations are its Business inbox's, not Omar's own feed.
    expect((await feed(omar, '?mine=1')).events.map((e) => e.data.conversation.id)).not.toContain(
      thread,
    );
    cursor = read.next;
  });

  it('refuses a cursor it didn’t give that person, or from before the feed began again', async () => {
    const theirs = (await feed(sam)).next;
    const wrong = await noor.req('GET', `/v1/feed?after=${theirs}`);
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.code).toBe('invalid_request');
    const forged = await noor.req('GET', `/v1/feed?after=${'A'.repeat(64)}`);
    expect(forged.statusCode).toBe(400);
    // A cursor from beyond this database's count of transactions (a backup restored into a new
    // cluster): asked again without one.
    const { sealFeedCursor } = await import('../src/lib/feed');
    const ahead = await sealFeedCursor(t.ctx, noor.user.id, {
      t: '900000000000',
      i: uuidv4(),
    });
    const restored = await noor.req('GET', `/v1/feed?after=${ahead}`);
    expect(restored.statusCode).toBe(400);
    expect(restored.json().error.message).toBe(
      'The feed began again since that cursor: ask once without it.',
    );
  });

  it('is a person’s route for a token with messages:read, counted by mode', async () => {
    const make = (scopes: string[]) =>
      noor.req('POST', '/v1/me/tokens', { name: 'Zapier', scopes, days: 30 });
    const reading = (await make(['messages:read'])).json().token as string;
    const other = (await make(['actions:read'])).json().token as string;
    const as = (token: string) =>
      t.app.inject({ url: '/v1/feed', headers: { authorization: `Bearer ${token}` } });
    expect((await as(reading)).statusCode).toBe(200);
    expect((await as(other)).json().error.code).toBe('token_scope');
    const m = (
      await t.app.inject({
        url: '/metrics',
        headers: { authorization: `Bearer ${METRICS}` },
      })
    ).body;
    expect(m).toMatch(/^caime_feed_reads_total\{mode="newest"\} \d+$/m);
    expect(m).toMatch(/^caime_feed_reads_total\{mode="after"\} \d+$/m);
  });

  it('forgets every transaction kept when a backup is restored into a new cluster', async () => {
    await sql`call caime_feed_forget()`.execute(t.ctx.db);
    const kept = await t.ctx.db
      .selectFrom('messages')
      .select('id')
      .where('tx', 'is not', null)
      .execute();
    expect(kept).toEqual([]);
    // History, never news: the feed hands on only what's written from then on.
    expect((await feed(noor)).events).toEqual([]);
    await send(sam, chat, 'After the restore');
    expect(texts((await feed(noor)).events)).toEqual(['After the restore']);
  });
});
