import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../src/lib/crypto';
import { memoryMailer } from '../src/lib/email';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let mail: ReturnType<typeof memoryMailer>;
let ana: Client;
let ben: Client;
let convo: string;

const meeting = async (fields: Record<string, unknown>) => {
  const card = (
    await ana.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit: 'meeting', fields },
    })
  ).message;
  await ben.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
  return card as { id: string };
};
const tomorrow = { at: '2026-10-21T09:00:00.000Z', hasTime: true };

beforeAll(async () => {
  mail = memoryMailer();
  t = await createTestApp({}, { mail });
  t.clock.set('2026-10-20T08:00:00Z');
  ana = await signup(t, { displayName: 'Ana Host' });
  ben = await signup(t, { displayName: 'Ben Host' });
  const r = await ana.post('/v1/connections/requests', {
    toUserId: ben.user.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  await ben.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  convo = (await ana.post('/v1/conversations', { kind: 'direct', userId: ben.user.id }))
    .conversation.id;
  await send(ana, 'Our private history, never a guest’s.');
});
afterAll(async () => {
  await t.close();
});
const send = (c: Client, body: string) =>
  c.post(`/v1/conversations/${convo}/messages`, { clientId: uuidv4(), kind: 'text', body });

describe('guests in a meeting (R84)', () => {
  it('gives the meeting its own space, moves the card there, and mails the guest an invitation', async () => {
    const card = await meeting({ title: 'Launch review', start: tomorrow, durationMinutes: 30 });
    const { space } = await ana.post(`/v1/messages/${card.id}/guests`, {
      email: 'Gus@Example.com',
      name: 'Gus Guest',
    });
    await t.ctx.flush();
    // The space: Ana, Ben and the guest; a copy of the card, accepted.
    const seen = await ana.get(`/v1/conversations/${space.conversationId}`);
    expect(seen.conversation).toMatchObject({ kind: 'group', title: 'Launch review' });
    const people = await t.ctx.db
      .selectFrom('participants as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select(['u.kind', 'u.email', 'p.request_state'])
      .where('p.conversation_id', '=', space.conversationId)
      .execute();
    expect(people).toHaveLength(3);
    expect(people.find((p) => p.kind === 'provisional')).toMatchObject({
      email: 'gus@example.com',
      request_state: null,
    });
    const copy = await t.ctx.db
      .selectFrom('messages')
      .select(['payload', 'conversation_id'])
      .where('id', '=', space.messageId)
      .executeTakeFirstOrThrow();
    expect(copy.payload).toMatchObject({ kit: 'meeting', state: 'accepted', spaceOf: card.id });
    // The original says where it went, and has left the calendar to the copy.
    const original = await t.ctx.db
      .selectFrom('messages')
      .select('payload')
      .where('id', '=', card.id)
      .executeTakeFirstOrThrow();
    expect(original.payload).toMatchObject({
      movedTo: { conversationId: space.conversationId, messageId: space.messageId },
    });
    const window = 'from=2026-10-20T00:00:00Z&to=2026-10-31T00:00:00Z';
    const items = (await ana.get(`/v1/calendar?${window}`)).items.filter(
      (i: { title: string }) => i.title === 'Launch review',
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: space.messageId, conversationId: space.conversationId });
    // The guest's mail: a calendar invitation, and their own link, kept hashed.
    const sent = mail.outbox.at(-1)!;
    expect(sent).toMatchObject({ to: 'gus@example.com', kind: 'invitation' });
    expect(sent.subject).toBe('Invitation: Launch review');
    expect(sent.icalEvent?.method).toBe('REQUEST');
    const ics = sent.icalEvent!.content.replace(/\r\n /g, '');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('DTSTART:20261021T090000Z');
    expect(ics).toContain('DTEND:20261021T093000Z');
    expect(ics).toContain('mailto:gus@example.com');
    const token = /\/j\/(cmg_[A-Za-z0-9_-]+)/.exec(sent.text)?.[1];
    expect(token).toBeTruthy();
    const row = await t.ctx.db
      .selectFrom('meeting_guests')
      .select(['token_hash', 'revoked_at'])
      .where('space_message_id', '=', space.messageId)
      .executeTakeFirstOrThrow();
    expect(Buffer.compare(row.token_hash, hashToken(token!))).toBe(0);
    // The guest was never put in the conversation the meeting was agreed in.
    const inOriginal = await t.ctx.db
      .selectFrom('participants as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select('u.kind')
      .where('p.conversation_id', '=', convo)
      .execute();
    expect(inOriginal.every((p) => p.kind === 'human')).toBe(true);

    // A second guest joins the same space; the first again gets a new link, the old one ended.
    await ben.post(`/v1/messages/${space.messageId}/guests`, { email: 'hal@example.com' });
    const again = await ana.post(`/v1/messages/${card.id}/guests`, { email: 'gus@example.com' });
    expect(again.space).toEqual(space);
    await t.ctx.flush();
    const rows = await t.ctx.db
      .selectFrom('meeting_guests')
      .select('token_hash')
      .where('space_message_id', '=', space.messageId)
      .execute();
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => Buffer.compare(r.token_hash, hashToken(token!)) === 0)).toBe(false);
    // Ana's export says whom she invited, never their link.
    const archive = (await ana.req('GET', '/v1/me/export')).json();
    expect(archive.meetingInvitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          meetingSpaceId: space.conversationId,
          as: 'inviter',
          guest: 'Gus Guest',
        }),
      ]),
    );
    expect(JSON.stringify(archive)).not.toContain(token!);
  });

  it('only for an accepted meeting held on Caime, by someone in it, never from elsewhere', async () => {
    const zoom = await meeting({ title: 'Elsewhere', start: tomorrow, place: 'zoom.us/j/1' });
    expect(
      (await ana.req('POST', `/v1/messages/${zoom.id}/guests`, { email: 'x@example.com' }))
        .statusCode,
    ).toBe(400);
    const asked = (
      await ana.post(`/v1/conversations/${convo}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: { kit: 'meeting', fields: { title: 'Not yet', start: tomorrow } },
      })
    ).message;
    expect(
      (await ana.req('POST', `/v1/messages/${asked.id}/guests`, { email: 'x@example.com' }))
        .statusCode,
    ).toBe(400);
    const zed = await signup(t, { displayName: 'Zed Outsider' });
    const fine = await meeting({ title: 'Ours', start: tomorrow });
    expect(
      (await zed.req('POST', `/v1/messages/${fine.id}/guests`, { email: 'x@example.com' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await ana.req('POST', `/v1/messages/${fine.id}/guests`, { email: 'not an address' }))
        .statusCode,
    ).toBe(400);
  });

  it('asks someone already on Caime, as a request, and never says whether they are', async () => {
    const cy = await signup(t, { displayName: 'Cy Member' });
    const card = await meeting({ title: 'With Cy', start: tomorrow });
    const before = mail.outbox.length;
    const { space } = await ana.post(`/v1/messages/${card.id}/guests`, {
      email: cy.user.email ?? `${cy.user.handle}@example.com`,
    });
    await t.ctx.flush();
    const cyIn = await t.ctx.db
      .selectFrom('participants')
      .select('request_state')
      .where('conversation_id', '=', space.conversationId)
      .where('user_id', '=', cy.user.id)
      .executeTakeFirstOrThrow();
    expect(cyIn.request_state).toBe('pending');
    expect(mail.outbox.length).toBe(before + 1);
  });

  it('makes one space when two invitations come at once', async () => {
    const card = await meeting({ title: 'Both at once', start: tomorrow });
    const [a, b] = await Promise.all([
      ana.post(`/v1/messages/${card.id}/guests`, { email: 'una@example.com' }),
      ben.post(`/v1/messages/${card.id}/guests`, { email: 'vic@example.com' }),
    ]);
    expect(a.space).toEqual(b.space);
    const copies = await t.ctx.db
      .selectFrom('messages')
      .select('id')
      .where(sql`payload->>'spaceOf'`, '=', card.id)
      .execute();
    expect(copies.map((c) => c.id)).toEqual([a.space.messageId]);
    const spaces = await t.ctx.db
      .selectFrom('meeting_spaces')
      .select(['conversation_id', 'space_message_id'])
      .where('message_id', '=', card.id)
      .execute();
    expect(spaces).toEqual([
      { conversation_id: a.space.conversationId, space_message_id: a.space.messageId },
    ]);
    const guests = await t.ctx.db
      .selectFrom('participants as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select('u.email')
      .where('p.conversation_id', '=', a.space.conversationId)
      .where('u.kind', '=', 'provisional')
      .orderBy('u.email')
      .execute();
    expect(guests.map((g) => g.email)).toEqual(['una@example.com', 'vic@example.com']);
    // The copy is accepted everywhere it's shown, and only then could anyone invite from it.
    const copy = (
      await ana.get(`/v1/conversations/${a.space.conversationId}/messages`)
    ).messages.find((m: { id: string }) => m.id === a.space.messageId);
    expect(copy.payload).toMatchObject({ state: 'accepted', spaceOf: card.id });
  });

  it('never brings a guest to anyone under 18 (R29), and says so without saying who', async () => {
    const asAge = (id: string, birthDate: string) =>
      t.ctx.db.updateTable('users').set({ birth_date: birthDate }).where('id', '=', id).execute();
    // Someone in the meeting is under 18: no guest, and nothing is made for one.
    const card = await meeting({ title: 'With a teen', start: tomorrow });
    await asAge(ben.user.id, '2012-01-01');
    try {
      const sentBefore = mail.outbox.length;
      const res = await ana.req('POST', `/v1/messages/${card.id}/guests`, {
        email: 'wes@example.com',
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.message).toBe('Guests aren’t available in this conversation.');
      await t.ctx.flush();
      expect(mail.outbox.length).toBe(sentBefore);
      const made = await t.ctx.db
        .selectFrom('meeting_spaces')
        .select('conversation_id')
        .where('message_id', '=', card.id)
        .execute();
      expect(made).toEqual([]);
    } finally {
      await asAge(ben.user.id, '1990-12-31');
    }

    // An address that is the account of someone under 18: asked nothing, sent nothing, and the
    // answer is the same as for anyone.
    const teen = await signup(t, { displayName: 'Tia Teen', birthDate: '2011-12-31' });
    const other = await meeting({ title: 'Not for a teen', start: tomorrow });
    const sentBefore = mail.outbox.length;
    const { space } = await ana.post(`/v1/messages/${other.id}/guests`, {
      email: teen.user.email ?? `${teen.user.handle}@example.com`,
    });
    await t.ctx.flush();
    expect(mail.outbox.length).toBe(sentBefore);
    const teenIn = await t.ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', space.conversationId)
      .where('user_id', '=', teen.user.id)
      .execute();
    expect(teenIn).toEqual([]);

    // A conversation that holds a guest takes nobody under 18 through the members route either.
    const dee = await signup(t, { displayName: 'Dee Connection' });
    const r = await ana.post('/v1/connections/requests', {
      toUserId: dee.user.id,
      relationship: { sphere: 'friend' },
    });
    await dee.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    await ana.post(`/v1/messages/${other.id}/guests`, { email: 'xan@example.com' });
    await asAge(dee.user.id, '2012-01-01');
    const added = await ana.req('POST', `/v1/conversations/${space.conversationId}/members`, {
      userIds: [dee.user.id],
    });
    expect(added.statusCode).toBe(403);
    expect(added.json().error.message).toBe('They can’t join a conversation with guests.');
    await asAge(dee.user.id, '1990-12-31');
    expect(
      (
        await ana.req('POST', `/v1/conversations/${space.conversationId}/members`, {
          userIds: [dee.user.id],
        })
      ).statusCode,
    ).toBe(200);
  });

  it('asks someone on Caime only as a message request could (their own setting)', async () => {
    const quiet = await signup(t, { displayName: 'Quinn Quiet' });
    await quiet.req('PUT', '/v1/me/privacy', { messageRequests: 'nobody' });
    const card = await meeting({ title: 'Quiet please', start: tomorrow });
    const sentBefore = mail.outbox.length;
    const res = await ana.req('POST', `/v1/messages/${card.id}/guests`, {
      email: quiet.user.email ?? `${quiet.user.handle}@example.com`,
    });
    // The same answer as for anyone: nothing says the address is on Caime, or that it said no.
    expect(res.statusCode).toBe(201);
    await t.ctx.flush();
    expect(mail.outbox.length).toBe(sentBefore);
    const quietIn = await t.ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', res.json().space.conversationId)
      .where('user_id', '=', quiet.user.id)
      .execute();
    expect(quietIn).toEqual([]);
  });
});
