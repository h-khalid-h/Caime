import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: { sphere: 'work', role: 'colleague', orgName: 'DATA C' },
  });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}
const send = (c: Client, conversationId: string, body: Record<string, unknown>) =>
  c.req('POST', `/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), ...body });

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
});

afterAll(async () => {
  await t.close();
});

describe('blocking a person (PRD §55)', () => {
  it('stops every way of reaching them, not only sending', async () => {
    const dm = await connect(noor, sam);
    const note = (await send(sam, dm, { body: 'See you Friday' })).json().message;
    const poll = (
      await send(noor, dm, {
        kind: 'poll',
        payload: {
          question: 'Lunch?',
          options: [
            { id: 'a', text: 'Pizza' },
            { id: 'b', text: 'Soup' },
          ],
        },
      })
    ).json().message;
    const card = (
      await send(noor, dm, {
        kind: 'kit',
        payload: { kit: 'approval', fields: { title: 'The venue' } },
      })
    ).json().message;

    await noor.post(`/v1/messages/${note.id}/pin`);

    await noor.post('/v1/blocks', { userId: sam.user.id });
    const tries = {
      send: await send(sam, dm, { body: 'Hello?' }),
      edit: await sam.req('PATCH', `/v1/messages/${note.id}`, { body: 'See you Saturday' }),
      react: await sam.req('POST', `/v1/messages/${poll.id}/reactions`, { emoji: '👍' }),
      vote: await sam.req('POST', `/v1/messages/${poll.id}/vote`, { optionIds: ['a'] }),
      move: await sam.req('POST', `/v1/messages/${card.id}/kit`, { to: 'approved' }),
      typing: await sam.req('POST', `/v1/conversations/${dm}/typing`, {}),
      pin: await sam.req('POST', `/v1/messages/${poll.id}/pin`),
      unpin: await sam.req('DELETE', `/v1/messages/${note.id}/pin`),
    };
    for (const [what, res] of Object.entries(tries)) expect(res.statusCode, what).toBe(403);
    // Blocking is both ways: the blocker can't write there either until they unblock.
    expect((await send(noor, dm, { body: 'Bye' })).statusCode).toBe(403);
    // Taking back your own reaction is still yours to do.
    expect(
      (await sam.req('DELETE', `/v1/messages/${poll.id}/reactions/${encodeURIComponent('👍')}`))
        .statusCode,
    ).toBe(200);

    await noor.req('DELETE', `/v1/blocks/${sam.user.id}`);
    expect(
      (await sam.req('POST', `/v1/messages/${poll.id}/reactions`, { emoji: '👍' })).statusCode,
    ).toBe(200);
    expect((await sam.req('POST', `/v1/conversations/${dm}/typing`, {})).statusCode).toBe(200);
  });
});

describe('blocking an organization (PRD §55, R15)', () => {
  let omar: Client; // on its team
  let lina: Client; // its customer
  let orgId: string;
  let convo: string;
  let botToken: string;

  beforeAll(async () => {
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
    botToken = (
      await noor.post(`/v1/orgs/${orgId}/apps`, { name: 'Tiles Bot', scopes: ['messages:write'] })
    ).token;
    convo = (await lina.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
    await send(lina, convo, { body: 'Do you have blue tiles?' });
    await send(omar, convo, { body: 'We do!' });
  });

  it('closes the conversation: nobody on the team, nor its bot, can write to the customer', async () => {
    await lina.post(`/v1/orgs/${orgId}/block`, {});
    expect((await lina.get(`/v1/orgs/${orgId}`)).org.blockedByMe).toBe(true);
    expect((await noor.get(`/v1/orgs/${orgId}`)).org.blockedByMe).toBe(false);

    const reply = await send(omar, convo, { body: 'Anything else?' });
    expect(reply.statusCode).toBe(403);
    expect(reply.json().error).toEqual({
      code: 'conversation_closed',
      message: 'The customer closed this conversation.',
    });
    const bot = await t.app.inject({
      method: 'POST',
      url: `/v1/conversations/${convo}/messages`,
      headers: { authorization: `Bearer ${botToken}` },
      payload: { clientId: uuidv4(), body: 'We have a sale on!' },
    });
    expect(bot.statusCode).toBe(403);
    expect((await omar.req('POST', `/v1/conversations/${convo}/typing`, {})).statusCode).toBe(403);

    // The team sees it closed and resolved; the customer sees it closed and it leaves their inbox.
    const team = (await omar.get(`/v1/conversations/${convo}`)).conversation.business;
    expect(team).toMatchObject({ closed: true, thread: { state: 'resolved', closed: true } });
    const mine = (await lina.get(`/v1/conversations/${convo}`)).conversation;
    expect(mine.business.closed).toBe(true);
    expect(mine.me.archived).toBe(true);

    // The customer can't write to it either, nor start again, until they unblock it.
    const own = await send(lina, convo, { body: 'Actually…' });
    expect(own.json().error).toEqual({
      code: 'org_blocked',
      message: 'You blocked Tiles Co. Unblock it to write to it again.',
    });
    const again = await lina.req('POST', `/v1/orgs/${orgId}/conversations`, {});
    expect(again.json().error.code).toBe('org_blocked');
    expect((await lina.get('/v1/blocks')).orgs).toEqual([
      expect.objectContaining({ id: orgId, name: 'Tiles Co', handle: 'tiles.co' }),
    ]);
  });

  it('is the customer’s to undo, and nobody on the team can block their own organization', async () => {
    expect((await omar.req('POST', `/v1/orgs/${orgId}/block`, {})).statusCode).toBe(400);
    await lina.req('DELETE', `/v1/orgs/${orgId}/block`);
    expect((await lina.get('/v1/blocks')).orgs).toEqual([]);
    expect((await send(lina, convo, { body: 'Hello again' })).statusCode).toBe(201);
    const thread = (await omar.get(`/v1/conversations/${convo}`)).conversation.business.thread;
    expect(thread).toMatchObject({ closed: false, state: 'customer_waiting' });
    expect((await send(omar, convo, { body: 'Welcome back!' })).statusCode).toBe(201);
  });
});
