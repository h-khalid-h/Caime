/**
 * A guest by link (review 2026-10-17 §1 H6): for someone better reached on WhatsApp, or where an
 * instance can't send mail, the inviter names a guest and gets their link, shown once, to send
 * themselves. The guest is a provisional person of their own with
 * no address, whose only conversation is the meeting's space: nobody's address, and nothing
 * anyone wrote to one, is behind a link someone else was handed.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LINK_GUEST_DOMAIN, personForAddress } from '../src/lib/provisional';
import { type Client, clientFor, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let ana: Client;
let ben: Client;
let convo: string;

const tokenOf = (link: string) => /\/j\/(cmg_[A-Za-z0-9_-]+)$/.exec(link)?.[1] ?? '';
const anon = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as never });

async function agreed(title: string, conversationId = convo) {
  const card = (
    await ana.post(`/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: {
          title,
          start: { at: '2026-10-21T09:00:00.000Z', hasTime: true },
          durationMinutes: 30,
        },
      },
    })
  ).message as { id: string };
  await ben.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
  return card;
}

beforeAll(async () => {
  // No mailer: the link is the way in where an instance can't send mail.
  t = await createTestApp();
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
  await ana.post(`/v1/conversations/${convo}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body: 'Our history, never a guest’s.',
  });
});
afterAll(async () => {
  await t.close();
});

describe('a guest by link (H6)', () => {
  it('works without a mailer: the link comes back once, and joins its holder to the meeting alone', async () => {
    const card = await agreed('Launch review');
    // By address there's no sending here; by link there is a way.
    const byMail = await ana.req('POST', `/v1/messages/${card.id}/guests`, {
      email: 'gus@example.com',
    });
    expect(byMail.statusCode).toBe(503);
    const made = await ana.req('POST', `/v1/messages/${card.id}/guests`, {
      link: true,
      name: 'Gus Guest',
    });
    expect(made.statusCode).toBe(201);
    const { space, link } = made.json() as {
      space: { conversationId: string; messageId: string };
      link: string;
    };
    expect(link).toMatch(/^http:\/\/localhost:8787\/j\/cmg_[A-Za-z0-9_-]{43}$/);
    // The guest is their own provisional person, at no one's address, in the space alone.
    const guests = await t.ctx.db
      .selectFrom('participants as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select(['u.id', 'u.kind', 'u.email', 'u.display_name', 'p.conversation_id'])
      .where('u.kind', '=', 'provisional')
      .execute();
    expect(guests).toHaveLength(1);
    expect(guests[0]).toMatchObject({
      kind: 'provisional',
      display_name: 'Gus Guest',
      conversation_id: space.conversationId,
    });
    expect(guests[0]?.email.endsWith(`@${LINK_GUEST_DOMAIN}`)).toBe(true);
    // The link reads as any guest's, with the name the inviter gave, and takes them in.
    const token = tokenOf(link);
    const seen = await anon('GET', `/v1/join/${token}`);
    expect(seen.json()).toMatchObject({
      meeting: { title: 'Launch review', host: 'Ana Host' },
      guest: { name: 'Gus Guest' },
      signIn: false,
    });
    const took = await anon('POST', `/v1/join/${token}`, { adult: true, client: 'native' });
    expect(took.statusCode).toBe(200);
    const guest = clientFor(t, took.json().token, {
      id: guests[0]?.id ?? '',
      handle: '',
      displayName: 'Gus Guest',
    });
    expect((await guest.req('GET', `/v1/conversations/${space.conversationId}`)).statusCode).toBe(
      200,
    );
    // The conversation it was agreed in stays Ana's and Ben's.
    expect((await guest.req('GET', `/v1/conversations/${convo}`)).statusCode).not.toBe(200);
  });

  it('gives the same guest a new link when asked again by name, and ends the last', async () => {
    const card = await agreed('Design review');
    const first = await ana.post(`/v1/messages/${card.id}/guests`, { link: true, name: 'Lina' });
    const again = await ana.post(`/v1/messages/${card.id}/guests`, { link: true, name: 'lina ' });
    expect(again.space).toEqual(first.space);
    expect(again.link).not.toBe(first.link);
    expect((await anon('GET', `/v1/join/${tokenOf(first.link)}`)).statusCode).toBe(404);
    expect((await anon('GET', `/v1/join/${tokenOf(again.link)}`)).statusCode).toBe(200);
    // One Lina in the space; another name is another guest.
    await ana.post(`/v1/messages/${card.id}/guests`, { link: true, name: 'Omar' });
    const named = await t.ctx.db
      .selectFrom('participants as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select('u.display_name')
      .where('p.conversation_id', '=', first.space.conversationId)
      .where('u.kind', '=', 'provisional')
      .orderBy('u.display_name')
      .execute();
    expect(named.map((n) => n.display_name)).toEqual(['Lina', 'Omar']);
  });

  it('needs a name, and keeps the rules any guest keeps (R29)', async () => {
    const card = await agreed('Budget review');
    const nameless = await ana.req('POST', `/v1/messages/${card.id}/guests`, {
      link: true,
      name: ' ',
    });
    expect(nameless.statusCode).toBe(400);
    // A conversation with someone under 18 in it takes no guest, and someone under 18 never
    // invites one: said without saying who.
    const asAge = (id: string, birthDate: string) =>
      t.ctx.db.updateTable('users').set({ birth_date: birthDate }).where('id', '=', id).execute();
    await asAge(ben.user.id, '2012-01-01');
    try {
      const withTeen = await ana.req('POST', `/v1/messages/${card.id}/guests`, {
        link: true,
        name: 'A stranger',
      });
      expect(withTeen.statusCode).toBe(403);
      expect(withTeen.json().error.message).toBe('Guests aren’t available in this conversation.');
    } finally {
      await asAge(ben.user.id, '1990-12-31');
    }
    await asAge(ana.user.id, '2012-01-01');
    try {
      const byTeen = await ana.req('POST', `/v1/messages/${card.id}/guests`, {
        link: true,
        name: 'A stranger',
      });
      expect(byTeen.statusCode).toBe(403);
      expect(byTeen.json().error.message).toBe('Guests are invited by people 18 or over.');
    } finally {
      await asAge(ana.user.id, '1990-12-31');
    }
    // Nothing was made for either: no space, no guest.
    const made = await t.ctx.db
      .selectFrom('meeting_spaces')
      .select('conversation_id')
      .where('message_id', '=', card.id)
      .execute();
    expect(made).toEqual([]);
  });

  it('is no one’s address: nobody is written to there, or invited by it', async () => {
    expect(await personForAddress(t.ctx, `someone@${LINK_GUEST_DOMAIN}`, 'Someone')).toBeNull();
  });
});
