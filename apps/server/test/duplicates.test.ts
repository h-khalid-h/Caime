import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nameWords, sameness } from '../src/lib/duplicates';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;

async function connect(a: Client, b: Client): Promise<void> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
}
const duplicates = async (c: Client) =>
  ((await c.get('/v1/suggestions?kind=duplicate')).suggestions as any[]) ?? [];
const connections = async (c: Client) => (await c.get('/v1/connections')).connections as any[];
const row = (list: any[], who: Client) => list.find((c) => c.person.id === who.user.id);

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
});
afterAll(async () => {
  await t.close();
});

const seen = (name: string, extra: Partial<Parameters<typeof sameness>[0]> = {}) => ({
  id: name,
  name,
  nickname: null,
  labels: [],
  ...extra,
});

describe('possible duplicates (PRD §51)', () => {
  it('compares names as people write them, and never offers on too little', () => {
    expect(nameWords('  Zoë  O’Brien-Smith ')).toEqual(['zoe', 'o', 'brien', 'smith']);
    expect(sameness(seen('Sarah Smith'), seen('sarah  smith')).confidence).toBe(0.8);
    // One word is many people's name; one name inside another is a hint, not enough.
    expect(sameness(seen('Sam'), seen('Sam')).confidence).toBe(0.5);
    expect(sameness(seen('Sarah'), seen('Sarah Smith')).confidence).toBe(0.4);
    expect(sameness(seen('Sarah Smith'), seen('Sam Smith')).confidence).toBe(0);
    expect(sameness(seen('Smith'), seen('Sarah Smith')).confidence).toBe(0);
    expect(
      sameness(seen('Sarah Smith', { nickname: 'S' }), seen('Sarah Smith', { nickname: 's ' }))
        .confidence,
    ).toBe(1);
    // Known from the same place, it's likely.
    const dataC = [{ sphere: 'work', orgName: 'DATA C' }];
    const both = sameness(seen('Sarah', { labels: dataC }), seen('Sarah Smith', { labels: dataC }));
    expect(both.confidence).toBeCloseTo(0.7);
    expect(both.reasons).toEqual(['one name is part of the other', 'you know both from DATA C']);
    // However each is labelled there; a label with no place isn't a place.
    const client = [{ sphere: 'client', orgName: 'data c ' }];
    expect(
      sameness(seen('Sarah', { labels: dataC }), seen('Sarah Smith', { labels: client })).reasons,
    ).toContain('you know both from DATA C');
    const friends = [{ sphere: 'friend', orgName: null }];
    expect(
      sameness(seen('Sarah', { labels: friends }), seen('Sarah Smith', { labels: friends }))
        .confidence,
    ).toBe(0.4);
    // A place alone says nothing.
    expect(sameness(seen('Ana', { labels: dataC }), seen('Bo', { labels: dataC })).confidence).toBe(
      0,
    );
    expect(
      sameness(seen('Ana', { nickname: 'Mum' }), seen('Angela', { nickname: 'mum' })).reasons,
    ).toEqual(['the same nickname']);
  });

  it('offers it to whoever knows both, from what they can see, and nobody else', async () => {
    const first = await signup(t, { displayName: 'Sarah Smith' });
    const second = await signup(t, { displayName: 'Sarah Smith' });
    const other = await signup(t, { displayName: 'Omar Farouk' });
    await connect(noor, first);
    await connect(noor, other);
    expect(await duplicates(noor)).toEqual([]);
    await connect(second, noor);
    const [s] = await duplicates(noor);
    expect(s).toMatchObject({
      kind: 'duplicate',
      title: 'Sarah Smith may have two accounts',
      subjectUserId: second.user.id,
      payload: { keep: first.user.id, merge: second.user.id },
    });
    expect(s.rationale).toContain('Both have the same name.');
    // One word is many people's name: two Sams aren't offered.
    const sam = await signup(t, { displayName: 'Sam' });
    const sam2 = await signup(t, { displayName: 'Sam' });
    await connect(noor, sam);
    await connect(noor, sam2);
    expect((await duplicates(noor)).map((d) => d.subjectUserId)).toEqual([second.user.id]);
    // The two Sarahs don't know each other; nobody else hears of it.
    expect(await duplicates(first)).toEqual([]);
    expect(await duplicates(second)).toEqual([]);
    expect(await duplicates(other)).toEqual([]);

    // Merged: one row in People, the other under it; both accounts and conversations stay. In
    // Noor's view only: Pia, who knows both too, still sees two until she says otherwise.
    const pia = await signup(t, { displayName: 'Pia Berg' });
    await connect(pia, first);
    await connect(pia, second);
    await noor.post(`/v1/suggestions/${s.id}/accept`, {});
    expect((await connections(pia)).map((c) => c.mergedInto)).toEqual([null, null]);
    const list = await connections(noor);
    expect(row(list, second).mergedInto).toBe(first.user.id);
    expect(row(list, first).also.map((a: any) => a.person.id)).toEqual([second.user.id]);
    expect(row(list, first).also[0].conversationId).toBe(row(list, second).conversationId);
    expect(row(list, second).conversationId).not.toBeNull();
    // Only Noor's own view: Sarah can't undo it, and nothing that isn't merged can be separated.
    const connectionId = row(list, second).connectionId;
    expect(
      (await second.req('POST', `/v1/connections/${connectionId}/separate`, {})).statusCode,
    ).toBe(404);
    expect(row(await connections(noor), second).mergedInto).toBe(first.user.id);
    const kept = row(list, first).connectionId;
    expect((await noor.req('POST', `/v1/connections/${kept}/separate`, {})).statusCode).toBe(404);
    // Not the same after all: separated, and never offered again.
    const separated = await noor.req(
      'POST',
      `/v1/connections/${row(list, second).connectionId}/separate`,
      {},
    );
    expect(separated.statusCode).toBe(200);
    const after = await connections(noor);
    expect(row(after, second).mergedInto).toBeNull();
    expect(row(after, first).also).toEqual([]);
    await noor.patch(`/v1/connections/${row(after, second).connectionId}`, { nickname: 'Sarah' });
    expect(await duplicates(noor)).toEqual([]);
  });

  it('keep separate is remembered; nothing hidden ever links two accounts', async () => {
    const a = await signup(t, { displayName: 'Lina Aziz', email: 'lina@clinic.example' });
    const b = await signup(t, { displayName: 'Dr. L. Aziz', email: 'lina.aziz@clinic.example' });
    await connect(noor, a);
    await connect(noor, b);
    // Same address's domain, different names as shown: nothing to go on that Noor can see.
    expect((await duplicates(noor)).filter((s) => s.subjectUserId === b.user.id)).toEqual([]);
    // Labelled from the same place with the same nickname, it's offered; turned down, it's gone.
    const list = await connections(noor);
    await noor.patch(`/v1/connections/${row(list, a).connectionId}`, { nickname: 'Lina' });
    await noor.patch(`/v1/connections/${row(list, b).connectionId}`, { nickname: 'Lina' });
    const [offer] = (await duplicates(noor)).filter((s) =>
      [a.user.id, b.user.id].includes(s.subjectUserId),
    );
    expect(offer).toBeDefined();
    await noor.post(`/v1/suggestions/${offer.id}/dismiss`, {});
    await noor.patch(`/v1/connections/${row(list, a).connectionId}`, { nickname: 'Lina' });
    expect(
      (await duplicates(noor)).filter((s) => [a.user.id, b.user.id].includes(s.subjectUserId)),
    ).toEqual([]);
  });

  it('never offers someone blocked, and merges into whoever the kept one is merged into', async () => {
    const x = await signup(t, { displayName: 'Kai Short' });
    const y = await signup(t, { displayName: 'Kai Short' });
    const z = await signup(t, { displayName: 'Kai Short' });
    await connect(noor, x);
    await noor.post('/v1/blocks', { userId: x.user.id });
    await connect(noor, y);
    expect((await duplicates(noor)).filter((s) => s.subjectUserId === y.user.id)).toEqual([]);
    await noor.req('DELETE', `/v1/blocks/${x.user.id}`);
    await noor.patch(`/v1/connections/${row(await connections(noor), y).connectionId}`, {
      nickname: 'Kai',
    });
    const [xy] = (await duplicates(noor)).filter((s) =>
      [x.user.id, y.user.id].includes(s.subjectUserId),
    );
    // Z is offered with each of them, while they're still two.
    await connect(noor, z);
    const zs = (await duplicates(noor)).filter((s) => s.subjectUserId === z.user.id);
    expect(zs.map((s) => s.payload.keep).sort()).toEqual([x.user.id, y.user.id].sort());
    // Y merged into X, keeping Y (the other way round from what's offered).
    await noor.post(`/v1/suggestions/${xy.id}/accept`, { keep: y.user.id });
    expect(row(await connections(noor), x).mergedInto).toBe(y.user.id);
    // Z, kept under X: goes under Y, where X is. One person, one row; the other offer goes.
    const zx = zs.find((s) => s.payload.keep === x.user.id);
    await noor.post(`/v1/suggestions/${zx.id}/accept`, { keep: x.user.id });
    const list = await connections(noor);
    expect(row(list, z).mergedInto).toBe(y.user.id);
    expect(row(list, x).mergedInto).toBe(y.user.id);
    expect(
      row(list, y)
        .also.map((a: any) => a.person.id)
        .sort(),
    ).toEqual([x.user.id, z.user.id].sort());
    expect((await duplicates(noor)).filter((s) => s.subjectUserId === z.user.id)).toEqual([]);
    // Only one of the two can be kept.
    const w = await signup(t, { displayName: 'Kai Short' });
    await connect(noor, w);
    const [wz] = (await duplicates(noor)).filter((s) => s.subjectUserId === w.user.id);
    for (const keep of [noor.user.id, x.user.id]) {
      const wrong = await noor.req('POST', `/v1/suggestions/${wz.id}/accept`, { keep });
      expect(wrong.statusCode).toBe(400);
    }
    expect(row(await connections(noor), w).mergedInto).toBeNull();
  });
  it('merging two who are already merged makes one person, never one under itself', async () => {
    const p = await signup(t, { displayName: 'Rae Moss' });
    const q = await signup(t, { displayName: 'Rae Moss' });
    const r = await signup(t, { displayName: 'Rae Moss' });
    await connect(noor, p);
    await connect(noor, q);
    await connect(noor, r);
    const offers = (await duplicates(noor)).filter((s) =>
      [p.user.id, q.user.id, r.user.id].includes(s.subjectUserId),
    );
    const of = (a: Client, b: Client) =>
      offers.find(
        (s) =>
          [s.payload.keep, s.payload.merge].sort().join() === [a.user.id, b.user.id].sort().join(),
      );
    // Q under P; then P, with Q, under R. P and R are one now: that offer goes.
    await noor.post(`/v1/suggestions/${of(p, q).id}/accept`, { keep: p.user.id });
    await noor.post(`/v1/suggestions/${of(q, r).id}/accept`, { keep: r.user.id });
    expect((await duplicates(noor)).map((d) => d.id)).not.toContain(of(p, r).id);
    const again = await noor.req('POST', `/v1/suggestions/${of(p, r).id}/accept`, {
      keep: p.user.id,
    });
    expect(again.statusCode).toBe(404);
    const list = await connections(noor);
    expect(row(list, r).mergedInto).toBeNull();
    expect(row(list, p).mergedInto).toBe(r.user.id);
    expect(row(list, q).mergedInto).toBe(r.user.id);
    expect(
      row(list, r)
        .also.map((a: any) => a.person.id)
        .sort(),
    ).toEqual([p.user.id, q.user.id].sort());
    expect(row(list, p).also).toEqual([]);

    // Labelled on one account, the whole person is in that sphere, and not unclassified.
    await noor.post('/v1/relationships', { userId: q.user.id, sphere: 'friend', role: 'friend' });
    const friends = (await noor.get('/v1/connections?sphere=friend')).connections as any[];
    expect(
      friends
        .filter((c) => [p.user.id, q.user.id, r.user.id].includes(c.person.id))
        .map((c) => c.person.id)
        .sort(),
    ).toEqual([p.user.id, q.user.id, r.user.id].sort());
    const loose = (await noor.get('/v1/connections?sphere=unclassified')).connections as any[];
    expect(loose.filter((c) => [p.user.id, q.user.id, r.user.id].includes(c.person.id))).toEqual(
      [],
    );
    // Found by a search that only one account matches, it stands on its own there.
    await noor.patch(`/v1/connections/${row(list, q).connectionId}`, {
      nickname: 'Rae from climbing',
    });
    const found = (await noor.get('/v1/connections?q=climbing')).connections as any[];
    expect(found.map((c) => [c.person.id, c.mergedInto])).toEqual([[q.user.id, null]]);

    // Another Rae is offered as the one they all are; P separated, Q stays with R.
    const s = await signup(t, { displayName: 'Rae Moss' });
    await connect(noor, s);
    await noor.patch(`/v1/connections/${row(list, p).connectionId}`, { nickname: 'Rae M' });
    const raes = [p, q, r, s].map((c) => c.user.id);
    const offers2 = (await duplicates(noor)).filter(
      (d) => raes.includes(d.payload.keep) || raes.includes(d.payload.merge),
    );
    expect(offers2.map((d) => d.payload)).toEqual([{ keep: r.user.id, merge: s.user.id }]);
    await noor.post(`/v1/connections/${row(list, p).connectionId}/separate`, {});
    const after = await connections(noor);
    expect(row(after, p)).toMatchObject({ mergedInto: null, also: [] });
    expect(row(after, r).also.map((a: any) => a.person.id)).toEqual([q.user.id]);
  });

  it('once the one kept under is gone, the other stands on its own again', async () => {
    const u1 = await signup(t, { displayName: 'Mia Stone' });
    const u2 = await signup(t, { displayName: 'Mia Stone' });
    await connect(noor, u1);
    await connect(noor, u2);
    const [d] = (await duplicates(noor)).filter((x) => x.subjectUserId === u2.user.id);
    await noor.post(`/v1/suggestions/${d.id}/accept`, {});
    await noor.req('DELETE', `/v1/connections/${row(await connections(noor), u1).connectionId}`);
    expect(row(await connections(noor), u2)).toMatchObject({ mergedInto: null, also: [] });
    const u3 = await signup(t, { displayName: 'Mia Stone' });
    await connect(noor, u3);
    const offers = (await duplicates(noor)).filter((x) => x.subjectUserId === u3.user.id);
    expect(offers.map((x) => x.payload)).toEqual([{ keep: u2.user.id, merge: u3.user.id }]);
    // Merged under the one still here, it isn't left under the one who's gone.
    await noor.post(`/v1/suggestions/${offers[0].id}/accept`, { keep: u2.user.id });
    const list = await connections(noor);
    expect(row(list, u2)).toMatchObject({ mergedInto: null });
    expect(row(list, u2).also.map((a: any) => a.person.id)).toEqual([u3.user.id]);
  });

  it('never goes round in a circle, whatever is stored', async () => {
    const a = await signup(t, { displayName: 'Ivo Lind' });
    const b = await signup(t, { displayName: 'Ivo Lind' });
    await connect(noor, a);
    await connect(noor, b);
    const pairs: Array<[Client, Client]> = [
      [a, b],
      [b, a],
    ];
    for (const [one, other] of pairs)
      await t.ctx.db
        .updateTable('connection_sides')
        .set({ merged_into: other.user.id })
        .where('owner_id', '=', noor.user.id)
        .where('other_id', '=', one.user.id)
        .execute();
    const list = await connections(noor);
    // Neither is under the other: both stay in People.
    expect([row(list, a), row(list, b)].map((c) => [c.mergedInto, c.also])).toEqual([
      [null, []],
      [null, []],
    ]);
  });
});
