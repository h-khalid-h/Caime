import { createHmac } from 'node:crypto';
import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { endCall, iceConfig, sweepCalls } from '../src/lib/calls';
import { type NotifyInput, onNotification } from '../src/lib/notify';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let omar: Client; // knows Sam too
let convo: string;
let omarSam: string;
const heard: BusMessage[] = [];
/** What went to devices as a push, as notify was asked. */
const pushed: NotifyInput[] = [];

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}
const call = (c: Client, conversationId: string, kind = 'video', deviceId = 'noor-tab-1') =>
  c.req('POST', `/v1/conversations/${conversationId}/calls`, { kind, deviceId });
const signal = (c: Client, id: string, deviceId: string, body: Record<string, unknown>) =>
  c.req('POST', `/v1/calls/${id}/signal`, { deviceId, ...body });
/** What the bus carried of one type, to whom. */
const events = (type: string) => heard.filter((m) => m.event.type === type);
/** The bus delivers through Postgres (ADR-5): wait for what should have arrived. */
async function heardSoon(type: string, count: number) {
  for (let i = 0; i < 100 && events(type).length < count; i++)
    await new Promise((r) => setTimeout(r, 20));
  return events(type);
}
const lines = async (c: Client, conversationId = convo) =>
  ((await c.get(`/v1/conversations/${conversationId}/messages`)).messages as any[]).filter(
    (m) => m.kind === 'system' && m.payload.event === 'call',
  );

beforeAll(async () => {
  t = await createTestApp();
  t.ctx.bus.subscribe((m) => heard.push(m));
  onNotification(async (_ctx, _id, input) => {
    pushed.push(input);
  });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  convo = await connect(noor, sam);
  omarSam = await connect(omar, sam);
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  heard.length = 0;
});

describe('calls (PRD §47)', () => {
  let id: string;

  it('rings the other person on every device, and says who’s calling', async () => {
    const res = await call(noor, convo);
    expect(res.statusCode).toBe(201);
    id = res.json().call.id;
    expect(res.json().call).toMatchObject({
      kind: 'video',
      state: 'ringing',
      caller: { id: noor.user.id, displayName: 'Noor Haddad' },
      callee: { id: sam.user.id, displayName: 'Sam Rivera' },
      callerDevice: 'noor-tab-1',
      calleeDevice: null,
    });
    const ringing = await heardSoon('call.ringing', 1);
    expect(ringing.map((m) => m.userIds)).toEqual([[sam.user.id]]);
    // Noor's own devices follow along, without ringing.
    expect((await heardSoon('call.updated', 1)).map((m) => m.userIds)).toEqual([[noor.user.id]]);
    await t.ctx.flush();
    const alert = (await sam.get('/v1/notifications')).notifications.find(
      (n: any) => n.data?.callId === id,
    );
    expect(alert).toMatchObject({ title: 'Noor Haddad is calling', level: 'urgency' });
    // A page opened while it rings finds it.
    expect((await sam.get('/v1/calls/live')).call.id).toBe(id);
    expect((await omar.get('/v1/calls/live')).call).toBeNull();
  });

  it('one call at a time, on either side', async () => {
    const again = await call(noor, convo);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('in_call');
    const busy = await call(omar, omarSam, 'voice', 'omar-phone-1');
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error.message).toBe('Sam Rivera is on another call.');
  });

  it('answered on one device, signals pass only between the two devices in it', async () => {
    // Only the person called answers.
    expect(
      (await noor.req('POST', `/v1/calls/${id}/accept`, { deviceId: 'noor-tab-2' })).statusCode,
    ).toBe(403);
    const answered = await sam.req('POST', `/v1/calls/${id}/accept`, { deviceId: 'sam-phone-1' });
    expect(answered.json().call).toMatchObject({ state: 'active', calleeDevice: 'sam-phone-1' });
    // Both sides hear it, so Sam's other devices stop ringing.
    expect(
      events('call.updated')
        .map((m) => m.userIds)
        .sort(),
    ).toEqual([[noor.user.id], [sam.user.id]].sort());
    expect(
      (await sam.req('POST', `/v1/calls/${id}/accept`, { deviceId: 'sam-laptop-1' })).statusCode,
    ).toBe(409);

    const offer = { kind: 'offer', sdp: 'v=0 offer' };
    expect((await signal(noor, id, 'noor-tab-1', offer)).statusCode).toBe(200);
    expect(await heardSoon('call.signal', 1)).toEqual([
      {
        userIds: [sam.user.id],
        event: {
          type: 'call.signal',
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
    heard.length = 0;
    await signal(sam, id, 'sam-phone-1', { kind: 'answer', sdp: 'v=0 answer' });
    await signal(sam, id, 'sam-phone-1', {
      kind: 'candidate',
      candidate: {
        candidate: 'candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
        // As RTCIceCandidate.toJSON() gives it.
        usernameFragment: 'f9Kx',
      },
    });
    expect(
      (await heardSoon('call.signal', 2)).map((m) => [m.userIds, (m.event.data as any).kind]),
    ).toEqual([
      [[noor.user.id], 'answer'],
      [[noor.user.id], 'candidate'],
    ]);
    // Nobody else's device joins in: not another of Sam's, not another of Noor's, not Omar.
    expect((await signal(sam, id, 'sam-laptop-1', offer)).statusCode).toBe(403);
    expect((await signal(noor, id, 'noor-tab-2', offer)).statusCode).toBe(403);
    expect((await signal(omar, id, 'omar-phone-1', offer)).statusCode).toBe(404);
    expect((await signal(noor, id, 'noor-tab-1', { kind: 'offer' })).statusCode).toBe(400);
  });

  it('hung up, it ends for both and leaves how long they talked', async () => {
    t.clock.advance(4 * 60_000 + 10_000);
    const ended = await noor.post(`/v1/calls/${id}/end`, { deviceId: 'noor-tab-1' });
    expect(ended.call).toMatchObject({ state: 'ended', outcome: 'completed' });
    expect(await heardSoon('call.updated', 2)).toHaveLength(2);
    const [line] = await lines(sam);
    expect(line.payload).toMatchObject({
      event: 'call',
      kind: 'video',
      outcome: 'completed',
      seconds: 250,
    });
    expect(line.senderId).toBe(noor.user.id);
    // Hanging up twice changes nothing, even racing the sweep with what it read before.
    await noor.post(`/v1/calls/${id}/end`, {});
    const stale = await t.ctx.db
      .selectFrom('calls')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(await endCall(t.ctx, { ...stale, state: 'active' }, 'completed')).toBeNull();
    expect(await lines(sam)).toHaveLength(1);
    expect((await signal(noor, id, 'noor-tab-1', { kind: 'offer', sdp: 'x' })).statusCode).toBe(
      409,
    );
  });

  it('unanswered, it’s missed after 45 seconds, and the person called hears so', async () => {
    const rung = (await call(noor, convo, 'voice')).json().call.id;
    t.clock.advance(30_000);
    await sweepCalls(t.ctx);
    expect((await sam.get('/v1/calls/live')).call.id).toBe(rung);
    t.clock.advance(16_000);
    await sweepCalls(t.ctx);
    expect((await sam.get('/v1/calls/live')).call).toBeNull();
    const missed = (await lines(sam)).at(-1);
    expect(missed.payload).toMatchObject({ kind: 'voice', outcome: 'missed', seconds: 0 });
    await t.ctx.flush();
    const alert = (await sam.get('/v1/notifications')).notifications.find(
      (n: any) => n.data?.callId === rung && n.title.startsWith('Missed'),
    );
    expect(alert).toMatchObject({ title: 'Missed voice call', body: 'from Noor Haddad' });
    expect(
      (await sam.req('POST', `/v1/calls/${rung}/accept`, { deviceId: 'sam-phone-1' })).statusCode,
    ).toBe(409);
  });

  it('declined, or called off before it’s answered', async () => {
    const turnedDown = (await call(noor, convo)).json().call.id;
    await sam.post(`/v1/calls/${turnedDown}/decline`, {});
    expect((await lines(sam)).at(-1).payload.outcome).toBe('declined');
    // Only the person called declines.
    const cancelled = (await call(noor, convo)).json().call.id;
    expect((await noor.req('POST', `/v1/calls/${cancelled}/decline`, {})).statusCode).toBe(403);
    await noor.post(`/v1/calls/${cancelled}/end`, {});
    expect((await lines(sam)).at(-1).payload.outcome).toBe('cancelled');
  });

  it('each side says it’s still there for itself: one side can’t keep a call the other left', async () => {
    const left = (await call(noor, convo)).json().call.id;
    await sam.post(`/v1/calls/${left}/accept`, { deviceId: 'sam-phone-1' });
    // Only a device in the call says so, and it hears how the call stands.
    expect(
      (await sam.req('POST', `/v1/calls/${left}/alive`, { deviceId: 'sam-laptop-1' })).statusCode,
    ).toBe(403);
    t.clock.advance(60_000);
    const alive = await noor.post(`/v1/calls/${left}/alive`, { deviceId: 'noor-tab-1' });
    expect(alive.call).toMatchObject({ id: left, state: 'active' });
    await sam.post(`/v1/calls/${left}/alive`, { deviceId: 'sam-phone-1' });
    // Sam's tab is gone; Noor's goes on saying she's there.
    t.clock.advance(50_000);
    await noor.post(`/v1/calls/${left}/alive`, { deviceId: 'noor-tab-1' });
    t.clock.advance(35_000);
    await sweepCalls(t.ctx);
    // Sam was there 85 seconds ago: not over yet.
    expect((await noor.get('/v1/calls/live')).call.id).toBe(left);
    t.clock.advance(10_000);
    await noor.post(`/v1/calls/${left}/alive`, { deviceId: 'noor-tab-1' });
    // Past 90 seconds without Sam, it isn't a call anyone is busy with, even before the sweep.
    expect((await noor.get('/v1/calls/live')).call).toBeNull();
    expect((await sam.get('/v1/calls/live')).call).toBeNull();
    await sweepCalls(t.ctx);
    expect((await noor.get('/v1/calls/live')).call).toBeNull();
    // It lasted until Sam was last there.
    expect((await lines(sam)).at(-1).payload).toMatchObject({ outcome: 'completed', seconds: 60 });
    // Over, it says how it ended, for a device that missed the event.
    const after = await noor.req('POST', `/v1/calls/${left}/alive`, { deviceId: 'noor-tab-1' });
    expect(after.statusCode).toBe(409);
    expect(after.json().error.details.call).toMatchObject({ state: 'ended', outcome: 'completed' });
    // And neither is busy now.
    const next = await call(noor, convo);
    expect(next.statusCode).toBe(201);
    await noor.post(`/v1/calls/${next.json().call.id}/end`, {});
  });

  it('blocking ends a call between the two at once, and quietly', async () => {
    const ringing = (await call(noor, convo)).json().call.id;
    await sam.post('/v1/blocks', { userId: noor.user.id });
    expect((await sam.get('/v1/calls/live')).call).toBeNull();
    expect((await noor.get('/v1/calls/live')).call).toBeNull();
    expect((await lines(noor)).at(-1).payload.outcome).toBe('declined');
    await sam.req('DELETE', `/v1/blocks/${noor.user.id}`);

    const talking = (await call(noor, convo)).json().call.id;
    await sam.post(`/v1/calls/${talking}/accept`, { deviceId: 'sam-phone-1' });
    await noor.post('/v1/blocks', { userId: sam.user.id });
    expect((await sam.get('/v1/calls/live')).call).toBeNull();
    expect(
      (await sam.req('POST', `/v1/calls/${talking}/alive`, { deviceId: 'sam-phone-1' })).statusCode,
    ).toBe(409);
    expect(
      (await signal(sam, talking, 'sam-phone-1', { kind: 'offer', sdp: 'v=0 x' })).statusCode,
    ).toBe(409);
    await noor.req('DELETE', `/v1/blocks/${sam.user.id}`);

    // Blocked while it rang, the person called isn't told they missed it.
    const quiet = (await call(noor, convo)).json().call.id;
    await noor.post('/v1/blocks', { userId: sam.user.id });
    await t.ctx.flush();
    expect(
      (await sam.get('/v1/notifications')).notifications.some(
        (n: any) => n.data?.callId === quiet && n.title.startsWith('Missed'),
      ),
    ).toBe(false);
    await noor.req('DELETE', `/v1/blocks/${sam.user.id}`);
    expect(ringing).not.toBe(talking);
  });

  it('the ring is read once it stops, and its push lasts only as long as it rings', async () => {
    const ring = async (callId: string) => {
      await t.ctx.flush();
      return (await sam.get('/v1/notifications')).notifications.find(
        (n: any) => n.data?.callId === callId && n.title.endsWith('is calling'),
      );
    };
    const answered = (await call(noor, convo)).json().call.id;
    expect((await ring(answered)).read).toBe(false);
    // The phone apps can't answer yet: it goes to browsers only.
    expect(pushed.find((p) => p.data?.callId === answered)).toMatchObject({
      ttlSeconds: 45,
      pushTo: 'web',
    });
    heard.length = 0;
    await sam.post(`/v1/calls/${answered}/accept`, { deviceId: 'sam-phone-1' });
    expect((await ring(answered)).read).toBe(true);
    expect((await heardSoon('notifications.read', 1))[0]?.userIds).toEqual([sam.user.id]);
    // A browser still showing the ring shows it's over instead, quietly, under the same key
    // (never a push that shows nothing).
    const quietly = (callId: string) => pushed.filter((p) => p.data?.callId === callId && p.quiet);
    expect(quietly(answered)).toEqual([
      expect.objectContaining({
        userId: sam.user.id,
        title: 'Noor Haddad',
        body: 'Answered',
        level: 'activity',
        groupKey: `call:${answered}`,
        pushTo: 'web',
      }),
    ]);
    await noor.post(`/v1/calls/${answered}/end`, { deviceId: 'noor-tab-1' });
    // Once over, nothing more: the ring was replaced already.
    expect(quietly(answered)).toHaveLength(1);

    const declined = (await call(noor, convo)).json().call.id;
    await sam.post(`/v1/calls/${declined}/decline`, {});
    expect((await ring(declined)).read).toBe(true);
    expect(quietly(declined)).toEqual([expect.objectContaining({ body: 'Declined' })]);

    const missed = (await call(noor, convo, 'voice')).json().call.id;
    t.clock.advance(46_000);
    await sweepCalls(t.ctx);
    expect((await ring(missed)).read).toBe(true);
    const told = (await sam.get('/v1/notifications')).notifications.find(
      (n: any) => n.data?.callId === missed && n.title.startsWith('Missed'),
    );
    expect(told.read).toBe(false);
    // A missed call replaces the ring itself, as news.
    expect(quietly(missed)).toEqual([]);
    expect(pushed.filter((p) => p.data?.callId === missed && !p.quiet)).toHaveLength(2);
  });

  it('a large signal passes through without staying in the database; offers are few', async () => {
    const big = (await call(noor, convo)).json().call.id;
    await sam.post(`/v1/calls/${big}/accept`, { deviceId: 'sam-phone-1' });
    const stored = async () =>
      (
        await t.ctx.db
          .selectFrom('domain_events')
          .select('id')
          .where('type', '=', 'realtime.large')
          .execute()
      ).length;
    const before = await stored();
    const sdp = `v=0 ${'a'.repeat(9000)}`;
    expect((await signal(noor, big, 'noor-tab-1', { kind: 'offer', sdp })).statusCode).toBe(200);
    expect(((await heardSoon('call.signal', 1))[0]!.event.data as any).sdp).toBe(sdp);
    expect(await stored()).toBe(before + 1);
    // Once nothing could still be reading it, it goes.
    await t.ctx.db
      .updateTable('domain_events')
      .set({ created_at: sql<Date>`now() - interval '11 minutes'` })
      .where('type', '=', 'realtime.large')
      .execute();
    await t.ctx.bus.sweep();
    expect(await stored()).toBe(0);
    // Offers and answers are few in a call; candidates are many, and small.
    for (let i = 0; i < 19; i++)
      await signal(noor, big, 'noor-tab-1', { kind: 'offer', sdp: 'v=0 again' });
    expect(
      (await signal(noor, big, 'noor-tab-1', { kind: 'offer', sdp: 'v=0 more' })).statusCode,
    ).toBe(429);
    await noor.post(`/v1/calls/${big}/end`, {});
  });

  it('someone who hides that they’re online isn’t given away by being on a call', async () => {
    const talking = (await call(noor, convo)).json().call.id;
    await sam.post(`/v1/calls/${talking}/accept`, { deviceId: 'sam-phone-1' });
    await sam.patch('/v1/me', { presence: 'invisible' });
    heard.length = 0;
    // A moment later, so the call Omar starts is the newer one.
    t.clock.advance(1000);
    // To Omar it's any call: it rings, for as long as calls ring.
    const rung = await call(omar, omarSam, 'voice', 'omar-phone-1');
    expect(rung.statusCode).toBe(201);
    const held = rung.json().call;
    expect(held).toMatchObject({ state: 'ringing' });
    expect((await omar.get('/v1/calls/live')).call.id).toBe(held.id);
    // Sam isn't rung, on any device; the call he's in is still his.
    await heardSoon('call.updated', 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(events('call.ringing')).toEqual([]);
    expect((await sam.get('/v1/calls/live')).call.id).toBe(talking);
    expect(
      (await sam.req('POST', `/v1/calls/${held.id}/accept`, { deviceId: 'sam-laptop-1' }))
        .statusCode,
    ).toBe(409);
    await t.ctx.flush();
    const aboutIt = async () =>
      (await sam.get('/v1/notifications')).notifications.filter(
        (n: any) => n.data?.callId === held.id,
      );
    expect(await aboutIt()).toEqual([]);
    // Unanswered, it's missed, and Sam finds it among his missed calls.
    t.clock.advance(46_000);
    await sweepCalls(t.ctx);
    expect((await omar.get('/v1/calls/live')).call).toBeNull();
    expect((await lines(sam, omarSam)).at(-1).payload).toMatchObject({ outcome: 'missed' });
    await t.ctx.flush();
    expect((await aboutIt()).map((n: any) => n.title)).toEqual(['Missed voice call']);
    await sam.patch('/v1/me', { presence: 'auto' });
    await noor.post(`/v1/calls/${talking}/end`, { deviceId: 'noor-tab-1' });
  });

  it('only between two people who can already write to each other', async () => {
    const group = (
      await noor.post('/v1/conversations', {
        kind: 'group',
        title: 'Trio',
        memberIds: [sam.user.id],
      })
    ).conversation.id;
    expect((await call(noor, group)).json().error.message).toBe(
      'Calls are for conversations between two people.',
    );
    const zed = await signup(t, { displayName: 'Zed Stranger' });
    const request = (await zed.post('/v1/conversations', { kind: 'direct', userId: noor.user.id }))
      .conversation.id;
    await zed.post(`/v1/conversations/${request}/messages`, {
      clientId: uuidv4(),
      body: 'Hi Noor!',
    });
    expect((await call(zed, request, 'voice', 'zed-tab-1')).json().error.code).toBe(
      'awaiting_acceptance',
    );
    expect((await call(noor, request)).json().error.code).toBe('awaiting_acceptance');
    expect((await call(omar, convo, 'voice', 'omar-phone-1')).statusCode).toBe(404);
    await t.ctx.db
      .insertInto('blocks')
      .values({ blocker_id: sam.user.id, blocked_id: omar.user.id })
      .execute();
    expect((await call(omar, omarSam, 'voice', 'omar-phone-1')).statusCode).toBe(403);
  });

  it('reaches the other side through STUN, and a relay with credentials that expire', () => {
    const at = new Date('2026-09-26T12:00:00Z');
    const secret = 'relay-shared-secret-0123456789';
    const ctx = {
      config: {
        stunUrls: ['stun:stun.example:3478'],
        turnUrls: ['turn:turn.example:3478', 'turns:turn.example:5349'],
        TURN_SECRET: secret,
      },
      now: () => at,
    } as unknown as TestApp['ctx'];
    const { iceServers, relay } = iceConfig(ctx, 'user-1');
    expect(relay).toBe(true);
    expect(iceServers[0]).toEqual({ urls: ['stun:stun.example:3478'] });
    const expiry = at.getTime() / 1000 + 12 * 3600;
    expect(iceServers[1]).toEqual({
      urls: ['turn:turn.example:3478', 'turns:turn.example:5349'],
      username: `${expiry}:user-1`,
      credential: createHmac('sha1', secret).update(`${expiry}:user-1`).digest('base64'),
    });
    // The default: STUN only, and it says there's no relay.
    expect(iceConfig(t.ctx, 'user-1')).toEqual({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
      relay: false,
    });
  });
});
