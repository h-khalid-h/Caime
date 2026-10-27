/**
 * A meeting's guest writes while its call is on (R121 (5), M17 I13j): words alone, only a guest
 * who said they're 18 or over, only while the group call there is on and they're in it, each line
 * marked a guest's and reportable as anyone's; read-only again after.
 */
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

/** A meeting agreed by Ana and Ben, a guest invited by address, and that guest's session. */
async function guestIn(title: string, email: string, adult: boolean) {
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
  const took = await t.app.inject({
    method: 'POST',
    url: `/v1/join/${linkIn(mail.outbox.at(-1)!.text)}`,
    payload: { name: 'Gus Guest', adult, client: 'native' },
  });
  expect(took.statusCode).toBe(200);
  const guest = clientFor(t, took.json().token, { id: '', handle: '', displayName: 'Gus Guest' });
  guest.user.id = (await guest.get('/v1/me')).user.id;
  return { conversationId: space.conversationId as string, guest };
}

const words = (body: string, more: Record<string, unknown> = {}) => ({
  clientId: uuidv4(),
  kind: 'text',
  body,
  ...more,
});

beforeAll(async () => {
  mail = memoryMailer();
  t = await createTestApp({}, { mail });
  t.clock.set('2026-10-21T08:55:00Z');
  ana = await signup(t, { displayName: 'Ana Host' });
  ben = await signup(t, { displayName: 'Ben Host' });
  const r = await ana.post('/v1/connections/requests', {
    toUserId: ben.user.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  await ben.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  convo = (await ana.post('/v1/conversations', { kind: 'direct', userId: ben.user.id }))
    .conversation.id;
});
afterAll(async () => {
  await t.close();
});

describe('a guest writes while the call is on (M17 I13j)', () => {
  it('writes words while in the call, marked a guest’s, reportable, and read-only again after', async () => {
    const { conversationId, guest } = await guestIn('Launch review', 'gus@example.com', true);
    const send = (body: unknown) =>
      guest.req('POST', `/v1/conversations/${conversationId}/messages`, body);

    // Before the call: they read, and write nothing.
    const early = await send(words('Hello before'));
    expect(early.statusCode).toBe(403);
    expect(early.json().error.message).toBe(
      'A guest writes here while the call is on and they’re in it.',
    );

    // A call that's on but they haven't joined: still nothing.
    const { call } = await ana.post(`/v1/conversations/${conversationId}/group-calls`, {
      kind: 'video',
      deviceId: uuidv4(),
    });
    expect((await send(words('Not in it yet'))).statusCode).toBe(403);

    // In the call: their words, marked a guest's for everyone.
    const device = uuidv4();
    await guest.post(`/v1/group-calls/${call.id}/join`, { deviceId: device });
    const first = words('The address is 12 Nile Street');
    const sent = await send(first);
    expect(sent.statusCode).toBe(201);
    const line = sent.json().message;
    expect(line.payload).toMatchObject({ guest: true });
    const seen = await ana.get(`/v1/conversations/${conversationId}/messages`);
    const theirs = seen.messages.find((m: { id: string }) => m.id === line.id);
    expect(theirs).toMatchObject({
      body: 'The address is 12 Nile Street',
      senderId: guest.user.id,
      payload: { guest: true },
    });

    // Words alone: no file, no card, no mention, nothing urgent.
    for (const more of [
      { kind: 'kit', body: null, payload: { kit: 'checklist', fields: { items: ['a'] } } },
      { mentions: [ana.user.id] },
      { urgent: true },
      { payload: { guest: false } },
    ]) {
      const refused = await send(words('More', more));
      expect(refused.statusCode, JSON.stringify(more)).toBe(403);
    }

    // Anyone in the meeting reports it as any line.
    const report = await ben.req('POST', '/v1/reports', {
      userId: guest.user.id,
      messageId: line.id,
      conversationId,
      reason: 'spam',
    });
    expect(report.statusCode).toBe(201);

    // They leave: read-only again; a send tried again still answers with what was sent.
    await guest.post(`/v1/group-calls/${call.id}/leave`, { deviceId: device });
    expect((await send(words('After'))).statusCode).toBe(403);
    const again = await send(first);
    expect(again.statusCode).toBe(200);
    expect(again.json().message.id).toBe(line.id);
    const page = await guest.get(`/v1/conversations/${conversationId}/messages`);
    expect(page.messages.some((m: { id: string }) => m.id === line.id)).toBe(true);
  });

  it('is for a guest who said they’re 18 or over alone (R85 (3))', async () => {
    const { conversationId, guest } = await guestIn('Study group', 'kim@example.com', false);
    const { call } = await ana.post(`/v1/conversations/${conversationId}/group-calls`, {
      kind: 'voice',
      deviceId: uuidv4(),
    });
    await guest.post(`/v1/group-calls/${call.id}/join`, { deviceId: uuidv4() });
    const res = await guest.req(
      'POST',
      `/v1/conversations/${conversationId}/messages`,
      words('Hi all'),
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toBe(
      'Writing here is for guests who said they’re 18 or over.',
    );
  });

  it('leaves a member’s own lines as they were', async () => {
    const { conversationId } = await guestIn('Members only words', 'gil@example.com', true);
    const sent = await ana.post(`/v1/conversations/${conversationId}/messages`, words('Mine'));
    expect(sent.message.payload?.guest).toBeUndefined();
  });
});
