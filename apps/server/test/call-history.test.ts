import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sweepCalls } from '../src/lib/calls';
import { sweepGroupCalls } from '../src/lib/group-calls';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let omar: Client;
let zed: Client;
let noorSam: string;
let trip: string;

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}
const history = async (c: Client, query = '') => (await c.get(`/v1/calls/history${query}`)) as any;
/** Each call as it went for them: direction, result and who with, by first name. */
const read = (calls: any[]) =>
  calls.map((c) => [
    c.group ? 'group' : '1:1',
    c.direction,
    c.result,
    c.with
      .map((p: any) => p.displayName.split(' ')[0])
      .sort()
      .join(','),
  ]);
const call = (c: Client, conversationId: string, kind = 'voice') =>
  c.post(`/v1/conversations/${conversationId}/calls`, { kind, deviceId: 'dev-tab-0001' });
const groupCall = (c: Client, kind = 'video') =>
  c.post(`/v1/conversations/${trip}/group-calls`, { kind, deviceId: 'dev-tab-0001' });

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  zed = await signup(t, { displayName: 'Zed Stranger' });
  noorSam = await connect(noor, sam);
  await connect(noor, omar);
  trip = (
    await noor.post('/v1/conversations', {
      kind: 'group',
      title: 'Trip',
      memberIds: [sam.user.id, omar.user.id],
    })
  ).conversation.id;

  // Answered, four minutes.
  const answered = (await call(noor, noorSam)).call.id;
  await sam.post(`/v1/calls/${answered}/accept`, { deviceId: 'dev-sam-0001' });
  t.clock.advance(240_000);
  await noor.post(`/v1/calls/${answered}/end`, {});
  // Turned down.
  t.clock.advance(1000);
  const declined = (await call(noor, noorSam)).call.id;
  await sam.post(`/v1/calls/${declined}/decline`, {});
  // Nobody answered.
  t.clock.advance(1000);
  await call(noor, noorSam);
  t.clock.advance(46_000);
  await sweepCalls(t.ctx);
  // Called off.
  const cancelled = (await call(sam, noorSam, 'video')).call.id;
  await sam.post(`/v1/calls/${cancelled}/end`, {});
  // A group call Noor and Sam were in, and Omar missed.
  t.clock.advance(1000);
  const group = (await groupCall(noor)).call.id;
  await sam.post(`/v1/group-calls/${group}/join`, { deviceId: 'dev-sam-0001' });
  t.clock.advance(60_000);
  await noor.post(`/v1/group-calls/${group}/alive`, { deviceId: 'dev-tab-0001' });
  await sam.post(`/v1/group-calls/${group}/alive`, { deviceId: 'dev-sam-0001' });
  await sam.post(`/v1/group-calls/${group}/leave`, { deviceId: 'dev-sam-0001' });
  // A group call nobody else joined.
  t.clock.advance(1000);
  const alone = (await groupCall(noor, 'voice')).call.id;
  await noor.post(`/v1/group-calls/${alone}/leave`, { deviceId: 'dev-tab-0001' });
  await sweepGroupCalls(t.ctx);
});
afterAll(async () => {
  await t.close();
});

describe('call history (PRD §47)', () => {
  it('each call, newest first, as it went for whoever asks', async () => {
    expect(read((await history(noor)).calls)).toEqual([
      // Nobody else joined: not who it rang, which would say who it didn't.
      ['group', 'outgoing', 'cancelled', ''],
      ['group', 'outgoing', 'answered', 'Sam'],
      ['1:1', 'incoming', 'missed', 'Sam'],
      ['1:1', 'outgoing', 'unanswered', 'Sam'],
      ['1:1', 'outgoing', 'unanswered', 'Sam'],
      ['1:1', 'outgoing', 'answered', 'Sam'],
    ]);
    // Sam turned one down; Noor, who called, only hears it went unanswered.
    expect(read((await history(sam)).calls)).toEqual([
      ['group', 'incoming', 'missed', 'Noor'],
      ['group', 'incoming', 'answered', 'Noor'],
      ['1:1', 'outgoing', 'cancelled', 'Noor'],
      ['1:1', 'incoming', 'missed', 'Noor'],
      ['1:1', 'incoming', 'declined', 'Noor'],
      ['1:1', 'incoming', 'answered', 'Noor'],
    ]);
    expect(read((await history(omar)).calls)).toEqual([
      ['group', 'incoming', 'missed', 'Noor'],
      ['group', 'incoming', 'missed', 'Noor,Sam'],
    ]);
    // Nobody else's calls, ever.
    expect((await history(zed)).calls).toEqual([]);
  });

  it('says how long, where, and in which conversation', async () => {
    const [alone, group, , , , answered] = (await history(noor)).calls;
    expect(answered).toMatchObject({
      conversationId: noorSam,
      conversationTitle: null,
      kind: 'voice',
      group: false,
      seconds: 240,
    });
    expect(group).toMatchObject({
      conversationId: trip,
      conversationTitle: 'Trip',
      kind: 'video',
      group: true,
      seconds: 60,
    });
    expect(alone).toMatchObject({ kind: 'voice', seconds: 0 });
    expect(answered.with[0]).toMatchObject({ id: sam.user.id, displayName: 'Sam Rivera' });
  });

  it('a page at a time', async () => {
    const all = (await history(noor)).calls.map((c: any) => c.id);
    const first = await history(noor, '?limit=4');
    expect(first.calls.map((c: any) => c.id)).toEqual(all.slice(0, 4));
    const second = await history(noor, `?limit=4&before=${first.nextBefore}`);
    expect(second.calls.map((c: any) => c.id)).toEqual(all.slice(4));
    expect(second.nextBefore).toBeNull();
  });

  it('with one person, or only the ones missed', async () => {
    expect(read((await history(omar, `?with=${sam.user.id}`)).calls)).toEqual([
      ['group', 'incoming', 'missed', 'Noor,Sam'],
    ]);
    expect(read((await history(sam, `?with=${omar.user.id}`)).calls)).toEqual([]);
    expect(read((await history(sam, '?missed=1')).calls)).toEqual([
      ['group', 'incoming', 'missed', 'Noor'],
      ['1:1', 'incoming', 'missed', 'Noor'],
    ]);
    expect((await sam.req('GET', '/v1/calls/history?limit=500')).statusCode).toBe(400);
  });

  it('names each person as they show themselves to whoever asks', async () => {
    const identity = (
      await sam.post('/v1/me/identities', { kind: 'professional', displayName: 'Dr. S. Rivera' })
    ).id;
    const side = await t.ctx.db
      .selectFrom('connection_sides')
      .select('connection_id')
      .where('owner_id', '=', sam.user.id)
      .where('other_id', '=', noor.user.id)
      .executeTakeFirstOrThrow();
    await sam.patch(`/v1/connections/${side.connection_id}`, { identityId: identity });
    const [, group] = (await history(noor)).calls;
    expect(group.with.map((p: any) => p.displayName)).toEqual(['Dr. S. Rivera']);
    // Omar, who knows him by his own name, sees that.
    const [, missed] = (await history(omar)).calls;
    expect(missed.with.map((p: any) => p.displayName).sort()).toEqual([
      'Noor Haddad',
      'Sam Rivera',
    ]);
    await sam.patch(`/v1/connections/${side.connection_id}`, { identityId: null });
  });

  it('only calls that are over', async () => {
    const live = (await call(noor, noorSam)).call.id;
    expect((await history(noor)).calls.map((c: any) => c.id)).not.toContain(live);
    await noor.post(`/v1/calls/${live}/end`, {});
    expect((await history(noor)).calls[0]).toMatchObject({ id: live, result: 'cancelled' });
  });
});
