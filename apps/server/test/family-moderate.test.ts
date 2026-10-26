/**
 * Moderate (R122 (2), M16 B8d): a parent who looks after their child may also say yes to every new
 * way in, both ways. An invitation into a group, a message request the child would take and an
 * organization the child would start writing to each wait on the parent, in Family; agreed, it's
 * done as the child would have done it, declined it's let go, and the child is told either way.
 * Never a message's words. Turned off, whatever waited goes on.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildExport } from '../src/lib/export';
import { type Client, clientFor, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let mum: Client;
let aunt: Client;
let owner: Client;
let yara: Client;
let orgId: string;

const inIt = async (conversationId: string) =>
  (
    await t.ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', conversationId)
      .where('left_at', 'is', null)
      .execute()
  ).map((p) => p.user_id);
const told = async (userId: string) =>
  (
    await t.ctx.db
      .selectFrom('notifications')
      .select('title')
      .where('user_id', '=', userId)
      .where('kind', '=', 'family')
      .orderBy('created_at')
      .execute()
  ).map((n) => n.title);
const asksOf = async (c: Client) => (await c.get('/v1/me/family')).asks as any[];

beforeAll(async () => {
  t = await createTestApp();
  t.clock.set(new Date().toISOString());
  mum = await signup(t, { displayName: 'Mona Mother', country: 'EG', timeZone: 'Africa/Cairo' });
  aunt = await signup(t, { displayName: 'Hala Aunt', country: 'EG', timeZone: 'Africa/Cairo' });
  owner = await signup(t, { displayName: 'Nile Owner', country: 'EG', timeZone: 'Africa/Cairo' });
  // Yara, 14 in Egypt, signs up on her own and asks her mother, who agrees with Moderate on.
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: {
      email: 'yara.moderated@example.com',
      password: 'correct horse battery',
      displayName: 'Yara Daughter',
      handle: `yaram${Date.now().toString(36)}`,
      birthDate: '2012-05-01',
      country: 'EG',
      timeZone: 'Africa/Cairo',
      locale: 'en-EG',
      client: 'native',
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  yara = clientFor(t, res.json().token, res.json().user);
  await yara.post('/v1/me/family/parent', { handle: mum.user.handle });
  await mum.post(`/v1/me/family/children/${yara.user.id}/consent`, { moderates: true });
  // Her aunt is her mother's connection, and becomes Yara's with her mother's yes (R122).
  const r = await aunt.post('/v1/connections/requests', { toUserId: mum.user.id });
  await mum.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  // A verified organization, which someone under 18 may write to at all (R29).
  orgId = (
    await owner.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Books',
      handle: 'nile.books.m',
      kind: 'shop',
    })
  ).org.id;
  await t.ctx.db
    .updateTable('organizations')
    .set({ verified_at: new Date() })
    .where('id', '=', orgId)
    .execute();
});
afterAll(() => t.close());

describe('Moderate (R122 (2))', () => {
  it('is chosen as the parent agrees, and both of them see it', async () => {
    const family = await mum.get('/v1/me/family');
    expect(family.children[0]).toMatchObject({
      state: 'agreed',
      supervised: true,
      moderates: true,
    });
    const mine = await yara.get('/v1/me/family');
    expect(mine.guardian).toMatchObject({ moderates: true, waitingAsks: [] });
  });

  it('a message request waits on the parent, who never sees its words', async () => {
    // Her aunt shares a connection with her (her mother), so she may write to her (R29).
    const convo = (await aunt.post('/v1/conversations', { kind: 'direct', userId: yara.user.id }))
      .conversation.id as string;
    await aunt.post(`/v1/conversations/${convo}/messages`, {
      kind: 'text',
      body: 'Hi Yara, it’s auntie Hala',
      clientId: crypto.randomUUID(),
    });
    expect((await yara.get(`/v1/conversations/${convo}`)).conversation.parentSays).toBe('ask');
    // Her accept asks her mother; her reply would take it, so it's refused the same way.
    expect(await yara.post(`/v1/conversations/${convo}/request`, { decision: 'accept' })).toEqual({
      ok: true,
      askedParent: true,
    });
    const reply = await yara.req('POST', `/v1/conversations/${convo}/messages`, {
      kind: 'text',
      body: 'Hi!',
      clientId: crypto.randomUUID(),
    });
    expect(reply.statusCode).toBe(403);
    expect(reply.json().error.code).toBe('guardian_asked');
    const view = (await yara.get(`/v1/conversations/${convo}`)).conversation;
    expect(view).toMatchObject({ request: 'incoming', parentSays: 'asked' });
    // Asked once, however many times she tries.
    const [ask, ...more] = await asksOf(mum);
    expect(more).toEqual([]);
    expect(ask).toMatchObject({
      kind: 'request',
      child: { id: yara.user.id },
      person: { id: aunt.user.id },
      place: null,
    });
    expect(JSON.stringify(ask)).not.toContain('auntie');
    await t.ctx.flush();
    expect(await told(mum.user.id)).toContain('Hala Aunt wrote to Yara Daughter');
    expect((await yara.get('/v1/me/family')).guardian.waitingAsks).toMatchObject([
      { kind: 'request', child: null, person: { id: aunt.user.id } },
    ]);
    // Allowed: taken as hers, and she's told.
    expect(await mum.post(`/v1/me/family/asks/${ask.id}/allow`, {})).toEqual({ ok: true });
    expect((await yara.get(`/v1/conversations/${convo}`)).conversation).toMatchObject({
      request: null,
      parentSays: null,
      me: { requestState: 'accepted' },
    });
    await t.ctx.flush();
    expect(await told(yara.user.id)).toContain('Your parent said yes to Hala Aunt’s message');
    expect(await asksOf(mum)).toEqual([]);
    // Answered once.
    expect((await mum.req('POST', `/v1/me/family/asks/${ask.id}/allow`, {})).statusCode).toBe(404);
  });

  it('an invitation into a group waits on the parent, and a no lets it go', async () => {
    // Connected through her mother's yes (R122), her aunt adds her to a group: invited, not put in.
    const req = await aunt.post('/v1/connections/requests', { toUserId: yara.user.id });
    const [waiting] = (await mum.get('/v1/me/family')).requests;
    await mum.post(`/v1/me/family/requests/${waiting.requestId}/allow`, {});
    await yara.post(`/v1/connections/requests/${req.requestId}/accept`, {});
    const made = await aunt.post('/v1/conversations', {
      kind: 'group',
      title: 'Cousins',
      memberIds: [yara.user.id],
    });
    const cousins = made.conversation.id as string;
    expect(made.invited).toEqual([yara.user.id]);
    const [invitation] = (await yara.get('/v1/attention')).invitations;
    expect(invitation).toMatchObject({ placeId: cousins, waitsForParent: false });
    expect(await yara.post(`/v1/invitations/${invitation.id}/accept`, {})).toEqual({
      conversationId: null,
      spaceId: null,
      askedParent: true,
    });
    expect(await inIt(cousins)).not.toContain(yara.user.id);
    expect((await yara.get('/v1/attention')).invitations[0]).toMatchObject({
      waitsForParent: true,
    });
    const [ask] = await asksOf(mum);
    expect(ask).toMatchObject({ kind: 'invite', place: 'Cousins', person: { id: aunt.user.id } });
    // Declined: she isn't in it, the invitation is over, and she's told.
    await mum.post(`/v1/me/family/asks/${ask.id}/decline`, {});
    expect(await inIt(cousins)).not.toContain(yara.user.id);
    await t.ctx.flush();
    expect(await told(yara.user.id)).toContain('Your parent said no to “Cousins”');

    // Asked again, and allowed: she's in, through the group's own way in.
    await aunt.post(`/v1/conversations/${cousins}/members`, { userIds: [yara.user.id] });
    const [again] = (await yara.get('/v1/attention')).invitations;
    await yara.post(`/v1/invitations/${again.id}/accept`, {});
    const [second] = await asksOf(mum);
    await mum.post(`/v1/me/family/asks/${second.id}/allow`, {});
    expect(await inIt(cousins)).toContain(yara.user.id);
    expect((await yara.get('/v1/attention')).invitations).toEqual([]);
  });

  it('writing to an organization waits on the parent; one she writes to already is hers', async () => {
    const first = await yara.req('POST', `/v1/orgs/${orgId}/conversations`, {});
    expect(first.statusCode).toBe(403);
    expect(first.json().error).toMatchObject({
      code: 'guardian_asked',
      message: 'Your parent or guardian says yes to this first. We asked them.',
    });
    const [ask] = await asksOf(mum);
    expect(ask).toMatchObject({ kind: 'organization', org: { name: 'Nile Books' } });
    await mum.post(`/v1/me/family/asks/${ask.id}/allow`, {});
    const thread = await t.ctx.db
      .selectFrom('business_threads')
      .select('conversation_id')
      .where('org_id', '=', orgId)
      .where('customer_id', '=', yara.user.id)
      .executeTakeFirst();
    expect(thread).toBeDefined();
    // Begun with her parent's yes: hers to open again, asking nobody.
    expect((await yara.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId).toBe(
      thread?.conversation_id,
    );
    expect(await asksOf(mum)).toEqual([]);
  });

  it('turned off, what waited goes on, and the child is told; it is in both exports', async () => {
    const other = (
      await owner.post('/v1/orgs', {
        country: 'EG',
        name: 'Nile Games',
        handle: 'nile.games.m',
        kind: 'shop',
      })
    ).org.id;
    await t.ctx.db
      .updateTable('organizations')
      .set({ verified_at: new Date() })
      .where('id', '=', other)
      .execute();
    expect((await yara.req('POST', `/v1/orgs/${other}/conversations`, {})).statusCode).toBe(403);
    expect(await asksOf(mum)).toHaveLength(1);
    // Only the parent who looks after her changes it.
    expect(
      (await aunt.req('PATCH', `/v1/me/family/children/${yara.user.id}`, { moderates: false }))
        .statusCode,
    ).toBe(200);
    expect((await mum.get('/v1/me/family')).children[0].moderates).toBe(true);
    await mum.req('PATCH', `/v1/me/family/children/${yara.user.id}`, { moderates: false });
    expect((await mum.get('/v1/me/family')).children[0].moderates).toBe(false);
    expect(await asksOf(mum)).toEqual([]);
    const thread = await t.ctx.db
      .selectFrom('business_threads')
      .select('conversation_id')
      .where('org_id', '=', other)
      .where('customer_id', '=', yara.user.id)
      .executeTakeFirst();
    expect(thread).toBeDefined();
    await t.ctx.flush();
    expect(await told(yara.user.id)).toContain(
      'Your parent no longer says yes to new groups, spaces and people first',
    );
    expect((await yara.get('/v1/me/family')).guardian.moderates).toBe(false);
    // Without it, an organization is hers to write to at once.
    const third = (
      await owner.post('/v1/orgs', {
        country: 'EG',
        name: 'Nile Pens',
        handle: 'nile.pens.m',
        kind: 'shop',
      })
    ).org.id;
    await t.ctx.db
      .updateTable('organizations')
      .set({ verified_at: new Date() })
      .where('id', '=', third)
      .execute();
    expect((await yara.req('POST', `/v1/orgs/${third}/conversations`, {})).statusCode).toBe(201);

    const hers = (await buildExport(t.ctx, yara.user.id, t.ctx.now())) as any;
    expect(hers.family[0]).toMatchObject({ youAre: 'child', moderates: false });
    expect(hers.familyAsks.map((a: any) => [a.youAre, a.kind, a.answer])).toEqual([
      ['child', 'request', 'yes'],
      ['child', 'invite', 'no'],
      ['child', 'invite', 'yes'],
      ['child', 'organization', 'yes'],
      ['child', 'organization', 'yes'],
    ]);
    const parents = (await buildExport(t.ctx, mum.user.id, t.ctx.now())) as any;
    expect(parents.familyAsks).toHaveLength(5);
    expect(JSON.stringify(parents.familyAsks)).not.toContain('Hala');
  });
});
