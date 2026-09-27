import { uuidv7 } from '@caishy/core';
import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { sweepCalls } from '../src/lib/calls';
import { settleGroupCall, sweepGroupCalls } from '../src/lib/group-calls';
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
const leave = (c: Client, id: string, deviceId = device(c)) =>
  c.req('POST', `/v1/group-calls/${id}/leave`, { deviceId });
const decline = (c: Client, id: string) => c.req('POST', `/v1/group-calls/${id}/decline`, {});
const alive = (c: Client, id: string, deviceId = device(c)) =>
  c.req('POST', `/v1/group-calls/${id}/alive`, { deviceId });
const offer = { kind: 'offer', sdp: 'v=0 offer' };
/** Whose a device is, from its name ("sam-phone-1" is Sam's). */
const ownerOf = (d: string) =>
  [noor, sam, omar, lina, zed].find((c) => d.startsWith(`${device(c).split('-')[0]}-`))?.user.id ??
  uuidv7();
const signal = (
  c: Client,
  id: string,
  from: string,
  to: string,
  body = offer,
  toUser = ownerOf(to),
) => c.req('POST', `/v1/group-calls/${id}/signal`, { deviceId: from, to, toUser, ...body });
/** Who is where in the call, as the one who asked sees it, by first name. */
const where = (call: any) =>
  Object.fromEntries(
    call.members.map((m: any) => [m.person.displayName.split(' ')[0], m.state]),
  ) as Record<string, string>;
/** Who is where in the call, all of it (the server's own record), by first name. */
async function inCall(callId: string): Promise<Record<string, string>> {
  const rows = await t.ctx.db
    .selectFrom('call_members as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['u.display_name', 'm.state'])
    .where('m.call_id', '=', callId)
    .execute();
  return Object.fromEntries(rows.map((r) => [r.display_name.split(' ')[0], r.state]));
}
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    expect(await inCall(call.id)).toEqual({
      Noor: 'joined',
      Sam: 'ringing',
      Omar: 'ringing',
      Lina: 'ringing',
    });
    // Who's in it: never who else it rings, nor whether it still rings anyone.
    expect(where(call)).toEqual({ Noor: 'joined' });
    expect('ringing' in call).toBe(false);
    // Only the device in it is named: signals go only between joined devices.
    expect(call.members.map((m: any) => m.device)).toEqual(['noor-tab-1']);
    // Each rung sees who's in it and their own ring, not who else was rung.
    const ringsSam = (await heardSoon('groupcall.ringing', 3)).find(
      (m) => m.userIds[0] === sam.user.id,
    );
    expect(where(ringsSam?.event.data)).toEqual({ Noor: 'joined', Sam: 'ringing' });
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
            fromUser: noor.user.id,
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
    // Addressed to a device of someone else's, it goes nowhere.
    expect(
      (await signal(noor, id, 'noor-tab-1', 'sam-phone-1', offer, omar.user.id)).statusCode,
    ).toBe(403);
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
    heard.length = 0;
    const turnedDown = await decline(lina, id);
    // Lina sees her own answer; nobody else hears who turned it down.
    expect(where(turnedDown.json().call)).toEqual({
      Noor: 'joined',
      Sam: 'joined',
      Lina: 'declined',
    });
    expect(turnedDown.json().call).toMatchObject({ state: 'active' });
    expect(await inCall(id)).toMatchObject({ Lina: 'declined', Omar: 'ringing' });
    // Only Lina's own devices hear it (to stop ringing): nobody else can count it, or time it.
    expect((await heardSoon('groupcall.updated', 1)).map((m) => m.userIds)).toEqual([
      [lina.user.id],
    ]);
    await sleep(150);
    expect(events('groupcall.updated')).toHaveLength(1);
    // Turning it down again changes nothing, and nobody hears of it.
    heard.length = 0;
    const rev = turnedDown.json().call.rev;
    expect((await decline(lina, id)).json().call.rev).toBe(rev);
    await t.ctx.flush();
    expect(events('groupcall.updated')).toHaveLength(0);
    expect((await aboutCall(lina, id)).map((n) => n.read)).toEqual([true]);
    t.clock.advance(30_000);
    await sweepGroupCalls(t.ctx);
    expect((await omar.get('/v1/group-calls/live')).call.id).toBe(id);
    t.clock.advance(16_000);
    // Past its 45 seconds it doesn't ring, even before the sweep says he missed it.
    expect((await omar.get('/v1/group-calls/live')).call).toBeNull();
    // Two sweeps at once (two workers) tell him once; and only him.
    heard.length = 0;
    await Promise.all([sweepGroupCalls(t.ctx), sweepGroupCalls(t.ctx)]);
    await sleep(150);
    expect(events('groupcall.updated').every((m) => m.userIds[0] === omar.user.id)).toBe(true);
    expect((await omar.get('/v1/group-calls/live')).call).toBeNull();
    const told = (await aboutCall(omar, id)).sort((a, b) => a.title.localeCompare(b.title));
    expect(told.map((n) => [n.title, n.body, n.read])).toEqual([
      ['Missed group voice call', 'from Noor Haddad in Trip', false],
      ['Noor Haddad is calling Trip', 'Group voice call', true],
    ]);
    await sweepGroupCalls(t.ctx);
    expect(await aboutCall(omar, id)).toHaveLength(2);
    // A browser still showing a ring shows it's over instead, quietly: Sam joined, Lina turned it
    // down; Omar's is replaced by his missed call, as news.
    expect(
      pushed
        .filter((p) => p.quiet && p.data?.callId === id)
        .map((p) => [p.userId, p.title, p.body])
        .sort(),
    ).toEqual(
      [
        [sam.user.id, 'Trip call', 'Joined'],
        [lina.user.id, 'Trip call', 'Turned down'],
      ].sort(),
    );
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
    expect(where(ended.json().call)).toEqual({ Noor: 'left' });
    expect(await inCall(id)).toEqual({ Noor: 'left', Sam: 'left', Omar: 'left', Lina: 'missed' });
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

    // Everyone rung turned it down: it still rings until its time is up, so when it ends (and
    // how) says nothing about who said no.
    const declined = (await start(noor)).json().call.id;
    await decline(sam, declined);
    await decline(omar, declined);
    expect((await decline(lina, declined)).json().call).toMatchObject({ state: 'ringing' });
    await sweepGroupCalls(t.ctx);
    expect((await noor.get('/v1/group-calls/live')).call).toMatchObject({ id: declined });
    t.clock.advance(46_000);
    await sweepGroupCalls(t.ctx);
    expect((await noor.get('/v1/group-calls/live')).call).toBeNull();
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
      ['missed', true],
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
    expect(where(now)).toEqual({ Noor: 'joined', Omar: 'joined' });
    expect((await inCall(id)).Sam).toBe('left');
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
    expect(Object.keys(await inCall(first.id)).sort()).toEqual(['Noor', 'Omar', 'Sam']);
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
    expect(where(after)).toEqual({ Noor: 'joined', Sam: 'joined' });
    expect((await inCall(second)).Omar).toBe('left');
    await omar.req('DELETE', `/v1/blocks/${sam.user.id}`);
    // Someone in it blocking someone only rung stops their ring.
    await noor.post('/v1/blocks', { userId: lina.user.id });
    expect((await inCall(second)).Lina).toBe('left');
    expect((await lina.get('/v1/group-calls/live')).call).toBeNull();
    expect((await aboutCall(lina, second)).every((n) => n.read)).toBe(true);
    await noor.req('DELETE', `/v1/blocks/${lina.user.id}`);
  });

  it('someone only rung who blocks someone in it has turned it down', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    await lina.post('/v1/blocks', { userId: sam.user.id });
    expect((await inCall(id)).Lina).toBe('declined');
    await lina.req('DELETE', `/v1/blocks/${sam.user.id}`);
  });

  it('someone under 18 is only in a call with people they’re connected with (R29)', async () => {
    const rami = await signup(t, { displayName: 'Rami Young', birthYear: 2011 });
    await connect(rami, noor);
    const family = await group(noor, 'Family', [sam, rami]);
    // Sam and Rami aren't connected: Sam's call doesn't ring Rami, and Rami can't join it.
    const samCalls = (await start(sam, family)).json().call;
    expect(Object.keys(await inCall(samCalls.id)).sort()).toEqual(['Noor', 'Sam']);
    expect((await rami.get('/v1/group-calls/live')).call).toBeNull();
    expect((await rami.get(`/v1/conversations/${family}/group-call`)).call.id).toBe(samCalls.id);
    await join(noor, samCalls.id);
    expect((await join(rami, samCalls.id)).statusCode).toBe(403);
    await leave(sam, samCalls.id);
    expect((await noor.get('/v1/group-calls/live')).call).toBeNull();

    // Noor's rings both; with Rami in it, Sam can't join.
    const noorCalls = (await start(noor, family)).json().call;
    expect(await inCall(noorCalls.id)).toEqual({ Noor: 'joined', Sam: 'ringing', Rami: 'ringing' });
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
    expect(await inCall(id)).toMatchObject({ Omar: 'left', Lina: 'ringing' });
    // Omar hears he's out of it, though he's no longer in the conversation.
    const told = (await heardSoon('groupcall.updated', 5)).filter(
      (m) => m.userIds[0] === omar.user.id,
    );
    expect(told.length).toBeGreaterThan(0);
    // Only his own place in it: not who's in it now, nor what the group is called.
    expect(where(told.at(-1)?.event.data)).toEqual({ Omar: 'left' });
    expect(told.at(-1)?.event.data).toMatchObject({ conversationTitle: null });
    // And out of it, the call is none of his business any more.
    expect((await join(omar, id)).statusCode).toBe(404);
    expect((await alive(omar, id)).statusCode).toBe(404);
    expect((await leave(omar, id)).statusCode).toBe(404);
    // Leaving the group while it rings stops it ringing.
    await lina.del(`/v1/conversations/${trip}/members/${lina.user.id}`);
    expect((await inCall(id)).Lina).toBe('left');
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

  it('a call whose people went some other way is settled by the sweep', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    // Sam's place in it goes without a word (removed underneath, as a cascade would).
    await t.ctx.db
      .deleteFrom('call_members')
      .where('call_id', '=', id)
      .where('user_id', '=', sam.user.id)
      .execute();
    await sweepGroupCalls(t.ctx);
    expect((await noor.get('/v1/group-calls/live')).call).toBeNull();
    expect((await lines(noor)).at(-1).payload).toMatchObject({ outcome: 'completed' });
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

  it('offers and answers are limited for each pair of devices, candidates less so', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    await join(omar, id);
    for (let i = 0; i < 20; i++)
      expect((await signal(noor, id, 'noor-tab-1', 'sam-phone-1')).statusCode).toBe(200);
    expect((await signal(noor, id, 'noor-tab-1', 'sam-phone-1')).statusCode).toBe(429);
    const candidate = {
      kind: 'candidate',
      candidate: { candidate: 'candidate:1 1 udp 1 192.0.2.1 1 typ host' },
    } as any;
    expect((await signal(noor, id, 'noor-tab-1', 'sam-phone-1', candidate)).statusCode).toBe(200);
    // Noor used up what she has for Sam's device only: not hers for Omar (even on a device id
    // like Sam's), nor Sam's for her.
    expect((await signal(noor, id, 'noor-tab-1', 'omar-tab-1')).statusCode).toBe(200);
    await join(omar, id, 'sam-phone-1');
    expect(
      (await signal(noor, id, 'noor-tab-1', 'sam-phone-1', offer, omar.user.id)).statusCode,
    ).toBe(200);
    expect(
      (await signal(sam, id, 'sam-phone-1', 'noor-tab-1', { kind: 'answer', sdp: 'v=0 a' }))
        .statusCode,
    ).toBe(200);
  });

  it('a change to who’s in it holds the call: a join waits for it, and sees what it decided', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    let open: () => void = () => {};
    const gate = new Promise<void>((r) => {
      open = r;
    });
    // Sam leaves, and the change takes its time (a slow database, say).
    const settling = settleGroupCall(t.ctx, id, async (trx) => {
      await trx
        .updateTable('call_members')
        .set({ state: 'left', left_at: t.ctx.now(), device: null })
        .where('call_id', '=', id)
        .where('user_id', '=', sam.user.id)
        .execute();
      await gate;
      return { changed: true };
    });
    await sleep(50);
    let done = false;
    const joining = join(omar, id).then((r) => {
      done = true;
      return r;
    });
    await sleep(250);
    // Omar's join waits for it: nothing is decided on a call as it no longer is.
    const waited = !done;
    open();
    await settling;
    expect(waited).toBe(true);
    const joined = await joining;
    // Sam's leaving left Noor alone, so it ended; Omar's join sees that, and isn't told otherwise.
    expect(joined.statusCode).toBe(409);
    expect(joined.json().error.code).toBe('call_ended');
  });

  it('the sweep decides again under the call’s lock: whoever is back meanwhile stays', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    await join(omar, id);
    await decline(lina, id);
    t.clock.advance(95_000);
    await alive(noor, id);
    await alive(omar, id);
    // Sam went quiet; his heartbeat lands while the sweep waits for the call.
    let sweeping: Promise<void> | undefined;
    await t.ctx.db.transaction().execute(async (trx) => {
      await trx.selectFrom('calls').select('id').where('id', '=', id).forUpdate().execute();
      sweeping = sweepGroupCalls(t.ctx);
      await sleep(250);
      await trx
        .updateTable('call_members')
        .set({ seen_at: t.ctx.now() })
        .where('call_id', '=', id)
        .where('user_id', '=', sam.user.id)
        .execute();
    });
    await sweeping;
    expect((await inCall(id)).Sam).toBe('joined');
    // Moved to another device meanwhile, he stays too, until that one goes quiet.
    t.clock.advance(95_000);
    await alive(noor, id);
    await alive(omar, id);
    await t.ctx.db.transaction().execute(async (trx) => {
      await trx.selectFrom('calls').select('id').where('id', '=', id).forUpdate().execute();
      sweeping = sweepGroupCalls(t.ctx);
      await sleep(250);
      await trx
        .updateTable('call_members')
        .set({ device: 'sam-laptop-1' })
        .where('call_id', '=', id)
        .where('user_id', '=', sam.user.id)
        .execute();
    });
    await sweeping;
    expect((await inCall(id)).Sam).toBe('joined');
    await sweepGroupCalls(t.ctx);
    expect((await inCall(id)).Sam).toBe('left');
  });

  it('only the device in the call can leave it', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    await join(sam, id, 'sam-laptop-1');
    heard.length = 0;
    // The tab left behind closes: Sam is still in it on his laptop, and nobody hears a thing.
    const behind = await leave(sam, id, 'sam-phone-1');
    expect(behind.statusCode).toBe(200);
    expect(where(behind.json().call)).toEqual({ Noor: 'joined', Sam: 'joined' });
    await sleep(200);
    expect(events('groupcall.updated')).toHaveLength(0);
    expect((await leave(sam, id, 'sam-laptop-1')).json().call.state).toBe('ended');
    // Saying which device is how.
    expect((await sam.req('POST', `/v1/group-calls/${id}/leave`, {})).statusCode).toBe(400);
  });

  it('a device id someone else holds is theirs only: signals go by person and device', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    // Omar joins with the same device id as Sam's (he could read it): it takes nothing from Sam.
    expect((await join(omar, id, 'sam-phone-1')).statusCode).toBe(200);
    expect((await alive(sam, id, 'sam-phone-1')).statusCode).toBe(200);
    heard.length = 0;
    await signal(noor, id, 'noor-tab-1', 'sam-phone-1', offer, sam.user.id);
    await signal(noor, id, 'noor-tab-1', 'sam-phone-1', offer, omar.user.id);
    const sent = await heardSoon('groupcall.signal', 2);
    expect(sent.map((m) => m.userIds[0]).sort()).toEqual(ids([sam, omar]));
    // Nobody outside the call learns its devices: the banner doesn't need them.
    const banner = (await lina.get(`/v1/conversations/${trip}/group-call`)).call;
    expect(banner.members).toHaveLength(4);
    expect(banner.members.every((m: any) => m.device === null)).toBe(true);
  });

  it('whoever started it deleting their account leaves it: it goes on, and keeps its line', async () => {
    const ivy = await signup(t, { displayName: 'Ivy Starter' });
    await connect(ivy, sam);
    await connect(ivy, omar);
    const club = await group(ivy, 'Club', [sam, omar]);
    const id = (await start(ivy, club)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    await join(omar, id);
    heard.length = 0;
    const gone = await ivy.req('DELETE', '/v1/me', { password: 'correct horse battery' });
    expect(gone.statusCode).toBeLessThan(300);
    // The others hear it at once, not at their next heartbeat.
    const told = (await heardSoon('groupcall.updated', 2)).filter(
      (m) => m.userIds[0] === sam.user.id,
    );
    expect(where(told.at(-1)?.event.data)).toEqual({ Sam: 'joined', Omar: 'joined' });
    expect((await sam.get('/v1/group-calls/live')).call).toMatchObject({ id, state: 'active' });
    t.clock.advance(60_000);
    await leave(sam, id, 'sam-phone-1');
    const line = (await lines(omar, club)).at(-1);
    expect(line.payload).toMatchObject({ outcome: 'completed', group: true, seconds: 60 });
    expect(line.senderId).toBe(sam.user.id);
  });

  it('a missed call reaches the phone of nobody who muted the group', async () => {
    await lina.patch(`/v1/conversations/${trip}`, {
      mutedUntil: new Date(t.ctx.now().getTime() + 3600_000).toISOString(),
    });
    const id = (await start(noor)).json().call.id;
    pushed.length = 0;
    t.clock.advance(46_000);
    await sweepGroupCalls(t.ctx);
    await t.ctx.flush();
    const missed = pushed.filter((p) => p.title === 'Missed group video call');
    expect(missed.map((p) => p.userId).sort()).toEqual(ids([sam, omar]));
    // She still finds it in the app.
    expect((await aboutCall(lina, id)).map((n) => n.title)).toContain('Missed group video call');
    await lina.patch(`/v1/conversations/${trip}`, { mutedUntil: null });
  });

  it('a connection removed mid-call leaves nobody under 18 in it with them (R29)', async () => {
    const tia = await signup(t, { displayName: 'Tia Young', birthYear: 2012 });
    await connect(tia, noor);
    await connect(tia, sam);
    const kin = await group(noor, 'Kin', [sam, tia]);
    const id = (await start(noor, kin)).json().call.id;
    await join(tia, id);
    await join(sam, id, 'sam-phone-1');
    const side = (owner: Client, other: Client) =>
      t.ctx.db
        .selectFrom('connection_sides')
        .select('connection_id')
        .where('owner_id', '=', owner.user.id)
        .where('other_id', '=', other.user.id)
        .executeTakeFirstOrThrow();
    await sam.del(`/v1/connections/${(await side(sam, tia)).connection_id}`);
    // Sam removed it: he leaves, and it goes on for Noor and Tia.
    expect(await inCall(id)).toEqual({ Noor: 'joined', Tia: 'joined', Sam: 'left' });
    await leave(noor, id);

    // Between two adults it changes nothing.
    const uma = await signup(t, { displayName: 'Uma Adult' });
    const vic = await signup(t, { displayName: 'Vic Adult' });
    await connect(uma, noor);
    await connect(vic, noor);
    await connect(uma, vic);
    const trio = await group(noor, 'Trio', [uma, vic]);
    const call = (await start(noor, trio)).json().call.id;
    await join(uma, call);
    await join(vic, call);
    await uma.del(`/v1/connections/${(await side(uma, vic)).connection_id}`);
    expect(await inCall(call)).toEqual({ Noor: 'joined', Uma: 'joined', Vic: 'joined' });
  });

  it('two people calling someone at once can’t both be answered', async () => {
    const fromOmar = (
      await omar.post(`/v1/conversations/${omarSam}/calls`, {
        kind: 'voice',
        deviceId: 'omar-phone-1',
      })
    ).call.id;
    // Noor called at the same moment: both saw Sam free, so both ring him.
    const fromNoor = uuidv7();
    await t.ctx.db
      .insertInto('calls')
      .values({
        id: fromNoor,
        conversation_id: noorSam,
        caller_id: noor.user.id,
        callee_id: sam.user.id,
        kind: 'voice',
        state: 'ringing',
        caller_device: 'noor-tab-1',
        created_at: t.ctx.now(),
        seen_at: t.ctx.now(),
        caller_seen_at: t.ctx.now(),
        callee_rung: true,
      })
      .execute();
    const answered = await Promise.all([
      sam.req('POST', `/v1/calls/${fromOmar}/accept`, { deviceId: 'sam-phone-1' }),
      sam.req('POST', `/v1/calls/${fromNoor}/accept`, { deviceId: 'sam-laptop-1' }),
    ]);
    expect(answered.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    await omar.post(`/v1/calls/${fromOmar}/end`, {});
    await noor.post(`/v1/calls/${fromNoor}/end`, {});
  });

  it('two devices can’t put someone in two calls at once', async () => {
    for (let round = 0; round < 3; round++) {
      // Omar rings Sam, and just as Sam's phone answers, his laptop joins the group's call.
      const direct = (
        await omar.post(`/v1/conversations/${omarSam}/calls`, {
          kind: 'voice',
          deviceId: 'omar-phone-1',
        })
      ).call.id;
      const id = (await start(noor)).json().call.id;
      const [answered, joined] = await Promise.all([
        sam.req('POST', `/v1/calls/${direct}/accept`, { deviceId: 'sam-phone-1' }),
        join(sam, id, 'sam-laptop-1'),
      ]);
      expect([answered.statusCode, joined.statusCode].sort()).toEqual([200, 409]);
      await omar.post(`/v1/calls/${direct}/end`, {});
      await leave(sam, id, 'sam-laptop-1');
      await leave(noor, id);
    }
  });

  it('everyone is named as they show themselves to whoever sees the call', async () => {
    // Sam shows Omar his work identity.
    const identity = (
      await sam.post('/v1/me/identities', { kind: 'professional', displayName: 'Dr. S. Rivera' })
    ).id;
    const connection = await t.ctx.db
      .selectFrom('connection_sides')
      .select('connection_id')
      .where('owner_id', '=', sam.user.id)
      .where('other_id', '=', omar.user.id)
      .executeTakeFirstOrThrow();
    await sam.patch(`/v1/connections/${connection.connection_id}`, { identityId: identity });
    const id = (await start(sam)).json().call.id;
    expect((await aboutCall(omar, id))[0].title).toBe('Dr. S. Rivera is calling Trip');
    expect((await aboutCall(noor, id))[0].title).toBe('Sam Rivera is calling Trip');
    expect((await omar.get('/v1/group-calls/live')).call.startedBy.displayName).toBe(
      'Dr. S. Rivera',
    );
    const inIt = (await join(omar, id)).json().call;
    expect(inIt.members.find((m: any) => m.person.id === sam.user.id).person.displayName).toBe(
      'Dr. S. Rivera',
    );
    expect((await noor.get('/v1/group-calls/live')).call.startedBy.displayName).toBe('Sam Rivera');
    await leave(omar, id);
    await leave(sam, id, 'sam-tab-1');
    // A 1:1 call too: its ring, and the call as Omar sees it.
    const direct = (
      await sam.post(`/v1/conversations/${omarSam}/calls`, {
        kind: 'voice',
        deviceId: 'sam-phone-1',
      })
    ).call.id;
    const ring = ((await omar.get('/v1/notifications')).notifications as any[]).find(
      (n) => n.data?.callId === direct,
    );
    expect(ring.title).toBe('Dr. S. Rivera is calling');
    expect((await omar.get('/v1/calls/live')).call.caller.displayName).toBe('Dr. S. Rivera');
    await sam.post(`/v1/calls/${direct}/end`, {});
    await t.ctx.flush();
    const missed = ((await omar.get('/v1/notifications')).notifications as any[]).find(
      (n) => n.data?.callId === direct && n.title.startsWith('Missed'),
    );
    expect(missed?.body).toBe('from Dr. S. Rivera');
    await sam.patch(`/v1/connections/${connection.connection_id}`, { identityId: null });
  });

  it('who turned it down, missed it, or was never rung is nobody else’s business', async () => {
    // Lina blocked Noor: Noor's call rings only Sam and Omar.
    await lina.post('/v1/blocks', { userId: noor.user.id });
    const call = (await start(noor)).json().call;
    const joined = (await join(sam, call.id, 'sam-phone-1')).json().call;
    expect(joined.rev).toBe(1);
    heard.length = 0;
    // Omar says no: the call's revision stays, and only Omar hears it.
    await decline(omar, call.id);
    await sleep(150);
    expect(events('groupcall.updated').map((m) => m.userIds[0])).toEqual([omar.user.id]);
    expect((await alive(sam, call.id, 'sam-phone-1')).json().call.rev).toBe(1);
    await leave(sam, call.id, 'sam-phone-1');
    await lina.req('DELETE', `/v1/blocks/${noor.user.id}`);
    // A ring stopped by a block is nobody else's either: Lina, only rung, blocks Sam, who's in it.
    const next = (await start(noor)).json().call.id;
    await join(sam, next, 'sam-phone-1');
    heard.length = 0;
    await lina.post('/v1/blocks', { userId: sam.user.id });
    await sleep(150);
    expect(events('groupcall.updated').map((m) => m.userIds[0])).toEqual([lina.user.id]);
    expect((await inCall(next)).Lina).toBe('declined');
    await lina.req('DELETE', `/v1/blocks/${sam.user.id}`);
  });

  it('a join under way when a block lands: the block waits for it, and they aren’t in it together', async () => {
    const id = (await start(noor)).json().call.id;
    let blocking: Promise<unknown> | undefined;
    await t.ctx.db.transaction().execute(async (trx) => {
      // Sam's join, holding his entry into calls, as a join does.
      await sql`select pg_advisory_xact_lock(hashtext(${`call-entry:${sam.user.id}`}))`.execute(
        trx,
      );
      await trx
        .updateTable('call_members')
        .set({
          state: 'joined',
          device: 'sam-phone-1',
          joined_at: t.ctx.now(),
          seen_at: t.ctx.now(),
        })
        .where('call_id', '=', id)
        .where('user_id', '=', sam.user.id)
        .execute();
      blocking = noor.post('/v1/blocks', { userId: sam.user.id });
      await sleep(250);
    });
    await blocking;
    const now = await inCall(id);
    expect(now.Noor === 'joined' && now.Sam === 'joined').toBe(false);
    await noor.req('DELETE', `/v1/blocks/${sam.user.id}`);
  });

  it('whoever shouldn’t be in it any more is out of it by their next beat', async () => {
    const id = (await start(noor)).json().call.id;
    await join(sam, id, 'sam-phone-1');
    await join(omar, id);
    // A block that reached nobody's call (as a race might leave it).
    await t.ctx.db
      .insertInto('blocks')
      .values({ blocker_id: sam.user.id, blocked_id: omar.user.id })
      .execute();
    const beat = await alive(omar, id);
    expect(beat.statusCode).toBe(403);
    expect(beat.json().error.code).toBe('not_in_call');
    expect((await inCall(id)).Omar).toBe('left');
    await t.ctx.db.deleteFrom('blocks').where('blocker_id', '=', sam.user.id).execute();
    // Out of the conversation (the same): out of the call, and nothing it sends is passed on.
    await join(omar, id);
    await t.ctx.db
      .updateTable('participants')
      .set({ left_at: t.ctx.now() })
      .where('conversation_id', '=', trip)
      .where('user_id', '=', omar.user.id)
      .execute();
    expect((await signal(omar, id, 'omar-tab-1', 'noor-tab-1')).statusCode).toBe(403);
    expect((await alive(omar, id)).statusCode).toBe(403);
    expect((await inCall(id)).Omar).toBe('left');
    await t.ctx.db
      .updateTable('participants')
      .set({ left_at: null })
      .where('conversation_id', '=', trip)
      .where('user_id', '=', omar.user.id)
      .execute();
  });
});
