import { systemText } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let lina: Client;
let omar: Client;

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}

const lines = async (c: Client, conversationId: string, viewerId: string) =>
  (await c.get(`/v1/conversations/${conversationId}/messages`)).messages
    .filter((m: any) => m.kind === 'system')
    .map((m: any) => systemText(m.payload, viewerId));

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  lina = await signup(t, { displayName: 'Lina Aziz' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  await connect(noor, lina);
  await connect(noor, omar);
});
afterAll(async () => {
  await t.close();
});

describe('system messages', () => {
  it('say who did what, by name, and “you” to the person reading', async () => {
    const g = (
      await noor.post('/v1/conversations', {
        kind: 'group',
        title: 'Venue team',
        memberIds: [lina.user.id],
      })
    ).conversation;
    await noor.post(`/v1/conversations/${g.id}/members`, { userIds: [omar.user.id] });
    await omar.req('DELETE', `/v1/conversations/${g.id}/members/${omar.user.id}`);
    expect(await lines(lina, g.id, lina.user.id)).toEqual([
      'Noor Haddad created “Venue team”',
      'Noor Haddad added Omar Farouk',
      'Omar Farouk left',
    ]);
    expect((await lines(noor, g.id, noor.user.id))[1]).toBe('You added Omar Farouk');
    // Renaming the group changes only shared fields; that used to fail with a 500.
    const renamed = await noor.patch(`/v1/conversations/${g.id}`, { title: 'Venue crew' });
    expect(renamed.conversation.title).toBe('Venue crew');
    // Everyone's told, and the inbox preview reads the same line.
    expect((await lines(lina, g.id, lina.user.id)).at(-1)).toBe(
      'Noor Haddad renamed the conversation “Venue crew”',
    );
    const all = await lina.get('/v1/inbox?view=all');
    expect(all.conversations.find((c: any) => c.id === g.id).lastMessage.preview).toBe(
      'Noor Haddad renamed the conversation “Venue crew”',
    );
  });

  it('tell everyone when messages start and stop disappearing, once per change', async () => {
    const convo = await connect(lina, omar);
    await lina.patch(`/v1/conversations/${convo}`, { retentionDays: 7 });
    await lina.patch(`/v1/conversations/${convo}`, { retentionDays: 7 });
    await omar.patch(`/v1/conversations/${convo}`, { retentionDays: null });
    expect(await lines(omar, convo, omar.user.id)).toEqual([
      'Lina Aziz set new messages to disappear after 7 days',
      'You turned off disappearing messages',
    ]);
    expect((await omar.get(`/v1/conversations/${convo}`)).conversation.retentionDays).toBeNull();
  });
});
