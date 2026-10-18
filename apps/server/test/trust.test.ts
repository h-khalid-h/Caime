/**
 * Safety and trust, the first slice of block B (REVIEW 2026-10-17 §2): someone under 18 shows
 * nothing to everyone whatever was saved, reads as nobody to an adult stranger, and is never
 * connected by an adult stranger's link; a suspended account reads as gone; a read's moment
 * reaches nobody who may not see it, and a request nobody answered tells its sender nothing.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { busSettled, type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
const heard: BusMessage[] = [];
let ada: Client;
let teen: Client;

const connect = async (a: Client, b: Client) => {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
};
const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body,
  });

beforeAll(async () => {
  t = await createTestApp();
  t.ctx.bus.subscribe((m) => heard.push(m));
  ada = await signup(t, { displayName: 'Ada Adult', birthDate: '1985-02-03' });
  teen = await signup(t, { displayName: 'Tara Teen', birthDate: '2011-12-31' });
});
afterAll(async () => {
  await t.close();
});

describe('someone under 18 (R29)', () => {
  it('shows nothing to everyone, whatever was saved or asked', async () => {
    // Asked for everyone: saved as connections.
    const saved = await teen.req('PUT', '/v1/me/privacy', {
      fields: { profilePhoto: { kind: 'everyone' }, bio: { kind: 'everyone' } },
      messageRequests: 'everyone',
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().privacy.fields.profilePhoto).toEqual({ kind: 'connections' });
    expect(saved.json().privacy.fields.bio).toEqual({ kind: 'connections' });
    expect(saved.json().privacy.messageRequests).toBe('shared_connections');
    // Stored wider before (an older app, a birthday ahead): read as connections all the same.
    await t.ctx.db
      .updateTable('users')
      .set({
        privacy: JSON.stringify({
          fields: { profilePhoto: { kind: 'everyone' }, onlineStatus: { kind: 'everyone' } },
          messageRequests: 'everyone',
        }),
      })
      .where('id', '=', teen.user.id)
      .execute();
    const { user } = await teen.get('/v1/me');
    expect(user.privacy.fields.profilePhoto).toEqual({ kind: 'connections' });
    expect(user.privacy.fields.onlineStatus).toEqual({ kind: 'connections' });
    expect(user.privacy.messageRequests).toBe('shared_connections');
    expect(user.privacy.discoverByEmail).toBe(false);
  });

  it('reads as nobody to an adult with no tie to them, and as themselves to one with a tie', async () => {
    const stranger = await ada.req('GET', `/v1/people/${teen.user.id}`);
    expect(stranger.statusCode).toBe(404);
    // Another teen may see them; they themselves always.
    const peer = await signup(t, { displayName: 'Pia Peer', birthDate: '2012-03-04' });
    expect((await peer.req('GET', `/v1/people/${teen.user.id}`)).statusCode).toBe(200);
    expect((await teen.req('GET', `/v1/people/${teen.user.id}`)).statusCode).toBe(200);
    // Asked by them: the adult may look at who asked.
    const asking = await signup(t, { displayName: 'Ali Adult', birthDate: '1980-05-06' });
    const r = await teen.post('/v1/connections/requests', { toUserId: asking.user.id });
    expect((await asking.req('GET', `/v1/people/${teen.user.id}`)).statusCode).toBe(200);
    // Connected: of course.
    await asking.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    expect((await asking.req('GET', `/v1/people/${teen.user.id}`)).statusCode).toBe(200);
    // In a group together (the teen's connection made it): a tie too.
    const group = await asking.post('/v1/conversations', {
      kind: 'group',
      title: 'Robotics club',
      memberIds: [teen.user.id],
    });
    const coach = await signup(t, { displayName: 'Cora Coach', birthDate: '1979-07-08' });
    await connect(asking, coach);
    await asking.post(`/v1/conversations/${group.conversation.id}/members`, {
      userIds: [coach.user.id],
    });
    expect((await coach.req('GET', `/v1/people/${teen.user.id}`)).statusCode).toBe(200);
  });

  it('is never connected by an adult stranger’s link, and says why', async () => {
    const link = (await ada.post('/v1/invites', {})).invite.token;
    const refused = await teen.req('POST', `/v1/invites/${link}/accept`);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.message).toBe(
      'Under 18, a link connects you with someone you know through someone. Ask Ada Adult to connect through a person you both know.',
    );
    expect((await teen.get('/v1/connections/requests')).requests).toEqual([]);
    expect((await ada.get('/v1/connections/requests')).requests).toEqual([]);
    // Known through someone: connected as anyone is.
    const mutual = await signup(t, { displayName: 'Mo Mutual', birthDate: '1990-01-01' });
    await connect(mutual, ada);
    const back = await teen.post('/v1/connections/requests', { toUserId: mutual.user.id });
    await mutual.post(`/v1/connections/requests/${back.requestId}/accept`, {});
    const joined = await teen.post(`/v1/invites/${link}/accept`);
    expect(joined.status).toBe('connected');
  });
});

describe('a profile anyone new opens (R49, PRD §32)', () => {
  it('is gone for a suspended account, while those in touch keep what they have', async () => {
    const sid = await signup(t, { displayName: 'Sid Suspended' });
    const newcomer = await signup(t, { displayName: 'Nell Newcomer' });
    await connect(ada, sid);
    expect((await newcomer.req('GET', `/v1/people/${sid.user.id}`)).statusCode).toBe(200);
    await t.ctx.db
      .updateTable('users')
      .set({ suspended_at: new Date() })
      .where('id', '=', sid.user.id)
      .execute();
    expect((await newcomer.req('GET', `/v1/people/${sid.user.id}`)).statusCode).toBe(404);
    expect((await ada.req('GET', `/v1/people/${sid.user.id}`)).statusCode).toBe(200);
  });

  it('is nobody’s for someone found no way they allowed, but theirs to people they’re with', async () => {
    const hidden = await signup(t, { displayName: 'Hal Hidden' });
    await hidden.req('PUT', '/v1/me/privacy', {
      discoverByHandle: false,
      discoverByEmail: false,
      discoverByPhone: false,
    });
    const stranger = await signup(t, { displayName: 'Sol Stranger' });
    expect((await stranger.req('GET', `/v1/people/${hidden.user.id}`)).statusCode).toBe(404);
    // Findable some way (their email, say): opened as that way would find them.
    await hidden.req('PUT', '/v1/me/privacy', { discoverByEmail: true });
    expect((await stranger.req('GET', `/v1/people/${hidden.user.id}`)).statusCode).toBe(200);
    await hidden.req('PUT', '/v1/me/privacy', { discoverByEmail: false });
    // In a group together: they see each other there, so here too.
    const host = await signup(t, { displayName: 'Gil Group' });
    await connect(host, hidden);
    await connect(host, stranger);
    await host.post('/v1/conversations', {
      kind: 'group',
      title: 'Book club',
      memberIds: [hidden.user.id, stranger.user.id],
    });
    expect((await stranger.req('GET', `/v1/people/${hidden.user.id}`)).statusCode).toBe(200);
  });
});

describe('read receipts (R25) and requests (R14)', () => {
  it('a read nobody may see reaches no one, and an unanswered request tells its sender nothing', async () => {
    // Two connections, one of whom shares no read receipts: neither sees the other's reads.
    const pat = await signup(t, { displayName: 'Pat Private' });
    const sam = await signup(t, { displayName: 'Sam Sender' });
    await connect(sam, pat);
    await pat.req('PUT', '/v1/me/privacy', { fields: { readReceipts: { kind: 'nobody' } } });
    const { conversation } = await sam.post('/v1/conversations', {
      kind: 'direct',
      userId: pat.user.id,
    });
    const sent = (await send(sam, conversation.id, 'Lunch on Thursday?')).message;
    // It arrives on Pat's phone: Sam may see that.
    await pat.post(`/v1/conversations/${conversation.id}/receipts`, { delivered: sent.seq });
    await busSettled(t, heard);
    heard.length = 0;
    // Pat reads it: nothing at all reaches Sam, not even an empty event at that moment.
    await pat.post(`/v1/conversations/${conversation.id}/receipts`, { read: sent.seq });
    await busSettled(t, heard);
    const toSam = heard.filter(
      (m) => m.event.type === 'receipts' && m.userIds.includes(sam.user.id),
    );
    expect(toSam).toEqual([]);
    expect(heard.some((m) => m.event.type === 'receipts' && m.userIds.includes(pat.user.id))).toBe(
      true,
    );

    // A stranger's request: neither its arrival nor its reading is told to the stranger.
    const zed = await signup(t, { displayName: 'Zed Stranger' });
    const opened = await zed.post('/v1/conversations', { kind: 'direct', userId: pat.user.id });
    const ask = (await send(zed, opened.conversation.id, 'Hi, are you the Pat from the talk?'))
      .message;
    await busSettled(t, heard);
    heard.length = 0;
    await pat.post(`/v1/conversations/${opened.conversation.id}/receipts`, {
      delivered: ask.seq,
      read: ask.seq,
    });
    await busSettled(t, heard);
    expect(
      heard.filter((m) => m.event.type === 'receipts' && m.userIds.includes(zed.user.id)),
    ).toEqual([]);
    // Nor does the conversation say so when Zed opens it again, and a decline changes nothing.
    const asSeen = async () =>
      (await zed.get(`/v1/conversations/${opened.conversation.id}`)).conversation.participants.find(
        (p: { userId: string }) => p.userId === pat.user.id,
      );
    expect(await asSeen()).toMatchObject({ deliveredSeq: 0, readSeq: null });
    heard.length = 0;
    await pat.post(`/v1/conversations/${opened.conversation.id}/request`, { decision: 'decline' });
    await busSettled(t, heard);
    expect(heard.filter((m) => m.userIds.includes(zed.user.id))).toEqual([]);
    expect(await asSeen()).toMatchObject({ deliveredSeq: 0, readSeq: null });
  });
});
