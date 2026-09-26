import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let convo: string;

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: { sphere: 'friend', role: 'friend' },
  });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}
const share = (c: Client, conversationId: string, payload: Record<string, unknown>) =>
  c.req('POST', `/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'location',
    payload,
  });
const move = (c: Client, id: string, point: Record<string, unknown>) =>
  c.req('POST', `/v1/messages/${id}/location`, point);
const seenBy = async (c: Client, id: string) =>
  (await c.get(`/v1/conversations/${convo}/messages?limit=50`)).messages.find(
    (m: any) => m.id === id,
  );

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  convo = await connect(noor, sam);
});

afterAll(async () => {
  await t.close();
});

describe('live location (R29)', () => {
  it('follows its sharer until the time they chose, and only theirs', async () => {
    const started = await share(noor, convo, {
      lat: 30.0444,
      lng: 31.2357,
      accuracy: 20,
      live: { minutes: 15 },
    });
    expect(started.statusCode).toBe(201);
    const { id, payload } = started.json().message;
    // The server keeps the clock: until when, from now, whatever a client says.
    expect(payload.live).toEqual({
      startedAt: t.clock.now.toISOString(),
      until: new Date(t.clock.now.getTime() + 15 * 60_000).toISOString(),
      updatedAt: t.clock.now.toISOString(),
      stoppedAt: null,
    });
    const preview = (await sam.get('/v1/inbox')).sections
      .flatMap((s: any) => s.items)
      .find((i: any) => i.id === convo).lastMessage.preview;
    expect(preview).toBe('📍 Live location');

    t.clock.advance(60_000);
    expect((await move(noor, id, { lat: 30.05, lng: 31.24, accuracy: 12 })).statusCode).toBe(200);
    // Sam sees where Noor is now; only the latest point is kept, never a trail.
    const now = (await seenBy(sam, id)).payload;
    expect(now).toMatchObject({ lat: 30.05, lng: 31.24, accuracy: 12 });
    expect(now.live.updatedAt).toBe(t.clock.now.toISOString());
    expect(Object.keys(now).sort()).toEqual(['accuracy', 'lat', 'live', 'lng']);
    // Nobody else moves it.
    expect((await move(sam, id, { lat: 0, lng: 0 })).statusCode).toBe(403);

    // Its time up, it stays where it was last seen.
    t.clock.advance(15 * 60_000);
    const late = await move(noor, id, { lat: 30.06, lng: 31.25 });
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('location_ended');
    expect((await seenBy(sam, id)).payload.lat).toBe(30.05);
  });

  it('ends when its sharer stops it', async () => {
    const { id } = (
      await share(noor, convo, { lat: 30.0444, lng: 31.2357, live: { minutes: 60 } })
    ).json().message;
    expect((await sam.req('POST', `/v1/messages/${id}/location/stop`)).statusCode).toBe(403);
    const stopped = await noor.req('POST', `/v1/messages/${id}/location/stop`);
    expect(stopped.json().message.payload.live.stoppedAt).toBe(t.clock.now.toISOString());
    expect((await move(noor, id, { lat: 30.05, lng: 31.24 })).statusCode).toBe(409);
  });

  it('is never shared with an organization, nor by anyone under 18, and starts where you are', async () => {
    const lina = await signup(t, { displayName: 'Lina Customer' });
    const orgId = (
      await noor.post('/v1/orgs', { name: 'Tiles Co', handle: 'tiles.co', kind: 'shop' })
    ).org.id;
    const withOrg = (await lina.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
    const toOrg = await share(lina, withOrg, { lat: 30, lng: 31, live: { minutes: 15 } });
    expect(toOrg.json().error.message).toBe(
      'Live location is for people you know, not organizations.',
    );

    const teen = await signup(t, { displayName: 'Rami Young', birthYear: 2011 });
    // Under 18, they ask to connect (R29): an adult can't ask them.
    const r = await teen.post('/v1/connections/requests', {
      toUserId: noor.user.id,
      relationship: { sphere: 'family', role: 'parent' },
    });
    const family = (await noor.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
      .conversationId;
    expect(
      (await share(teen, family, { lat: 30, lng: 31, live: { minutes: 15 } })).statusCode,
    ).toBe(403);
    expect((await share(noor, convo, { label: 'Home', live: { minutes: 15 } })).statusCode).toBe(
      400,
    );
  });
});
