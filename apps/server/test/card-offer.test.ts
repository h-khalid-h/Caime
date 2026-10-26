/**
 * The card a message could be (M17 I9b), kept with its entities as it's sent: a plan to meet by
 * its instant on the writer's clock, an amount asked for or offered by its way and value; none
 * for anything else, and read again when the words are edited.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let ana: Client;
let ben: Client;
let chat: string;

const say = async (c: Client, body: string) =>
  (await c.post(`/v1/conversations/${chat}/messages`, { clientId: uuidv4(), body })).message as {
    id: string;
  };
const offerOf = async (id: string) => {
  const page = await ben.get(`/v1/conversations/${chat}/messages`);
  const m = (page.messages as Array<{ id: string; entities: { offer?: unknown } }>).find(
    (x) => x.id === id,
  );
  return m?.entities.offer ?? null;
};

beforeAll(async () => {
  t = await createTestApp();
  t.clock.set('2026-10-26T09:00:00Z');
  ana = await signup(t, { displayName: 'Ana Plans', timeZone: 'Asia/Riyadh', country: 'SA' });
  ben = await signup(t, { displayName: 'Ben Reads' });
  const r = await ana.post('/v1/connections/requests', {
    toUserId: ben.user.id,
    relationship: { sphere: 'friend' },
  });
  await ben.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  chat = (await ana.post('/v1/conversations', { kind: 'direct', userId: ben.user.id })).conversation
    .id as string;
});
afterAll(async () => {
  await t.close();
});

describe('the card a message could be (M17 I9b)', () => {
  it('keeps a plan to meet by its instant on the writer’s clock', async () => {
    const m = await say(ana, "Let's meet Thursday at 3pm");
    // Thursday 29 October, 15:00 in Riyadh (UTC+3 all year), the same instant for any reader.
    expect(await offerOf(m.id)).toEqual({
      kind: 'meeting',
      at: '2026-10-29T12:00:00.000Z',
      hasTime: true,
    });
  });

  it('keeps how often a plan repeats (M17 I9c)', async () => {
    const m = await say(ana, "Let's meet every Thursday at 3pm");
    expect(await offerOf(m.id)).toEqual({
      kind: 'meeting',
      at: '2026-10-29T12:00:00.000Z',
      hasTime: true,
      repeat: 'week',
    });
  });

  it('keeps an amount asked for or offered, and nothing for other words', async () => {
    const asked = await say(ana, 'Send me 200 EGP for the tickets');
    expect(await offerOf(asked.id)).toEqual({
      kind: 'pay',
      direction: 'ask',
      value: 200,
      currency: 'EGP',
    });
    const offered = await say(ana, "I'll send you 50 EGP tonight");
    expect(await offerOf(offered.id)).toMatchObject({ kind: 'pay', direction: 'send', value: 50 });
    expect(await offerOf((await say(ana, 'Hello, how are you?')).id)).toBeNull();
    expect(await offerOf((await say(ana, "I can't meet Thursday at 3, sorry")).id)).toBeNull();
  });

  it('reads the words again when they are edited', async () => {
    const m = await say(ana, "Let's meet Friday at 10am");
    expect(await offerOf(m.id)).toMatchObject({ kind: 'meeting' });
    const edited = await ana.req('PATCH', `/v1/messages/${m.id}`, { body: 'Never mind' });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(await offerOf(m.id)).toBeNull();
  });
});

describe('"before the meeting" is due when the meeting starts (M17 I9e)', () => {
  const datesOf = async (id: string) => {
    const page = await ben.get(`/v1/conversations/${chat}/messages`);
    const m = (
      page.messages as Array<{ id: string; entities: { dates?: Array<Record<string, unknown>> } }>
    ).find((x) => x.id === id);
    return m?.entities.dates ?? [];
  };
  const waits = async () => {
    await t.ctx.flush();
    return (await ben.get(`/v1/suggestions?conversationId=${chat}`)).suggestions as Array<{
      kind: string;
      title: string;
      dueAt: string | null;
    }>;
  };

  it('dates a promise by the conversation’s next meeting, and nothing for anyone else’s', async () => {
    // Nothing ahead yet: the words date nothing.
    const early = await say(ana, "I'll send you the floor plan before the meeting");
    expect(await datesOf(early.id)).toEqual([]);
    const card = (
      await ben.post(`/v1/conversations/${chat}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: {
            title: 'Site visit',
            start: { at: '2026-10-29T12:00:00.000Z', hasTime: true },
            durationMinutes: 60,
          },
        },
      })
    ).message as { id: string };
    await ana.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });

    const m = await say(ana, "I'll send you the deck before the meeting");
    expect(await datesOf(m.id)).toEqual([
      expect.objectContaining({
        text: 'before the meeting',
        at: '2026-10-29T12:00:00.000Z',
        card: true,
      }),
    ]);
    expect((await waits()).find((s) => /deck/i.test(s.title))).toMatchObject({
      kind: 'waiting',
      dueAt: '2026-10-29T12:00:00.000Z',
    });

    const other = await say(ana, "I'll call the bank before the meeting with the auditors");
    expect(await datesOf(other.id)).toEqual([]);
    expect((await waits()).find((s) => /bank/i.test(s.title))?.dueAt ?? null).toBeNull();

    // Read again when the words are edited to say it.
    const edited = await ana.req('PATCH', `/v1/messages/${early.id}`, {
      body: "I'll send you the floor plan before our call",
    });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(await datesOf(early.id)).toEqual([
      expect.objectContaining({ at: '2026-10-29T12:00:00.000Z', card: true }),
    ]);
  });
});
