import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { type Client, clientFor, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let mail: ReturnType<typeof memoryMailer>;
let ana: Client;
let ben: Client;
let convo: string;

const linkIn = (text: string) => /\/j\/(cmg_[A-Za-z0-9_-]+)/.exec(text)?.[1] ?? '';
const anon = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
  t.app.inject({ method, url, payload: payload as never });

async function invite(email: string, title = 'Launch review') {
  const card = (
    await ana.post(`/v1/conversations/${convo}/messages`, {
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
  ).message;
  await ben.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
  const { space } = await ana.post(`/v1/messages/${card.id}/guests`, { email });
  await t.ctx.flush();
  return { space, token: linkIn(mail.outbox.at(-1)!.text) };
}

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
  await ana.post(`/v1/conversations/${convo}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body: 'Our history, never a guest’s.',
  });
});
afterAll(async () => {
  await t.close();
});

describe('a guest’s way in (R84)', () => {
  it('reads the link, joins, and is in the meeting’s space and its call, nowhere else', async () => {
    const { space, token } = await invite('gus@example.com');
    const seen = await anon('GET', `/v1/join/${token}`);
    expect(seen.statusCode).toBe(200);
    expect(seen.json()).toMatchObject({
      meeting: { title: 'Launch review', at: '2026-10-21T09:00:00.000Z', host: 'Ana Host' },
      guest: { name: 'gus' },
      signIn: false,
    });
    const took = await anon('POST', `/v1/join/${token}`, {
      name: 'Gus Guest',
      adult: true,
      client: 'native',
    });
    expect(took.statusCode).toBe(200);
    const joined = took.json();
    expect(joined).toMatchObject({
      conversationId: space.conversationId,
      messageId: space.messageId,
    });
    const guest = clientFor(t, joined.token, { id: '', handle: '', displayName: 'Gus Guest' });
    // Their name, as they gave it; and their session ends a day after the meeting.
    expect((await guest.get('/v1/me')).user.displayName).toBe('Gus Guest');
    const session = await t.ctx.db
      .selectFrom('sessions')
      .select('expires_at')
      .where('device_name', '=', 'Guest')
      .executeTakeFirstOrThrow();
    expect(session.expires_at.toISOString()).toBe('2026-10-22T09:30:00.000Z');
    // The space and its card: yes. The conversation it was agreed in, the chat list, people: no.
    expect((await guest.req('GET', `/v1/conversations/${space.conversationId}`)).statusCode).toBe(
      200,
    );
    const page = await guest.get(`/v1/conversations/${space.conversationId}/messages`);
    expect(page.messages.some((m: { id: string }) => m.id === space.messageId)).toBe(true);
    expect((await guest.req('GET', `/v1/conversations/${convo}`)).statusCode).not.toBe(200);
    expect((await guest.req('GET', `/v1/conversations/${convo}/messages`)).statusCode).not.toBe(
      200,
    );
    expect((await guest.req('GET', '/v1/inbox')).statusCode).toBe(403);
    expect((await guest.req('GET', '/v1/search?q=ben')).statusCode).toBe(403);
    expect(
      (
        await guest.req('POST', `/v1/conversations/${space.conversationId}/messages`, {
          clientId: uuidv4(),
          kind: 'text',
          body: 'hi',
        })
      ).statusCode,
    ).toBe(403);
    // The meeting's call: Ana starts it, the guest joins it.
    const { call } = await ana.post(`/v1/conversations/${space.conversationId}/group-calls`, {
      kind: 'video',
      deviceId: uuidv4(),
    });
    const inIt = await guest.post(`/v1/group-calls/${call.id}/join`, { deviceId: uuidv4() });
    expect(inIt.call.state).not.toBe('ended');
    const said = await t.ctx.db
      .selectFrom('meeting_guests')
      .select(['adult', 'joined_at'])
      .where('space_message_id', '=', space.messageId)
      .executeTakeFirstOrThrow();
    expect(said.adult).toBe(true);
    expect(said.joined_at).not.toBeNull();
  });

  it('is gone once replaced, once the meeting is a day past, and never for a guess', async () => {
    const { token } = await invite('hal@example.com', 'Second');
    const { token: newer } = await invite('hal@example.com', 'Third');
    expect((await anon('GET', `/v1/join/${newer}`)).statusCode).toBe(200);
    expect((await anon('GET', `/v1/join/cmg_${'x'.repeat(30)}`)).statusCode).toBe(404);
    expect((await anon('GET', '/v1/join/nonsense')).statusCode).toBe(404);
    expect(token).not.toBe(newer);
    t.clock.set('2026-10-22T09:31:00Z');
    expect((await anon('GET', `/v1/join/${newer}`)).statusCode).toBe(404);
    t.clock.set('2026-10-20T08:00:00Z');
  });

  it('tells someone on Caime to sign in, and never signs anyone out', async () => {
    const cy = await signup(t, { displayName: 'Cy Member' });
    const { token } = await invite(`${cy.user.handle}@example.com`, 'With Cy');
    expect((await anon('GET', `/v1/join/${token}`)).json()).toMatchObject({ signIn: true });
    const took = await anon('POST', `/v1/join/${token}`, { adult: true });
    expect(took.statusCode).toBe(409);
    expect(took.json().error.code).toBe('sign_in');
    const { token: gusAgain } = await invite('ivy@example.com', 'Ivy');
    const asBen = await ben.req('POST', `/v1/join/${gusAgain}`, { adult: true });
    expect(asBen.statusCode).toBe(409);
    expect(asBen.json().error.code).toBe('wrong_account');
  });
});
