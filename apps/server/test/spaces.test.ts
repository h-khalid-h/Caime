import { systemText, uuidv4, uuidv7 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let lina: Client;
let omar: Client;
let stranger: Client;

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}

const lines = async (c: Client, conversationId: string) =>
  (await c.get(`/v1/conversations/${conversationId}/messages`)).messages
    .filter((m: any) => m.kind === 'system')
    .map((m: any) => systemText(m.payload, c.user.id));

const say = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  lina = await signup(t, { displayName: 'Lina Aziz' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  stranger = await signup(t, { displayName: 'Sam Stranger' });
  await connect(noor, lina);
  await connect(noor, omar);
  await connect(lina, omar);
});
afterAll(async () => {
  await t.close();
});

describe('spaces (PRD §40)', () => {
  let spaceId: string;
  let generalId: string;

  it('a space starts with its people and a General conversation everyone is in', async () => {
    const refused = await noor.req('POST', '/v1/spaces', {
      name: 'Haddad family',
      kind: 'family',
      memberIds: [lina.user.id, stranger.user.id],
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error.message).toBe('You can add people you’re connected with.');

    const { space } = await noor.post('/v1/spaces', {
      name: 'Haddad family',
      kind: 'family',
      purpose: 'Plans, photos and the weekly call',
      memberIds: [lina.user.id],
    });
    spaceId = space.id;
    generalId = space.generalId;
    expect(space).toMatchObject({
      name: 'Haddad family',
      kind: 'family',
      purpose: 'Plans, photos and the weekly call',
      myRole: 'owner',
      memberCount: 2,
    });
    expect(space.members.map((m: any) => [m.person.displayName, m.role])).toEqual([
      ['Noor Haddad', 'owner'],
      ['Lina Aziz', 'member'],
    ]);
    expect(space.conversations).toEqual([
      expect.objectContaining({ id: generalId, title: 'General', isGeneral: true, joined: true }),
    ]);
    expect(await lines(lina, generalId)).toEqual(['Noor Haddad started the space “Haddad family”']);

    // Lina has it too; outside it, it doesn't exist.
    expect((await lina.get('/v1/spaces')).spaces).toEqual([
      expect.objectContaining({ id: spaceId, myRole: 'member', memberCount: 2 }),
    ]);
    expect((await stranger.req('GET', `/v1/spaces/${spaceId}`)).statusCode).toBe(404);

    // In Chats, General goes by the space's name.
    const { conversations } = await lina.get('/v1/inbox?view=all');
    expect(conversations.find((c: any) => c.id === generalId)).toMatchObject({
      title: 'Haddad family',
      space: { id: spaceId, name: 'Haddad family', kind: 'family' },
    });
  });

  it('owners and admins add people; admins can’t touch the owner', async () => {
    const byMember = await lina.req('POST', `/v1/spaces/${spaceId}/members`, {
      userIds: [omar.user.id],
    });
    expect(byMember.statusCode).toBe(403);
    await noor.patch(`/v1/spaces/${spaceId}/members/${lina.user.id}`, { role: 'admin' });
    await lina.post(`/v1/spaces/${spaceId}/members`, { userIds: [omar.user.id] });
    expect(await lines(noor, generalId)).toEqual([
      'You started the space “Haddad family”',
      'Lina Aziz added Omar Farouk',
    ]);
    // Omar is in General now, without everything before him counted as unread.
    const omars = (await omar.get('/v1/spaces')).spaces;
    expect(omars).toEqual([expect.objectContaining({ id: spaceId, unreadCount: 0 })]);
    expect((await omar.get(`/v1/conversations/${generalId}`)).conversation.title).toBe(
      'Haddad family',
    );
    // An admin removes members, not the owner.
    const upward = await lina.req('DELETE', `/v1/spaces/${spaceId}/members/${noor.user.id}`);
    expect(upward.statusCode).toBe(403);
    // General's people are the space's people.
    const direct = await noor.req('POST', `/v1/conversations/${generalId}/members`, {
      userIds: [stranger.user.id],
    });
    expect(direct.json().error.message).toBe('Add people to the space instead.');
    const leaveGeneral = await omar.req(
      'DELETE',
      `/v1/conversations/${generalId}/members/${omar.user.id}`,
    );
    expect(leaveGeneral.json().error.message).toBe(
      'Leave the space to leave its General conversation.',
    );
  });

  it('its other conversations are open to join, and count toward the space’s unread', async () => {
    const { conversation } = await lina.post(`/v1/spaces/${spaceId}/conversations`, {
      title: 'Venue',
    });
    expect(conversation).toMatchObject({
      title: 'Haddad family · Venue',
      space: { id: spaceId, name: 'Haddad family' },
    });
    let space = (await noor.get(`/v1/spaces/${spaceId}`)).space;
    expect(space.conversations.map((c: any) => [c.title, c.joined])).toEqual([
      ['General', true],
      ['Venue', false],
    ]);
    // Only people in the space can be added to it, or join it.
    const outsider = await lina.req('POST', `/v1/conversations/${conversation.id}/members`, {
      userIds: [stranger.user.id],
    });
    expect(outsider.json().error.message).toBe('Add them to the space first.');
    const sneak = await stranger.req(
      'POST',
      `/v1/spaces/${spaceId}/conversations/${conversation.id}/join`,
    );
    expect(sneak.statusCode).toBe(404);

    await noor.post(`/v1/spaces/${spaceId}/conversations/${conversation.id}/join`, {});
    await say(lina, conversation.id, 'The garden venue can do the 14th.');
    space = (await noor.get(`/v1/spaces/${spaceId}`)).space;
    expect(space.conversations[1]).toMatchObject({
      title: 'Venue',
      joined: true,
      unreadCount: 1,
      lastMessage: { preview: 'The garden venue can do the 14th.', senderName: 'Lina Aziz' },
    });
    expect(space.unreadCount).toBe(1);
    expect(await lines(lina, conversation.id)).toEqual([
      'You created “Venue”',
      'Noor Haddad joined',
    ]);
    // Omar hasn't joined Venue: he sees it, not what's in it.
    const omarsView = (await omar.get(`/v1/spaces/${spaceId}`)).space;
    expect(omarsView.conversations[1]).toMatchObject({ joined: false, lastMessage: null });
  });

  it('a topic that keeps coming up in General becomes a conversation for everyone', async () => {
    const suggestion = uuidv7();
    await t.ctx.db
      .insertInto('suggestions')
      .values({
        id: suggestion,
        user_id: noor.user.id,
        kind: 'topic',
        title: 'Budget',
        rationale: '“Budget” keeps coming up here.',
        confidence: 0.7,
        payload: { parentId: generalId },
        conversation_id: generalId,
        fingerprint: `topic:${generalId}:budget`,
      })
      .execute();
    const { accepted } = await noor.post(`/v1/suggestions/${suggestion}/accept`, {});
    const budget = (await noor.get(`/v1/conversations/${accepted.id}`)).conversation;
    expect(budget.title).toBe('Haddad family · Budget');
    expect(budget.participants).toHaveLength(3);
  });

  it('renaming the space renames its conversations everywhere, and says so', async () => {
    await noor.patch(`/v1/spaces/${spaceId}`, { name: 'The Haddads' });
    expect((await lines(lina, generalId)).at(-1)).toBe(
      'Noor Haddad renamed the space “The Haddads”',
    );
    const { conversations } = await lina.get('/v1/inbox?view=all');
    const titles = conversations
      .filter((c: any) => c.space?.id === spaceId)
      .map((c: any) => c.title)
      .sort();
    expect(titles).toEqual(['The Haddads', 'The Haddads · Budget', 'The Haddads · Venue']);
    const byMember = await omar.req('PATCH', `/v1/spaces/${spaceId}`, { name: 'Mine now' });
    expect(byMember.statusCode).toBe(403);
  });

  it('when the owner leaves, the longest-standing admin takes over; the last out closes it', async () => {
    await noor.req('DELETE', `/v1/spaces/${spaceId}/members/${noor.user.id}`);
    expect((await noor.get('/v1/spaces')).spaces).toEqual([]);
    expect((await noor.req('GET', `/v1/conversations/${generalId}`)).statusCode).toBe(404);
    const space = (await lina.get(`/v1/spaces/${spaceId}`)).space;
    expect(space.members.map((m: any) => [m.person.displayName, m.role])).toEqual([
      ['Lina Aziz', 'owner'],
      ['Omar Farouk', 'member'],
    ]);
    expect((await lines(lina, generalId)).at(-1)).toBe('Noor Haddad left');
    // The new owner removes Omar, then leaves: nobody is left, so the space closes.
    await lina.req('DELETE', `/v1/spaces/${spaceId}/members/${omar.user.id}`);
    expect((await omar.get('/v1/spaces')).spaces).toEqual([]);
    await lina.req('DELETE', `/v1/spaces/${spaceId}/members/${lina.user.id}`);
    expect((await lina.req('GET', `/v1/spaces/${spaceId}`)).statusCode).toBe(404);
    const closed = await t.ctx.db
      .selectFrom('spaces')
      .select('archived_at')
      .where('id', '=', spaceId)
      .executeTakeFirstOrThrow();
    expect(closed.archived_at).not.toBeNull();
  });

  it('a deleted account’s spaces stay with the people in them', async () => {
    const leaving = await signup(t, { displayName: 'Rana Leaving' });
    await connect(leaving, lina);
    const { space } = await leaving.post('/v1/spaces', {
      name: 'Book club',
      kind: 'community',
      memberIds: [lina.user.id],
    });
    const gone = await leaving.req('DELETE', '/v1/me', { password: 'correct horse battery' });
    expect(gone.statusCode).toBe(200);
    const kept = (await lina.get(`/v1/spaces/${space.id}`)).space;
    expect(kept.myRole).toBe('owner');
    expect(kept.memberCount).toBe(1);
    const archive = JSON.parse((await lina.req('GET', '/v1/me/export')).body);
    expect(archive.spaces.map((s: any) => [s.name, s.role, s.leftAt === null])).toEqual([
      ['The Haddads', 'member', false],
      ['Book club', 'owner', true],
    ]);
  });
});
