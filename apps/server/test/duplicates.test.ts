import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nameWords, sameness } from '../src/lib/duplicates';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;

/** Connected, each labelling the other as a colleague at the same place: a name and a place. */
async function connect(a: Client, b: Client): Promise<void> {
  const relationship = { sphere: 'work', role: 'colleague', orgName: 'Same Co' };
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id, relationship });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, { relationship });
}
/** Connected with no label on either side: a name alone. */
async function connectPlain(a: Client, b: Client): Promise<void> {
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
    // Two words are many people's name too: a hint short of an offer (OFFER_AT is 0.65).
    expect(sameness(seen('Sarah Smith'), seen('sarah  smith')).confidence).toBe(0.6);
    expect(sameness(seen('Sarah Jane Smith'), seen('Sarah Jane Smith')).confidence).toBe(0.7);
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
    // Other scripts' marks belong to their letters: one first name is one word, and a vowel
    // sign makes another name.
    for (const one of ['प्रिया', 'राहुल', 'அருண்', 'محمّد', 'ごとう', '민준'])
      expect(nameWords(one)).toHaveLength(1);
    expect(sameness(seen('राहुल'), seen('राहुल')).confidence).toBe(0.5);
    expect(sameness(seen('प्रिया'), seen('प्रिय')).confidence).toBe(0);
    expect(sameness(seen('प्रिया शर्मा'), seen('प्रिया शर्मा')).confidence).toBe(0.6);
  });

  it('offers it to whoever knows both, from what they can see, and nobody else', async () => {
    const first = await signup(t, { displayName: 'Sarah Smith' });
    const second = await signup(t, { displayName: 'Sarah Smith' });
    const other = await signup(t, { displayName: 'Omar Farouk' });
    await connectPlain(noor, first);
    await connectPlain(noor, other);
    expect(await duplicates(noor)).toEqual([]);
    await connectPlain(second, noor);
    // Two words of a name alone aren't an offer: a second sign, a place they share, is.
    expect(await duplicates(noor)).toEqual([]);
    for (const who of [first, second])
      await noor.post('/v1/relationships', {
        userId: who.user.id,
        sphere: 'work',
        role: 'colleague',
        orgName: 'DATA C',
      });
    const [s] = await duplicates(noor);
    expect(s).toMatchObject({
      kind: 'duplicate',
      title: 'Sarah Smith may have two accounts',
      subjectUserId: second.user.id,
      payload: { keep: first.user.id, merge: second.user.id },
    });
    expect(s.rationale).toContain('Both have the same name, and you know both from DATA C.');
    // One word is many people's name: two Sams aren't offered.
    const sam = await signup(t, { displayName: 'Sam' });
    const sam2 = await signup(t, { displayName: 'Sam' });
    await connectPlain(noor, sam);
    await connectPlain(noor, sam2);
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
    // The pair alone: what Noor's choices taught about duplicates rides on the payload too (M11).
    expect(offers2.map((d) => ({ keep: d.payload.keep, merge: d.payload.merge }))).toEqual([
      { keep: r.user.id, merge: s.user.id },
    ]);
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
    expect(offers.map((x) => ({ keep: x.payload.keep, merge: x.payload.merge }))).toEqual([
      { keep: u2.user.id, merge: u3.user.id },
    ]);
    // Merged under the one still here, it isn't left under the one who's gone.
    await noor.post(`/v1/suggestions/${offers[0].id}/accept`, { keep: u2.user.id });
    const list = await connections(noor);
    expect(row(list, u2)).toMatchObject({ mergedInto: null });
    expect(row(list, u2).also.map((a: any) => a.person.id)).toEqual([u3.user.id]);
  });

  it('an account merged into another is looked at as well: a new one like it is offered as that person', async () => {
    const old = await signup(t, { displayName: 'S. Weller' });
    const now = await signup(t, { displayName: 'Sarah Weller' });
    await connect(noor, old);
    await connect(noor, now);
    const list = await connections(noor);
    for (const c of [old, now])
      await noor.patch(`/v1/connections/${row(list, c).connectionId}`, { nickname: 'Sarah W' });
    const [pair] = (await duplicates(noor)).filter((d) => d.subjectUserId === now.user.id);
    await noor.post(`/v1/suggestions/${pair.id}/accept`, { keep: old.user.id });
    const third = await signup(t, { displayName: 'Sarah Weller' });
    await connect(noor, third);
    const offers = (await duplicates(noor)).filter((d) => d.subjectUserId === third.user.id);
    expect(offers.map((d) => ({ keep: d.payload.keep, merge: d.payload.merge }))).toEqual([
      { keep: old.user.id, merge: third.user.id },
    ]);
    expect(offers[0].rationale).toContain('the same name');
  });

  it('losing the account the others are shown under never splits the person', async () => {
    const r = await signup(t, { displayName: 'Tess Hale' });
    const a = await signup(t, { displayName: 'Tess Hale' });
    const b = await signup(t, { displayName: 'Tess Hale' });
    for (const c of [r, a, b]) await connect(noor, c);
    const offers = (await duplicates(noor)).filter((d) =>
      [a.user.id, b.user.id].includes(d.subjectUserId),
    );
    const of = (x: Client, y: Client) =>
      offers.find(
        (d) =>
          [d.payload.keep, d.payload.merge].sort().join() === [x.user.id, y.user.id].sort().join(),
      );
    const ab = of(a, b);
    await noor.post(`/v1/suggestions/${of(r, a).id}/accept`, { keep: r.user.id });
    await noor.post(`/v1/suggestions/${of(r, b).id}/accept`, { keep: r.user.id });
    // The pair already one person is gone, not spent: it can be asked again if they're apart.
    expect(
      await t.ctx.db.selectFrom('suggestions').select('id').where('id', '=', ab.id).execute(),
    ).toEqual([]);
    // R deletes the account: A and B are still one person, under the one known longer.
    expect(
      (await r.req('DELETE', '/v1/me', { password: 'correct horse battery' })).statusCode,
    ).toBe(200);
    let list = await connections(noor);
    expect(row(list, a)).toMatchObject({ mergedInto: null });
    expect(row(list, a).also.map((x: any) => x.person.id)).toEqual([b.user.id]);
    expect(row(list, b).mergedInto).toBe(a.user.id);
    // And when the one they're under is disconnected, the other takes its place.
    const c = await signup(t, { displayName: 'Tess Hale' });
    await connect(noor, c);
    const [bc] = (await duplicates(noor)).filter((d) => d.subjectUserId === c.user.id);
    await noor.post(`/v1/suggestions/${bc.id}/accept`, { keep: a.user.id });
    await noor.req('DELETE', `/v1/connections/${row(await connections(noor), a).connectionId}`);
    list = await connections(noor);
    expect(row(list, b)).toMatchObject({ mergedInto: null });
    expect(row(list, b).also.map((x: any) => x.person.id)).toEqual([c.user.id]);
  });

  it('an offer goes when either blocks the other, and a blocked one is never merged', async () => {
    const one = await signup(t, { displayName: 'Uma Vale' });
    const two = await signup(t, { displayName: 'Uma Vale' });
    await connect(noor, one);
    await connect(noor, two);
    const [offer] = (await duplicates(noor)).filter((d) => d.subjectUserId === two.user.id);
    expect(offer).toBeDefined();
    await two.post('/v1/blocks', { userId: noor.user.id });
    expect((await duplicates(noor)).filter((d) => d.subjectUserId === two.user.id)).toEqual([]);
    const late = await noor.req('POST', `/v1/suggestions/${offer.id}/accept`, {});
    expect(late.statusCode).toBeGreaterThanOrEqual(400);
    expect(row(await connections(noor), two)?.mergedInto ?? null).toBeNull();
    // An offer still standing, accepted after a block: refused.
    await two.req('DELETE', `/v1/blocks/${noor.user.id}`);
    await noor.patch(`/v1/connections/${row(await connections(noor), two).connectionId}`, {
      nickname: 'Uma',
    });
    const [again] = (await duplicates(noor)).filter((d) =>
      [one.user.id, two.user.id].includes(d.subjectUserId),
    );
    expect(again).toBeDefined();
    await t.ctx.db
      .insertInto('blocks')
      .values({ blocker_id: noor.user.id, blocked_id: two.user.id })
      .execute();
    const refused = await noor.req('POST', `/v1/suggestions/${again.id}/accept`, {});
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error.message).toBe('One of them is blocked: it can’t be merged.');
  });

  it('whoever has more than a thousand connections is still offered one', async () => {
    const lots = await signup(t, { displayName: 'Lots Of Friends' });
    await sql`
      with made as (
        insert into users (id, email, handle, password_hash, display_name, privacy, birth_date)
        select gen_random_uuid(), 'bulk' || g || '@example.com', 'bulk' || g, 'x', 'Person ' || g, '{}', '1990-12-31'
          from generate_series(1, 1001) g
        returning id
      ), linked as (
        insert into connections (id, user_a, user_b)
        select gen_random_uuid(), least(${lots.user.id}::uuid, id), greatest(${lots.user.id}::uuid, id)
          from made
        returning id, user_a, user_b
      )
      insert into connection_sides (connection_id, owner_id, other_id, created_at)
      select id, ${lots.user.id}::uuid,
          case when user_a = ${lots.user.id}::uuid then user_b else user_a end,
          now() - interval '1 day'
        from linked`.execute(t.ctx.db);
    const first = await signup(t, { displayName: 'Vera Quinn' });
    const second = await signup(t, { displayName: 'Vera Quinn' });
    await connect(lots, first);
    await connect(lots, second);
    const offers = await duplicates(lots);
    expect(offers.map((d) => d.payload)).toEqual([{ keep: first.user.id, merge: second.user.id }]);
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
