/**
 * Asked before being added (M16 B4): someone who says to be asked first, or someone under 18 who
 * would be among people they don't know (R29), is invited to a group or a space rather than put in,
 * and comes in only by saying yes; someone blocked either way is told nothing; and message requests
 * have a day's limit.
 */
import { REQUESTS_PER_DAY } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildExport } from '../src/lib/export';
import { KEPT_DAYS, sweepRecords } from '../src/lib/retention';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let omar: Client;
let lina: Client;
let sami: Client;
const DAY = 86_400_000;

const connect = async (a: Client, b: Client) => {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
};
const group = async (owner: Client, title: string, memberIds: string[] = []) =>
  await owner.post('/v1/conversations', { kind: 'group', title, memberIds });
const inIt = async (conversationId: string) =>
  (
    await t.ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', conversationId)
      .where('left_at', 'is', null)
      .execute()
  ).map((p) => p.user_id);
const invitationsOf = async (c: Client) => (await c.get('/v1/attention')).invitations as any[];
const told = async (userId: string) =>
  t.ctx.db
    .selectFrom('notifications')
    .select(['title', 'data'])
    .where('user_id', '=', userId)
    .where('kind', '=', 'place_invite')
    .execute();

beforeAll(async () => {
  t = await createTestApp();
  t.clock.set(new Date().toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Said' });
  sami = await signup(t, { displayName: 'Sami Young', birthDate: '2011-03-01' });
  await connect(noor, omar);
  await connect(noor, lina);
  // Under 18, Sami asks (an adult can't ask a stranger under 18, R29).
  await connect(sami, noor);
});
afterAll(async () => {
  await t.close();
});

describe('asked before being added (M16 B4)', () => {
  it('puts a connection in by default, and asks one who says to be asked first', async () => {
    const made = await group(noor, 'Book club', [omar.user.id]);
    const club = made.conversation.id as string;
    expect(made.invited).toEqual([]);
    expect(await inIt(club)).toContain(omar.user.id);

    // Lina says to be asked first: the add is an invitation, and she's not in it.
    await lina.req('PUT', '/v1/me/privacy', { groupAdds: 'ask' });
    expect((await lina.get('/v1/me')).user.privacy.groupAdds).toBe('ask');
    const added = await noor.post(`/v1/conversations/${club}/members`, {
      userIds: [lina.user.id],
    });
    expect(added).toEqual({ ok: true, added: [], invited: [lina.user.id] });
    expect(await inIt(club)).not.toContain(lina.user.id);
    // Asking again is once.
    await noor.post(`/v1/conversations/${club}/members`, { userIds: [lina.user.id] });
    const [invitation, ...more] = await invitationsOf(lina);
    expect(more).toEqual([]);
    expect(invitation).toMatchObject({
      kind: 'group',
      placeId: club,
      name: 'Book club',
      people: 2,
      by: { displayName: 'Noor Haddad' },
    });
    expect(await told(lina.user.id)).toEqual([
      { title: 'Noor Haddad invited you to “Book club”', data: { invitation: invitation.id } },
    ]);
    // Nothing of the group is hers before she says yes.
    expect((await lina.req('GET', `/v1/conversations/${club}`)).statusCode).toBe(404);

    // Yes: she's in, through the group's own way in, and it's off her list.
    const accepted = await lina.post(`/v1/invitations/${invitation.id}/accept`, {});
    expect(accepted).toEqual({ conversationId: club, spaceId: null });
    expect(await inIt(club)).toContain(lina.user.id);
    expect(await invitationsOf(lina)).toEqual([]);
    expect((await lina.req('POST', `/v1/invitations/${invitation.id}/accept`, {})).statusCode).toBe(
      404,
    );
  });

  it('a decline is done, tells nobody, and an inviter who stopped running it opens nothing', async () => {
    const made = await group(noor, 'Running', [omar.user.id]);
    const running = made.conversation.id as string;
    await noor.post(`/v1/conversations/${running}/members`, { userIds: [lina.user.id] });
    const [first] = await invitationsOf(lina);
    const before = (await told(noor.user.id)).length;
    expect(await lina.post(`/v1/invitations/${first.id}/decline`, {})).toEqual({ ok: true });
    expect(await inIt(running)).not.toContain(lina.user.id);
    expect(await invitationsOf(lina)).toEqual([]);
    expect((await told(noor.user.id)).length).toBe(before);

    // Omar, an admin, invites her again; once he isn't one, his invitation is closed.
    await noor.req('PATCH', `/v1/conversations/${running}/members/${omar.user.id}`, {
      role: 'admin',
    });
    await connect(omar, lina);
    await omar.post(`/v1/conversations/${running}/members`, { userIds: [lina.user.id] });
    const [second] = await invitationsOf(lina);
    expect(second.by.displayName).toBe('Omar Farouk');
    await noor.req('PATCH', `/v1/conversations/${running}/members/${omar.user.id}`, {
      role: 'member',
    });
    expect(await invitationsOf(lina)).toEqual([]);
    expect((await lina.req('POST', `/v1/invitations/${second.id}/accept`, {})).statusCode).toBe(
      403,
    );
    expect(await inIt(running)).not.toContain(lina.user.id);
  });

  it('asks someone under 18 wherever someone there is a stranger to them', async () => {
    // Among only their connections, they go straight in.
    const ours = await group(noor, 'Family', [sami.user.id]);
    expect(ours.invited).toEqual([]);
    expect(await inIt(ours.conversation.id)).toContain(sami.user.id);

    // Beside Omar, whom Sami doesn't know, they're asked first.
    const theirs = await group(noor, 'Neighbours', [omar.user.id, sami.user.id]);
    expect(theirs.invited).toEqual([sami.user.id]);
    expect(await inIt(theirs.conversation.id)).not.toContain(sami.user.id);
    const [invitation] = await invitationsOf(sami);
    expect(invitation).toMatchObject({ placeId: theirs.conversation.id, people: 2 });

    // Where a link lets anyone in by itself, nobody under 18 comes in by any way: refused as the
    // way in refuses them, never an invitation they could never accept.
    const open = (await group(noor, 'Open door', [omar.user.id])).conversation.id as string;
    await noor.post(`/v1/conversations/${open}/join-links`, {});
    const refused = await noor.req('POST', `/v1/conversations/${open}/members`, {
      userIds: [sami.user.id],
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.message).toBe('They can’t join while a link to it is open.');
    expect((await invitationsOf(sami)).map((i) => i.placeId)).toEqual([theirs.conversation.id]);
  });

  it('a block either way is answered as an invitation, and reaches nobody', async () => {
    const walkers = (await group(noor, 'Walkers', [omar.user.id])).conversation.id as string;
    await omar.post('/v1/blocks', { userId: noor.user.id });
    const added = await noor.post(`/v1/conversations/${walkers}/members`, {
      userIds: [omar.user.id],
    });
    expect(added.invited).toEqual([]);
    // Omar is already in it; one who blocked and isn't in it is answered as invited, untold.
    const quiet = (await group(noor, 'Quiet', [])).conversation.id as string;
    const asked = await noor.post(`/v1/conversations/${quiet}/members`, {
      userIds: [omar.user.id],
    });
    expect(asked).toEqual({ ok: true, added: [], invited: [omar.user.id] });
    expect(await inIt(quiet)).not.toContain(omar.user.id);
    expect(await invitationsOf(omar)).toEqual([]);
    await omar.req('DELETE', `/v1/blocks/${noor.user.id}`);
  });

  it('asks into a space the same way, and lands there on yes', async () => {
    const made = await noor.post('/v1/spaces', {
      name: 'Garden',
      kind: 'community',
      memberIds: [lina.user.id],
    });
    expect(made.invited).toEqual([lina.user.id]);
    const [invitation] = await invitationsOf(lina);
    expect(invitation).toMatchObject({ kind: 'space', placeId: made.space.id, name: 'Garden' });
    const accepted = await lina.post(`/v1/invitations/${invitation.id}/accept`, {});
    expect(accepted).toEqual({ conversationId: null, spaceId: made.space.id });
    const members = await t.ctx.db
      .selectFrom('space_members')
      .select('user_id')
      .where('space_id', '=', made.space.id)
      .where('left_at', 'is', null)
      .execute();
    expect(members.map((m) => m.user_id)).toContain(lina.user.id);
  });

  it('keeps an invitation in its person’s export, and lets an answered one go after its time', async () => {
    const data = (await buildExport(t.ctx, lina.user.id, t.ctx.now())) as any;
    expect(data.placeInvitations.length).toBeGreaterThan(0);
    expect(data.placeInvitations[0]).toMatchObject({ to: 'group', outcome: 'accepted' });
    expect(JSON.stringify(data.placeInvitations)).not.toContain(noor.user.id);
    const count = async () =>
      (await t.ctx.db.selectFrom('place_invites').select('id').execute()).length;
    const before = await count();
    t.clock.advance((KEPT_DAYS.spentInvites + 8) * DAY);
    await sweepRecords(t.ctx);
    expect(await count()).toBeLessThan(before);
    expect(await count()).toBe(0);
  });
});

describe('a day’s message requests (M16 B4)', () => {
  it(`starts at most ${REQUESTS_PER_DAY} new requests a day; reopening one never counts`, async () => {
    // On the real clock, as the database stamps conversations (and the sweep above moved it on).
    t.clock.set(new Date().toISOString());
    const writer = await signup(t, { displayName: 'Rana Writer' });
    const strangers = await Promise.all(
      Array.from({ length: REQUESTS_PER_DAY + 1 }, (_, i) =>
        signup(t, { displayName: `Stranger ${i}` }),
      ),
    );
    const open = (c: Client) =>
      writer.req('POST', '/v1/conversations', { kind: 'direct', userId: c.user.id });
    for (const s of strangers.slice(0, REQUESTS_PER_DAY))
      expect((await open(s)).statusCode).toBe(201);
    const over = await open(strangers[REQUESTS_PER_DAY]!);
    expect(over.statusCode).toBe(429);
    expect(over.json().error.code).toBe('requests_today');
    // One already started reopens, whatever the count.
    expect((await open(strangers[0]!)).statusCode).toBe(200);
    // A day on, there's room again.
    t.clock.advance(DAY + 60_000);
    expect((await open(strangers[REQUESTS_PER_DAY]!)).statusCode).toBe(201);
    // Writing to a connection is no request at all.
    await connect(writer, noor);
    const toNoor = await writer.req('POST', '/v1/conversations', {
      kind: 'direct',
      userId: noor.user.id,
    });
    expect(toNoor.statusCode).toBeLessThan(300);
  });
});
