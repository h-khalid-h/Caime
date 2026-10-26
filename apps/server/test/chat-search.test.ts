/**
 * Search inside one conversation (M16 E6): `GET /search?conversation=` finds that conversation's
 * messages alone, for someone in it, by the rules; the words as typed where the rules took them
 * all for something else; nobody outside it learns anything of it.
 */
import { parseWhatsApp, uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let ana: Client;
let ben: Client;
let cleo: Client;
let withBen: string;
let withCleo: string;

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  return (await a.post('/v1/conversations', { kind: 'direct', userId: b.user.id })).conversation
    .id as string;
}
const say = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body,
  });
const within = (c: Client, conversationId: string, q: string) =>
  c.req('GET', `/v1/search?q=${encodeURIComponent(q)}&conversation=${conversationId}`);

beforeAll(async () => {
  t = await createTestApp();
  ana = await signup(t, { displayName: 'Ana Host' });
  ben = await signup(t, { displayName: 'Ben Lee' });
  cleo = await signup(t, { displayName: 'Cleo Else' });
  withBen = await connect(ana, ben);
  withCleo = await connect(ana, cleo);
  await say(ana, withBen, 'The invoice INV-7731 is attached');
  await say(ben, withBen, 'Thanks, I will pay the invoice tomorrow');
  await say(ben, withBen, 'Lunch on Friday?');
  await say(ana, withCleo, 'Your invoice is ready too');
});
afterAll(async () => {
  await t.close();
});

describe('search inside one conversation (M16 E6)', () => {
  it('finds that conversation’s messages alone, marked, the best first', async () => {
    const res = await within(ana, withBen, 'invoice');
    expect(res.statusCode, res.body).toBe(200);
    const found = res.json().results.messages as Array<{
      conversationId: string;
      seq: number;
      senderName: string;
      snippet: string;
    }>;
    expect(found).toHaveLength(2);
    expect(found.every((m) => m.conversationId === withBen)).toBe(true);
    expect(found.map((m) => m.senderName).sort()).toEqual(['Ana Host', 'Ben Lee']);
    // Nothing else is searched in a conversation: no people, no actions, no files.
    expect(Object.keys(res.json().results)).toEqual(['messages']);
    // A reference by its number, as in Search.
    const ref = (await within(ana, withBen, '7731')).json().results.messages;
    expect(ref).toHaveLength(1);
  });

  it('finds plain words as typed', async () => {
    expect((await within(ben, withBen, 'lunch')).json().results.messages).toHaveLength(1);
    expect((await within(ben, withBen, 'dinner')).json().results.messages).toHaveLength(0);
  });

  it('tells someone outside the conversation nothing of it', async () => {
    const res = await within(cleo, withBen, 'invoice');
    expect(res.statusCode).toBeGreaterThanOrEqual(403);
    expect(res.statusCode).toBeLessThan(500);
    expect(res.body).not.toContain('INV-7731');
  });
});

describe('a conversation as a text file (M16 E7)', () => {
  const exported = (c: Client, conversationId: string) =>
    c.req('GET', `/v1/conversations/${conversationId}/export.txt`);

  it('writes what its member may read, in order, as WhatsApp lines its importer reads back', async () => {
    const res = await exported(ana, withBen);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="caime-chat-/);
    const chat = parseWhatsApp(res.body);
    expect(chat.messages.map((m) => [m.author, m.text])).toEqual([
      ['Ana Host', 'The invoice INV-7731 is attached'],
      ['Ben Lee', 'Thanks, I will pay the invoice tomorrow'],
      ['Ben Lee', 'Lunch on Friday?'],
    ]);
    // Someone outside it gets nothing of it.
    const outside = await exported(cleo, withBen);
    expect(outside.statusCode).toBeGreaterThanOrEqual(403);
    expect(outside.body).not.toContain('INV-7731');
  });

  it('names the organization, never who on its team wrote, to its customer (R15)', async () => {
    const orgId = (
      await ana.post('/v1/orgs', {
        country: 'EG',
        name: 'Nile Smile',
        handle: 'nile.export',
        kind: 'clinic',
      })
    ).org.id;
    const thread = (await ben.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId as string;
    await say(ben, thread, 'Hello, is Saturday open?');
    await say(ana, thread, 'Yes, from ten');
    const theirs = parseWhatsApp((await exported(ben, thread)).body);
    expect(theirs.messages.map((m) => [m.author, m.text])).toEqual([
      ['Ben Lee', 'Hello, is Saturday open?'],
      ['Nile Smile', 'Yes, from ten'],
    ]);
    expect((await exported(ben, thread)).body).not.toContain('Ana Host');
  });
});
