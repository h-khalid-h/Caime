import { createHmac } from 'node:crypto';
import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { endCall, iceConfig, sweepCalls } from '../src/lib/calls';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let omar: Client; // knows Sam too
let convo: string;
let omarSam: string;
const heard: BusMessage[] = [];

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

  it('a call both sides left is ended, lasting until they were last there', async () => {
    const left = (await call(noor, convo)).json().call.id;
    await sam.post(`/v1/calls/${left}/accept`, { deviceId: 'sam-phone-1' });
    t.clock.advance(60_000);
    await noor.post(`/v1/calls/${left}/alive`, {});
    t.clock.advance(80_000);
    await sweepCalls(t.ctx);
    // Still there 80 seconds ago: not over yet.
    expect((await noor.get('/v1/calls/live')).call.id).toBe(left);
    t.clock.advance(15_000);
    await sweepCalls(t.ctx);
    expect((await noor.get('/v1/calls/live')).call).toBeNull();
    expect((await lines(sam)).at(-1).payload).toMatchObject({ outcome: 'completed', seconds: 60 });
    // And neither is busy now.
    const next = await call(noor, convo);
    expect(next.statusCode).toBe(201);
    await noor.post(`/v1/calls/${next.json().call.id}/end`, {});
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
