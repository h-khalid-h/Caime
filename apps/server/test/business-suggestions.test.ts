import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owner
let omar: Client; // on the team
let lina: Client; // a customer
let orgId: string;
let convo: string;

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
}
const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const suggested = async (c: Client, conversationId: string) => {
  await t.ctx.flush();
  return (await c.get(`/v1/suggestions?conversationId=${conversationId}`)).suggestions as Array<{
    kind: string;
    title: string;
    rationale: string;
    subjectUserId: string | null;
    payload: Record<string, unknown>;
  }>;
};

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Customer' });
  await connect(noor, omar);
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Tiles Co',
      handle: 'tiles.co',
      kind: 'shop',
    })
  ).org.id;
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  convo = (await lina.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
});

afterAll(async () => {
  await t.close();
});

describe('suggestions in conversations with an organization (R15)', () => {
  it('what it asks of a customer is theirs to do, in its name, pointing at nobody on its team', async () => {
    await send(lina, convo, 'Hi, do you have the blue tiles?');
    await send(omar, convo, 'We do! Could you send us the room measurements by Thursday?');
    const hers = await suggested(lina, convo);
    expect(hers).toEqual([
      expect.objectContaining({
        kind: 'task',
        rationale: 'Tiles Co asked “Could you send us the room measurements by Thursday?”',
        subjectUserId: null,
      }),
    ]);
    expect(JSON.stringify(hers)).not.toContain(omar.user.id);
    expect(JSON.stringify(hers)).not.toContain('Omar');
    // Omar waits on her for it; the rest of the team isn't asked anything.
    expect(await suggested(omar, convo)).toEqual([
      expect.objectContaining({ kind: 'waiting', subjectUserId: lina.user.id }),
    ]);
    expect(await suggested(noor, convo)).toEqual([]);
  });

  it('what a customer asks goes to whoever has the conversation', async () => {
    await send(lina, convo, 'Can you send me the quote by Friday?');
    const his = (await suggested(omar, convo)).filter((s) => s.kind === 'task');
    expect(his).toEqual([
      expect.objectContaining({
        rationale: 'Lina asked “Can you send me the quote by Friday?”',
        subjectUserId: lina.user.id,
      }),
    ]);
    expect(await suggested(noor, convo)).toEqual([]);
    // What she waits for from the shop is the conversation's own state: no waiting item.
    expect((await suggested(lina, convo)).map((s) => s.kind)).toEqual(['task']);
  });

  it('nothing comes of a message request the customer hasn’t accepted (R14)', async () => {
    await t.ctx.db
      .updateTable('organizations')
      .set({ domain: 'tiles.example', verified_at: t.ctx.now() })
      .where('id', '=', orgId)
      .execute();
    const sam = await signup(t, { displayName: 'Sam Rivera' });
    const started = await omar.post(`/v1/orgs/${orgId}/threads`, {
      handle: sam.user.handle,
      clientId: uuidv4(),
      body: 'Could you confirm your delivery address by Friday?',
    });
    expect(await suggested(sam, started.conversationId)).toEqual([]);
  });
});
