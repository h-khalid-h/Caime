/**
 * Whom a group message is for (M17 I10): the person its words are said to by name gets the ask
 * or the promise, and its writer waits on them; "everyone" is asked of everyone; someone the
 * words only speak of gets nothing.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let ana: Client;
let ben: Client;
let cleo: Client;
let group: string;

const say = (c: Client, body: string) =>
  c.post(`/v1/conversations/${group}/messages`, { clientId: uuidv4(), body });
const suggested = async (c: Client) => {
  await t.ctx.flush();
  return (await c.get(`/v1/suggestions?conversationId=${group}`)).suggestions as Array<{
    id: string;
    kind: string;
    title: string;
    subjectUserId: string | null;
  }>;
};
const clear = async (...clients: Client[]) => {
  for (const c of clients)
    for (const s of await suggested(c)) await c.post(`/v1/suggestions/${s.id}/dismiss`, {});
};

beforeAll(async () => {
  t = await createTestApp();
  ana = await signup(t, { displayName: 'Ana Plans' });
  ben = await signup(t, { displayName: 'Ben Reads' });
  cleo = await signup(t, { displayName: 'Cleo Writes' });
  for (const other of [ben, cleo]) {
    const r = await ana.post('/v1/connections/requests', {
      toUserId: other.user.id,
      relationship: { sphere: 'work' },
    });
    await other.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  }
  group = (
    await ana.post('/v1/conversations', {
      kind: 'group',
      title: 'Launch',
      memberIds: [ben.user.id, cleo.user.id],
    })
  ).conversation.id as string;
});
afterAll(async () => {
  await t.close();
});

describe('whom a group message is for (M17 I10)', () => {
  it('files an ask for the person it is said to, and the writer waits on them', async () => {
    await say(ana, 'Ben, can you send the deck by Friday?');
    const bens = await suggested(ben);
    expect(bens.find((s) => s.kind === 'task')).toMatchObject({ subjectUserId: ana.user.id });
    expect(await suggested(cleo)).toEqual([]);
    expect((await suggested(ana)).find((s) => s.kind === 'waiting')).toMatchObject({
      subjectUserId: ben.user.id,
    });
    await clear(ana, ben, cleo);
  });

  it('asks everyone when everyone is called, and nobody the words only speak of', async () => {
    await say(ana, 'Everyone, please send your slides by Thursday');
    expect((await suggested(ben)).some((s) => s.kind === 'task')).toBe(true);
    expect((await suggested(cleo)).some((s) => s.kind === 'task')).toBe(true);
    await clear(ana, ben, cleo);
    await say(ana, 'Can you send the deck to Ben?');
    expect(await suggested(ben)).toEqual([]);
    expect(await suggested(cleo)).toEqual([]);
  });
});
