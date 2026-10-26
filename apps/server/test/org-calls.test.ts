/**
 * A customer calls an organization (M16 H8a, R111 (a)): only where its owner or an admin says its
 * customers may, from the customer's side of the thread; it rings the thread's team, the first of
 * them to answer takes it, a ring turned down is that person's alone, and a call nobody takes is
 * missed and told to whoever it rang. The customer sees the organization on the other side, in
 * the call, its events and their history, never who answered (R15). Cai takes no notes there yet.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { sweepCalls } from '../src/lib/calls';
import { busSettled, type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owns the clinic
let sara: Client; // on its team
let omar: Client; // on its team, and known to Lina
let lina: Client; // the customer
let orgId: string;
let convo: string;
const heard: BusMessage[] = [];

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}
const call = (c: Client, kind = 'voice', deviceId = 'lina-tab') =>
  c.req('POST', `/v1/conversations/${convo}/calls`, { kind, deviceId });
const live = async (c: Client) => (await c.get('/v1/calls/live')).call;
const events = (type: string) => heard.filter((m) => m.event.type === type);
async function heardSoon(type: string, count: number) {
  for (let i = 0; i < 100 && events(type).length < count; i++)
    await new Promise((r) => setTimeout(r, 20));
  return events(type);
}
/** Everything the customer was sent about calls, as one string: no team id or name in it. */
const toLina = () =>
  JSON.stringify(heard.filter((m) => m.userIds.includes(lina.user.id)).map((m) => m.event));

beforeAll(async () => {
  t = await createTestApp();
  t.ctx.bus.subscribe((m) => heard.push(m));
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sara = await signup(t, { displayName: 'Sara Ali' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Customer' });
  for (const p of [sara, omar]) await connect(noor, p);
  await connect(lina, omar);
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.calls',
      kind: 'clinic',
    })
  ).org.id;
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [sara.user.id] });
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  convo = (await lina.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await busSettled(t, heard);
  heard.length = 0;
});

describe('a customer calls an organization (M16 H8a)', () => {
  it('is nobody’s until its owner or an admin turns it on', async () => {
    expect((await lina.get(`/v1/conversations/${convo}`)).conversation.business.callable).toBe(
      false,
    );
    const refused = await call(lina);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.message).toBe('Nile Dental doesn’t take calls on Caime.');
    // Only whoever runs it says so; the setting is theirs to read.
    expect(
      (await sara.req('PATCH', `/v1/orgs/${orgId}`, { callsFrom: 'customers' })).statusCode,
    ).toBe(403);
    const set = await noor.patch(`/v1/orgs/${orgId}`, { callsFrom: 'customers' });
    expect(set.org.callsFrom).toBe('customers');
    expect((await sara.get(`/v1/orgs/${orgId}`)).org.callsFrom).toBeNull();
    expect((await lina.get(`/v1/conversations/${convo}`)).conversation.business.callable).toBe(
      true,
    );
    // The team doesn't place one here (calling a customer back comes later).
    expect((await sara.get(`/v1/conversations/${convo}`)).conversation.business.callable).toBe(
      false,
    );
    expect(
      (
        await sara.req('POST', `/v1/conversations/${convo}/calls`, {
          kind: 'voice',
          deviceId: 'sara-tab',
        })
      ).statusCode,
    ).toBe(400);
  });

  it('rings the team in the thread; the customer sees the organization, never them', async () => {
    const count = (outcome: string) => t.ctx.metrics.orgCalls.get({ outcome });
    const before = {
      placed: count('placed'),
      answered: count('answered'),
      done: count('completed'),
    };
    const res = await call(lina, 'video');
    expect(res.statusCode).toBe(201);
    const placed = res.json().call;
    expect(placed).toMatchObject({
      state: 'ringing',
      caller: { id: lina.user.id },
      callee: { id: orgId, displayName: 'Nile Dental' },
      org: { name: 'Nile Dental' },
    });
    // Each of the team hears it ring for them: Noor, Sara and Omar.
    const rang = await heardSoon('call.ringing', 3);
    expect(rang.flatMap((m) => m.userIds).sort()).toEqual(
      [noor.user.id, sara.user.id, omar.user.id].sort(),
    );
    for (const c of [noor, sara, omar]) {
      const mine = await live(c);
      expect(mine).toMatchObject({
        id: placed.id,
        state: 'ringing',
        caller: { id: lina.user.id, displayName: 'Lina Customer' },
        callee: { id: c.user.id },
        org: { name: 'Nile Dental' },
      });
    }
    // Sara answers first: she has it, and the others' rings stop.
    const answered = await sara.req('POST', `/v1/calls/${placed.id}/accept`, {
      deviceId: 'sara-tab',
    });
    expect(answered.statusCode).toBe(200);
    expect(answered.json().call).toMatchObject({ state: 'active', callee: { id: sara.user.id } });
    expect(await live(omar)).toBeNull();
    expect(
      (await omar.req('POST', `/v1/calls/${placed.id}/accept`, { deviceId: 'omar-tab' }))
        .statusCode,
    ).toBe(409);
    // Omar can't speak in it as Sara's device, nor end it.
    const posing = await omar.req('POST', `/v1/calls/${placed.id}/signal`, {
      deviceId: 'sara-tab',
      kind: 'candidate',
      candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host' },
    });
    expect(posing.statusCode).toBe(403);
    await omar.req('POST', `/v1/calls/${placed.id}/end`, {});
    expect((await live(lina))?.state).toBe('active');
    // The customer's side: the organization, never Sara or Omar (whom Lina happens to know).
    const hers = await live(lina);
    expect(hers.callee).toEqual({ id: orgId, displayName: 'Nile Dental', avatarUrl: null });
    // Signals pass between the customer's device and Sara's.
    const offer = await lina.req('POST', `/v1/calls/${placed.id}/signal`, {
      deviceId: 'lina-tab',
      kind: 'offer',
      sdp: 'v=0',
    });
    expect(offer.statusCode).toBe(200);
    expect((await heardSoon('call.signal', 1)).map((m) => m.userIds)).toEqual([[sara.user.id]]);
    // It ends, with its line in the thread from the customer, and her history names the clinic.
    await sara.post(`/v1/calls/${placed.id}/end`, {});
    // Counted as placed, answered and how it ended (the number for H8 (a)).
    expect([count('placed'), count('answered'), count('completed')]).toEqual([
      before.placed + 1,
      before.answered + 1,
      before.done + 1,
    ]);
    const history = (await lina.get('/v1/calls/history')).calls;
    expect(history[0]).toMatchObject({
      direction: 'outgoing',
      with: [{ id: orgId, displayName: 'Nile Dental' }],
    });
    expect((await sara.get('/v1/calls/history')).calls[0]).toMatchObject({
      direction: 'incoming',
      with: [{ id: lina.user.id }],
    });
    for (const c of [noor, omar])
      expect(
        (await c.get('/v1/calls/history')).calls.some((h: { id: string }) => h.id === placed.id),
      ).toBe(false);
    await heardSoon('call.updated', 2);
    const seen = toLina() + JSON.stringify(history) + JSON.stringify(hers);
    for (const word of [sara.user.id, omar.user.id, noor.user.id, 'Sara', 'Omar', 'Noor'])
      expect(seen).not.toContain(word);
  });

  it('a ring turned down is that person’s; all of them turned down, it’s missed', async () => {
    const placed = (await call(lina)).json().call;
    await heardSoon('call.ringing', 3);
    const declined = await omar.post(`/v1/calls/${placed.id}/decline`, {});
    expect(declined.call).toMatchObject({ state: 'ended', outcome: 'declined' });
    expect(await live(omar)).toBeNull();
    // Still ringing for the rest, and for the customer.
    expect((await live(sara))?.state).toBe('ringing');
    expect((await live(lina))?.state).toBe('ringing');
    await sara.post(`/v1/calls/${placed.id}/decline`, {});
    // Hanging up while it rings is turning it down too.
    await noor.post(`/v1/calls/${placed.id}/end`, {});
    const after = await lina.get('/v1/calls/history');
    expect(after.calls[0]).toMatchObject({ id: placed.id, with: [{ displayName: 'Nile Dental' }] });
    expect(await live(lina)).toBeNull();
    // Nobody who turned it down is told they missed it.
    const missed = (await noor.get('/v1/notifications')).notifications.filter(
      (n: { title: string; body: string | null }) =>
        n.title === 'Missed voice call' && n.body === 'from Lina Customer',
    );
    expect(missed).toEqual([]);
  });

  it('a call nobody takes is missed, and told to whoever it rang', async () => {
    t.clock.set(new Date().toISOString());
    const missedBefore = t.ctx.metrics.orgCalls.get({ outcome: 'missed' });
    const placed = (await call(lina)).json().call;
    await heardSoon('call.ringing', 3);
    t.clock.advance(60_000);
    await sweepCalls(t.ctx);
    // The sweep's miss is counted as any other ending is.
    expect(t.ctx.metrics.orgCalls.get({ outcome: 'missed' })).toBe(missedBefore + 1);
    expect((await lina.get('/v1/calls/history')).calls[0]).toMatchObject({
      id: placed.id,
      result: 'unanswered',
    });
    for (const c of [noor, sara, omar]) {
      const told = (await c.get('/v1/notifications')).notifications.find(
        (n: { data: { callId?: string }; title: string }) =>
          n.data?.callId === placed.id && n.title === 'Missed voice call',
      );
      expect(told?.body).toBe('from Lina Customer');
    }
  });

  it('takes no notes from Cai there, and ends when the customer blocks it', async () => {
    const placed = (await call(lina)).json().call;
    await sara.post(`/v1/calls/${placed.id}/accept`, { deviceId: 'sara-tab' });
    const notes = await lina.req('POST', `/v1/calls/${placed.id}/notes`, { deviceId: 'lina-tab' });
    expect(notes.statusCode).toBe(403);
    expect(notes.json().error.message).toBe(
      'Cai doesn’t take notes in a conversation with an organization yet.',
    );
    await lina.post(`/v1/orgs/${orgId}/block`, {});
    expect(await live(lina)).toBeNull();
    expect(await live(sara)).toBeNull();
    // Blocked, it can't be called.
    expect((await call(lina)).statusCode).toBe(403);
  });
});
