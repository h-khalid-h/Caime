import { uuidv7 } from '@caishy/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { sweepCalls } from '../src/lib/calls';
import { sweepGroupCalls } from '../src/lib/group-calls';
import { type NotifyInput, onNotification } from '../src/lib/notify';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let omar: Client;
let lina: Client;
let zed: Client; // in none of it
/** A group of four: Noor made it, and knows everyone in it. */
let trip: string;
let noorSam: string;
let noorOmar: string;
let omarSam: string;
const heard: BusMessage[] = [];
const pushed: NotifyInput[] = [];

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}
const group = async (by: Client, title: string, members: Client[]): Promise<string> =>
  (
    await by.post('/v1/conversations', {
      kind: 'group',
      title,
      memberIds: members.map((m) => m.user.id),
    })
  ).conversation.id;
const device = (c: Client, n = 1) =>
  `${(c.user.displayName.split(' ')[0] ?? 'someone').toLowerCase()}-tab-${n}`;
const start = (c: Client, conversationId = trip, kind = 'video') =>
  c.req('POST', `/v1/conversations/${conversationId}/group-calls`, { kind, deviceId: device(c) });
const join = (c: Client, id: string, deviceId = device(c)) =>
  c.req('POST', `/v1/group-calls/${id}/join`, { deviceId });
const leave = (c: Client, id: string) => c.req('POST', `/v1/group-calls/${id}/leave`, {});
const decline = (c: Client, id: string) => c.req('POST', `/v1/group-calls/${id}/decline`, {});
const alive = (c: Client, id: string, deviceId = device(c)) =>
  c.req('POST', `/v1/group-calls/${id}/alive`, { deviceId });
const offer = { kind: 'offer', sdp: 'v=0 offer' };
const signal = (c: Client, id: string, from: string, to: string, body = offer) =>
  c.req('POST', `/v1/group-calls/${id}/signal`, { deviceId: from, to, ...body });
/** Who is where in the call, by first name. */
const where = (call: any) =>
  Object.fromEntries(
    call.members.map((m: any) => [m.person.displayName.split(' ')[0], m.state]),
  ) as Record<string, string>;
const events = (type: string, state?: string) =>
  heard.filter((m) => m.event.type === type && (!state || (m.event.data as any).state === state));
/**
 * The bus delivers through Postgres (ADR-5): wait for what should have arrived. `state` picks
 * the updates that say the call stands so, as one that arrives late may say something older.
 */
async function heardSoon(type: string, count: number, state?: string) {
  for (let i = 0; i < 100 && events(type, state).length < count; i++)
    await new Promise((r) => setTimeout(r, 20));
  return events(type, state);
}
const lines = async (c: Client, conversationId = trip) =>
  ((await c.get(`/v1/conversations/${conversationId}/messages`)).messages as any[]).filter(
    (m) => m.kind === 'system' && m.payload.event === 'call',
  );
const aboutCall = async (c: Client, callId: string) => {
  await t.ctx.flush();
  return ((await c.get('/v1/notifications')).notifications as any[]).filter(
    (n) => n.data?.callId === callId,
  );
};
const ids = (cs: Client[]) => cs.map((c) => c.user.id).sort();

beforeAll(async () => {
  t = await createTestApp();
  t.ctx.bus.subscribe((m) => heard.push(m));
  onNotification(async (_ctx, _id, input) => {
    pushed.push(input);
  });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Aziz' });
  zed = await signup(t, { displayName: 'Zed Stranger' });
  noorSam = await connect(noor, sam);
  noorOmar = await connect(noor, omar);
  await connect(noor, lina);
  omarSam = await connect(omar, sam);
  trip = await group(noor, 'Trip', [sam, omar, lina]);
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  heard.length = 0;
  pushed.length = 0;
});
// Each case starts with nobody in a call.
afterEach(async () => {
  await t.ctx.db
    .updateTable('calls')
    .set({ state: 'ended', outcome: 'completed', ended_at: t.ctx.now() })
    .where('state', '<>', 'ended')
    .execute();
  await t.ctx.db
    .updateTable('call_members')
    .set({ state: 'left', device: null })
    .where('state', 'in', ['joined', 'ringing'])
    .execute();
});

describe('group calls (PRD §47)', () => {
  it('rings everyone else in the group, and says who’s calling where', async () => {
    const res = await start(noor);
    expect(res.statusCode).toBe(201);
    const call = res.json().call;
    expect(call).toMatchObject({
      conversationId: trip,
      kind: 'video',
      state: 'ringing',
      startedBy: { id: noor.user.id, displayName: 'Noor Haddad' },
      answeredAt: null,
    });
    expect(where(call)).toEqual({
      Noor: 'joined',
      Sam: 'ringing',
      Omar: 'ringing',
      Lina: 'ringing',
    });
    // Only the device in it is named: signals go only between joined devices.
    expect(call.members.map((m: any) => m.device)).toEqual(['noor-tab-1', null, null, null]);
    const ringing = await heardSoon('groupcall.ringing', 3);
    expect(ringing.map((m) => m.userIds[0]).sort()).toEqual(ids([sam, omar, lina]));
    // Noor's own devices follow along, without ringing.
    expect((await heardSoon('groupcall.updated', 1)).map((m) => m.userIds)).toEqual([
      [noor.user.id],
    ]);
    const [ring] = await aboutCall(sam, call.id);
    expect(ring).toMatchObject({
      title: 'Noor Haddad is calling Trip',
      body: 'Group video call',
      level: 'urgency',
      read: false,
    });
    // It's news only while it rings, and only a browser can answer it.
    expect(pushed.find((p) => p.userId === sam.user.id)).toMatchObject({
      ttlSeconds: 45,
      pushTo: 'web',
    });
    // A page opened while it rings finds it, and so does the conversation, for its banner.
    expect((await sam.get('/v1/group-calls/live')).call.id).toBe(call.id);
    expect((await noor.get('/v1/group-calls/live')).call.id).toBe(call.id);
    expect((await lina.get(`/v1/conversations/${trip}/group-call`)).call.id).toBe(call.id);
    // It isn't anyone's 1:1 call.
    expect((await noor.get('/v1/calls/live')).call).toBeNull();
    expect((await sam.get('/v1/calls/live')).call).toBeNull();
    // To anyone else it doesn't exist.
    expect((await zed.get('/v1/group-calls/live')).call).toBeNull();
    expect((await zed.req('GET', `/v1/conversations/${trip}/group-call`)).statusCode).toBe(404);
    expect((await join(zed, call.id)).statusCode).toBe(404);
    expect((await alive(zed, call.id)).statusCode).toBe(404);
  });

  it('for groups only, of people who took part, and not the phone of anyone who muted it', async () => {
    expect((await start(noor, noorSam)).json().error.message).toBe(
      'Group calls are for group conversations.',
    );
    await lina.patch(`/v1/conversations/${trip}`, {
      mutedUntil: new Date(t.ctx.now().getTime() + 3600_000).toISOString(),
    });
    const id = (await start(noor)).json().call.id;
    // Lina is rung in the app, not on her phone.
    expect(pushed.map((p) => p.userId).sort()).toEqual(ids([sam, omar]));
    expect((await aboutCall(lina, id))[0]).toMatchObject({ title: 'Noor Haddad is calling Trip' });
    await lina.patch(`/v1/conversations/${trip}`, { mutedUntil: null });
  });

  it('one call at a time for each person, and one call on in a conversation', async () => {
    const id = (await start(noor)).json().call.id;
    const again = await start(noor);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('in_call');
    const second = await start(sam);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('call_on');
    // Nor a 1:1 call from inside a group one.
    const direct = await noor.req('POST', `/v1/conversations/${noorSam}/calls`, {
      kind: 'voice',
      deviceId: 'noor-tab-1',
    });
    expect(direct.json().error.code).toBe('in_call');
    // In it, Sam is on another call to anyone calling him who may know.
    await join(sam, id, 'sam-phone-1');
    const busy = await omar.req('POST', `/v1/conversations/${omarSam}/calls`, {
      kind: 'voice',
      deviceId: 'omar-phone-1',
    });
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error.message).toBe('Sam Rivera is on another call.');
    // However it's started, a conversation has one call on at a time.
    await expect(
      t.ctx.db
        .insertInto('calls')
        .values({
          id: uuidv7(),
          conversation_id: trip,
          caller_id: omar.user.id,
          callee_id: null,
          kind: 'voice',
          state: 'ringing',
          caller_device: 'omar-tab-1',
          created_at: t.ctx.now(),
          seen_at: t.ctx.now(),
          is_group: true,
        })
        .execute(),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('two people starting one at once get the same call', async () => {
    const pair = await group(noor, 'Pair', [sam, omar]);
    const both = await Promise.all([start(sam, pair), start(omar, pair)]);
    expect(both.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(both.find((r) => r.statusCode === 409)?.json().error.code).toBe('call_on');
  });

  it('the second person in makes it a call; signals pass only between devices in it', async () => {
    const id = (await start(noor)).json().call.id;
    heard.length = 0;
    const joined = await join(sam, id, 'sam-phone-1');
    expect(joined.statusCode).toBe(200);
    expect(joined.json().call).toMatchObject({ state: 'active' });
    expect(joined.json().call.answeredAt).not.toBeNull();
    expect(where(joined.json().call).Sam).toBe('joined');
    // Everyone in the conversation hears how it stands; Sam's ring is read on every device.
    expect(
      (await heardSoon('groupcall.updated', 4, 'active')).map((m) => m.userIds[0]).sort(),
    ).toEqual(ids([noor, sam, omar, lina]));
    expect((await aboutCall(sam, id))[0].read).toBe(true);
    expect((await aboutCall(omar, id))[0].read).toBe(false);

    heard.length = 0;
    expect((await signal(noor, id, 'noor-tab-1', 'sam-phone-1')).statusCode).toBe(200);
    expect(await heardSoon('groupcall.signal', 1)).toEqual([
      {
        userIds: [sam.user.id],
        event: {
          type: 'groupcall.signal',
          data: {
            callId: id,
            from: 'noor-tab-1',
            to: 'sam-phone-1',
            kind: 'offer',
            sdp: 'v=0 offer',
            candidate: null,
          },
        },
      },
    ]);
    await signal(sam, id, 'sam-phone-1', 'noor-tab-1', {
      kind: 'candidate',
      candidate: {
        candidate: 'candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
        usernameFragment: 'f9Kx',
      },
    } as any);
    expect((await heardSoon('groupcall.signal', 2))[1]).toMatchObject({
      userIds: [noor.user.id],
      event: { data: { kind: 'candidate', from: 'sam-phone-1', to: 'noor-tab-1' } },
    });
    // Not from another of Noor's devices, not to a device that isn't in it, not to her own,
    // not from someone who's only rung, not from anyone else.
    expect((await signal(noor, id, 'noor-tab-2', 'sam-phone-1')).statusCode).toBe(403);
    expect((await signal(noor, id, 'noor-tab-1', 'sam-laptop-1')).statusCode).toBe(403);
    expect((await signal(noor, id, 'noor-tab-1', 'noor-tab-1')).statusCode).toBe(403);
    expect((await signal(omar, id, 'omar-tab-1', 'noor-tab-1')).statusCode).toBe(403);
    expect((await signal(zed, id, 'zed-tab-1', 'noor-tab-1')).statusCode).toBe(404);
    expect(
      (await signal(noor, id, 'noor-tab-1', 'sam-phone-1', { kind: 'offer' } as any)).statusCode,
    ).toBe(400);

    // A third joins the same call.
    const third = await join(omar, id);
    expect(third.json().call).toMatchObject({
      state: 'active',
      answeredAt: joined.json().call.answeredAt,
    });
    expect((await signal(omar, id, 'omar-tab-1', 'noor-tab-1')).statusCode).toBe(200);
    expect((await signal(omar, id, 'omar-tab-1', 'sam-phone-1')).statusCode).toBe(200);
  });

  it('joining from another device moves them to it; the one left behind hears so', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    const moved = await join(sam, id, 'sam-laptop-1');
    expect(moved.statusCode).toBe(200);
    expect(moved.json().call.members.find((m: any) => m.person.id === sam.user.id).device).toBe(
      'sam-laptop-1',
    );
    const behind = await alive(sam, id, 'sam-phone-1');
    expect(behind.statusCode).toBe(403);
    expect(behind.json().error.code).toBe('not_in_call');
    expect(where(behind.json().error.details.call).Sam).toBe('joined');
    expect((await signal(sam, id, 'sam-phone-1', 'noor-tab-1')).statusCode).toBe(403);
    expect((await alive(sam, id, 'sam-laptop-1')).json().call.state).toBe('active');
  });

  it('turned down or missed, it stops ringing for them; missed, they hear so once', async () => {
    const id = (await start(noor, trip, 'voice')).json().call.id;
    await join(sam, id, 'sam-phone-1');
    const turnedDown = await decline(lina, id);
    expect(where(turnedDown.json().call)).toMatchObject({ Lina: 'declined', Omar: 'ringing' });
    expect(turnedDown.json().call.state).toBe('active');
    expect((await aboutCall(lina, id)).map((n) => n.read)).toEqual([true]);
    t.clock.advance(30_000);
    await sweepGroupCalls(t.ctx);
    expect((await omar.get('/v1/group-calls/live')).call.id).toBe(id);
    t.clock.advance(16_000);
    // Past its 45 seconds it doesn't ring, even before the sweep says he missed it.
    expect((await omar.get('/v1/group-calls/live')).call).toBeNull();
    // Two sweeps at once (two workers) tell him once.
    await Promise.all([sweepGroupCalls(t.ctx), sweepGroupCalls(t.ctx)]);
    expect((await omar.get('/v1/group-calls/live')).call).toBeNull();
    const told = (await aboutCall(omar, id)).sort((a, b) => a.title.localeCompare(b.title));
    expect(told.map((n) => [n.title, n.body, n.read])).toEqual([
      ['Missed group voice call', 'from Noor Haddad in Trip', false],
      ['Noor Haddad is calling Trip', 'Group voice call', true],
    ]);
    await sweepGroupCalls(t.ctx);
    expect(await aboutCall(omar, id)).toHaveLength(2);
    // Lina turned it down: nobody tells her she missed it.
    expect((await aboutCall(lina, id)).map((n) => n.title)).toEqual([
      'Noor Haddad is calling Trip',
    ]);
    // The call goes on, and Omar can still join it from the conversation.
    const late = await join(omar, id);
    expect(late.statusCode).toBe(200);
    expect(where(late.json().call).Omar).toBe('joined');
  });

  it('it goes on while two are in it, then ends with its line', async () => {
    const started = (await start(noor)).json().call;
    const id = started.id;
    const revs = [started.rev];
    revs.push((await join(sam, id, 'sam-phone-1')).json().call.rev);
    revs.push((await join(omar, id)).json().call.rev);
    // Every change to who's in it is newer news than the last: a device tells older views apart.
    expect(revs).toEqual([0, 1, 2]);
    expect((await alive(sam, id, 'sam-phone-1')).json().call.rev).toBe(2);
    t.clock.advance(5 * 60_000);
    await alive(noor, id);
    await alive(sam, id, 'sam-phone-1');
    expect((await leave(omar, id)).json().call).toMatchObject({ state: 'active', rev: 3 });
    expect(await lines(sam)).toHaveLength(0);
    heard.length = 0;
    const ended = await leave(noor, id);
    expect(ended.json().call).toMatchObject({ state: 'ended', outcome: 'completed' });
    expect(where(ended.json().call)).toEqual({
      Noor: 'left',
      Sam: 'left',
      Omar: 'left',
      Lina: 'missed',
    });
    // Everyone in the conversation hears it end, Sam's device included.
    expect(
      (await heardSoon('groupcall.updated', 4, 'ended')).map((m) => m.userIds[0]).sort(),
    ).toEqual(ids([noor, sam, omar, lina]));
    const line = (await lines(lina)).at(-1);
    expect(line.payload).toMatchObject({
      event: 'call',
      kind: 'video',
      outcome: 'completed',
      seconds: 300,
      group: true,
      people: 3,
    });
    expect(line.senderId).toBe(noor.user.id);
    // Lina never answered: she missed it.
    expect((await aboutCall(lina, id)).map((n) => n.title)).toContain('Missed group video call');
    // Over, it says how it ended to a device that missed it, and nobody joins it.
    const after = await alive(sam, id, 'sam-phone-1');
    expect(after.statusCode).toBe(409);
    expect(after.json().error.details.call).toMatchObject({ state: 'ended', outcome: 'completed' });
    expect((await join(lina, id)).json().error.code).toBe('call_ended');
    expect((await signal(sam, id, 'sam-phone-1', 'noor-tab-1')).statusCode).toBe(409);
    expect((await sam.get(`/v1/conversations/${trip}/group-call`)).call).toBeNull();
    expect((await sam.get('/v1/group-calls/live')).call).toBeNull();
    // Leaving again changes nothing.
    expect((await leave(noor, id)).json().call.state).toBe('ended');
    expect(await lines(lina)).toHaveLength(1);
    // And nobody is busy now.
    expect((await start(sam)).statusCode).toBe(201);
  });

  it('nobody else joined: called off, turned down by everyone, or missed', async () => {
    const before = (await lines(noor)).length;
    const cancelled = (await start(noor)).json().call.id;
    expect((await leave(noor, cancelled)).json().call).toMatchObject({
      state: 'ended',
      outcome: 'cancelled',
    });
    // Whoever it was ringing for missed it.
    for (const c of [sam, omar, lina])
      expect((await aboutCall(c, cancelled)).map((n) => n.title)).toContain(
        'Missed group video call',
      );

    const declined = (await start(noor)).json().call.id;
    await decline(sam, declined);
    await decline(omar, declined);
    expect((await decline(lina, declined)).json().call).toMatchObject({
      state: 'ended',
      outcome: 'declined',
    });
    expect((await aboutCall(sam, declined)).map((n) => n.title)).toEqual([
      'Noor Haddad is calling Trip',
    ]);

    const missed = (await start(noor, trip, 'voice')).json().call.id;
    await decline(sam, missed);
    t.clock.advance(46_000);
    await sweepGroupCalls(t.ctx);
    expect((await noor.get('/v1/group-calls/live')).call).toBeNull();
    expect(
      (await lines(noor)).slice(before).map((l) => [l.payload.outcome, l.payload.group]),
    ).toEqual([
      ['cancelled', true],
      ['declined', true],
      ['missed', true],
    ]);
  });

  it('each device says it’s still there: one that stops is taken out of the call', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    await join(omar, id);
    t.clock.advance(60_000);
    await alive(noor, id);
    await alive(omar, id);
    t.clock.advance(35_000);
    // Sam was last there 95 seconds ago: he isn't in a call, even before the sweep.
    expect((await sam.get('/v1/group-calls/live')).call).toBeNull();
    await sweepGroupCalls(t.ctx);
    const now = (await noor.get('/v1/group-calls/live')).call;
    expect(where(now)).toMatchObject({ Noor: 'joined', Sam: 'left', Omar: 'joined' });
    expect((await alive(sam, id, 'sam-phone-1')).statusCode).toBe(403);
    // Then Omar goes quiet, and one alone isn't a call.
    t.clock.advance(60_000);
    await alive(noor, id);
    t.clock.advance(35_000);
    await sweepGroupCalls(t.ctx);
    expect((await noor.get('/v1/group-calls/live')).call).toBeNull();
    // It lasted until Omar was last there.
    expect((await lines(noor)).at(-1).payload).toMatchObject({
      outcome: 'completed',
      seconds: 60,
      people: 3,
    });
    expect((await alive(noor, id)).statusCode).toBe(409);
  });

  it('two people where one blocked the other are never in a call together', async () => {
    // Blocked by whoever calls, they aren't rung.
    await lina.post('/v1/blocks', { userId: noor.user.id });
    const first = (await start(noor)).json().call;
    expect(Object.keys(where(first)).sort()).toEqual(['Noor', 'Omar', 'Sam']);
    expect((await lina.get('/v1/group-calls/live')).call).toBeNull();
    expect((await join(lina, first.id)).statusCode).toBe(403);
    await leave(noor, first.id);
    await lina.req('DELETE', `/v1/blocks/${noor.user.id}`);

    // Blocked by someone in it, they can't join it.
    await sam.post('/v1/blocks', { userId: lina.user.id });
    const second = (await start(noor)).json().call.id;
    await join(sam, second, 'sam-phone-1');
    const refused = await join(lina, second);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.message).toBe('You can’t join this call.');
    await sam.req('DELETE', `/v1/blocks/${lina.user.id}`);

    // A block in the middle of one: whoever blocked leaves it, and it goes on for the rest.
    await join(omar, second);
    await omar.post('/v1/blocks', { userId: sam.user.id });
    const after = (await noor.get('/v1/group-calls/live')).call;
    expect(after).toMatchObject({ id: second, state: 'active' });
    expect(where(after)).toMatchObject({ Noor: 'joined', Sam: 'joined', Omar: 'left' });
    await omar.req('DELETE', `/v1/blocks/${sam.user.id}`);
    // Someone in it blocking someone only rung stops their ring.
    await noor.post('/v1/blocks', { userId: lina.user.id });
    expect(where((await noor.get('/v1/group-calls/live')).call).Lina).toBe('left');
    expect((await lina.get('/v1/group-calls/live')).call).toBeNull();
    expect((await aboutCall(lina, second)).every((n) => n.read)).toBe(true);
    await noor.req('DELETE', `/v1/blocks/${lina.user.id}`);
  });

  it('someone only rung who blocks someone in it has turned it down', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    await lina.post('/v1/blocks', { userId: sam.user.id });
    expect(where((await noor.get('/v1/group-calls/live')).call).Lina).toBe('declined');
    await lina.req('DELETE', `/v1/blocks/${sam.user.id}`);
  });

  it('someone under 18 is only in a call with people they’re connected with (R29)', async () => {
    const rami = await signup(t, { displayName: 'Rami Young', birthYear: 2011 });
    await connect(rami, noor);
    const family = await group(noor, 'Family', [sam, rami]);
    // Sam and Rami aren't connected: Sam's call doesn't ring Rami, and Rami can't join it.
    const samCalls = (await start(sam, family)).json().call;
    expect(Object.keys(where(samCalls)).sort()).toEqual(['Noor', 'Sam']);
    expect((await rami.get('/v1/group-calls/live')).call).toBeNull();
    expect((await rami.get(`/v1/conversations/${family}/group-call`)).call.id).toBe(samCalls.id);
    await join(noor, samCalls.id);
    expect((await join(rami, samCalls.id)).statusCode).toBe(403);
    await leave(sam, samCalls.id);
    expect((await noor.get('/v1/group-calls/live')).call).toBeNull();

    // Noor's rings both; with Rami in it, Sam can't join.
    const noorCalls = (await start(noor, family)).json().call;
    expect(where(noorCalls)).toEqual({ Noor: 'joined', Sam: 'ringing', Rami: 'ringing' });
    expect((await join(rami, noorCalls.id)).statusCode).toBe(200);
    expect((await join(sam, noorCalls.id)).statusCode).toBe(403);
  });

  it('for up to eight people, and a call holds eight', async () => {
    const more: Client[] = [];
    for (let i = 0; i < 8; i++) {
      const p = await signup(t, { displayName: `Guest${i} Person` });
      await connect(noor, p);
      more.push(p);
    }
    const nine = await group(noor, 'Nine', more);
    expect((await start(noor, nine)).json().error.message).toBe(
      'Calls are for groups of up to 8 people.',
    );
    const eight = await group(noor, 'Eight', more.slice(0, 7));
    const id = (await start(noor, eight)).json().call.id;
    for (const p of more.slice(0, 7)) expect((await join(p, id)).statusCode).toBe(200);
    // Someone added while it's on finds it full.
    const ninth = more[7] as Client;
    await noor.post(`/v1/conversations/${eight}/members`, { userIds: [ninth.user.id] });
    const full = await join(ninth, id);
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe('call_full');
    // Once someone leaves, there's room.
    await leave(more[0] as Client, id);
    expect((await join(ninth, id)).statusCode).toBe(200);
  });

  it('out of the conversation is out of its call', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    await join(omar, id);
    heard.length = 0;
    await noor.del(`/v1/conversations/${trip}/members/${omar.user.id}`);
    const now = (await noor.get('/v1/group-calls/live')).call;
    expect(now.state).toBe('active');
    expect(where(now)).toMatchObject({ Omar: 'left', Lina: 'ringing' });
    // Omar hears he's out of it, though he's no longer in the conversation.
    const told = (await heardSoon('groupcall.updated', 5)).filter(
      (m) => m.userIds[0] === omar.user.id,
    );
    expect(told.length).toBeGreaterThan(0);
    expect(where(told.at(-1)!.event.data).Omar).toBe('left');
    expect((await join(omar, id)).statusCode).toBe(403);
    // Leaving the group while it rings stops it ringing.
    await lina.del(`/v1/conversations/${trip}/members/${lina.user.id}`);
    expect(where((await noor.get('/v1/group-calls/live')).call).Lina).toBe('left');
    expect((await aboutCall(lina, id)).every((n) => n.read)).toBe(true);
    await noor.post(`/v1/conversations/${trip}/members`, {
      userIds: [omar.user.id, lina.user.id],
    });
  });

  it('an account deleted in a call leaves it, and the call settles', async () => {
    const kai = await signup(t, { displayName: 'Kai Short' });
    await connect(noor, kai);
    const brief = await group(noor, 'Brief', [sam, kai]);
    const id = (await start(noor, brief)).json().call.id;
    await join(kai, id);
    const res = await kai.req('DELETE', '/v1/me', { password: 'correct horse battery' });
    expect(res.statusCode).toBeLessThan(300);
    await sweepGroupCalls(t.ctx);
    expect((await noor.get('/v1/group-calls/live')).call).toBeNull();
    expect((await lines(noor, brief)).at(-1).payload).toMatchObject({ outcome: 'completed' });
  });

  it('a group call ringing past 45 seconds is the group sweep’s, never the 1:1 one’s', async () => {
    const id = (await start(noor)).json().call.id;
    const before = (await lines(noor)).length;
    t.clock.advance(46_000);
    await sweepCalls(t.ctx);
    expect((await noor.get('/v1/group-calls/live')).call).toMatchObject({ id, state: 'ringing' });
    expect(await lines(noor)).toHaveLength(before);
    await sweepGroupCalls(t.ctx);
    expect((await noor.get('/v1/group-calls/live')).call).toBeNull();
    expect((await lines(noor)).at(-1).payload).toMatchObject({ outcome: 'missed', group: true });
  });

  it('nobody joins a call from inside another', async () => {
    const pair = await group(noor, 'Duo', [sam, omar]);
    const other = (await start(sam, pair)).json().call.id;
    await join(omar, other);
    const id = (await start(noor)).json().call.id;
    const busy = await join(omar, id);
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error.code).toBe('in_call');
    // Nor from a 1:1 call.
    await leave(omar, other);
    const direct = (
      await omar.post(`/v1/conversations/${omarSam}/calls`, {
        kind: 'voice',
        deviceId: 'omar-phone-1',
      })
    ).call.id;
    expect((await join(omar, id)).json().error.code).toBe('in_call');
    await omar.post(`/v1/calls/${direct}/end`, {});
    expect((await join(omar, id)).statusCode).toBe(200);
  });

  it('a group call and a 1:1 call never get mixed up', async () => {
    const id = (await start(noor)).json().call.id;
    // Not a 1:1 call to any of the 1:1 routes.
    for (const path of ['end', 'accept', 'decline', 'alive'])
      expect(
        (await noor.req('POST', `/v1/calls/${id}/${path}`, { deviceId: 'noor-tab-1' })).statusCode,
      ).toBe(404);
    await join(sam, id, 'sam-phone-1');
    // The 1:1 sweep leaves it alone, however long it lasts.
    for (let i = 0; i < 4; i++) {
      t.clock.advance(50_000);
      await alive(noor, id);
      await alive(sam, id, 'sam-phone-1');
      await sweepCalls(t.ctx);
      await sweepGroupCalls(t.ctx);
    }
    expect((await noor.get('/v1/group-calls/live')).call).toMatchObject({ id, state: 'active' });
    await leave(sam, id);
    await leave(noor, id);

    // A 1:1 call ringing for someone doesn't keep them out of a group call, but they can't
    // answer it from inside one.
    const direct = (
      await omar.post(`/v1/conversations/${omarSam}/calls`, {
        kind: 'voice',
        deviceId: 'omar-phone-1',
      })
    ).call.id;
    const rung = (await start(noor)).json().call.id;
    expect((await join(sam, rung, 'sam-phone-1')).statusCode).toBe(200);
    const answer = await sam.req('POST', `/v1/calls/${direct}/accept`, { deviceId: 'sam-phone-1' });
    expect(answer.statusCode).toBe(409);
    expect(answer.json().error.code).toBe('in_call');
    await omar.post(`/v1/calls/${direct}/end`, {});
    // Nor does one ringing for whoever starts a group call.
    await leave(sam, rung);
    await leave(noor, rung);
    const toNoor = (
      await omar.post(`/v1/conversations/${noorOmar}/calls`, {
        kind: 'voice',
        deviceId: 'omar-phone-1',
      })
    ).call.id;
    expect((await start(noor)).statusCode).toBe(201);
    await omar.post(`/v1/calls/${toNoor}/end`, {});
  });

  it('offers and answers are limited, candidates less so', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    for (let i = 0; i < 160; i++)
      expect((await signal(noor, id, 'noor-tab-1', 'sam-phone-1')).statusCode).toBe(200);
    expect((await signal(noor, id, 'noor-tab-1', 'sam-phone-1')).statusCode).toBe(429);
    const candidate = {
      kind: 'candidate',
      candidate: { candidate: 'candidate:1 1 udp 1 192.0.2.1 1 typ host' },
    } as any;
    expect((await signal(noor, id, 'noor-tab-1', 'sam-phone-1', candidate)).statusCode).toBe(200);
  });
});
