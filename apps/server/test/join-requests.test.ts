/**
 * Ask to join (M16 C3h, review 2026-10-17 §1 H5's optional half, R97 (3)): a join link may have
 * whoever opens it ask, and the place's owner or an admin let each person in, or not. A link that
 * asks lets nobody in by itself, so it may stand where someone under 18 is, and someone under 18
 * may ask through one where the place is run for them by someone they may trust (R98 (3)): its
 * organization is verified, or its owner is an adult they're connected with. Whoever answers is an
 * adult who runs it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KEPT_DAYS, sweepRecords } from '../src/lib/retention';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let omar: Client;
let lina: Client;
let club: string;
const DAY = 86_400_000;

const tokenOf = (url: string) => url.split('/g/')[1] ?? '';
const group = async (owner: Client, title: string, memberIds: string[] = []) =>
  (await owner.post('/v1/conversations', { kind: 'group', title, memberIds })).conversation
    .id as string;
const linkTo = async (who: Client, path: string, approval: boolean) => {
  const made = await who.post(`${path}/join-links`, { approval });
  return { ...made, token: tokenOf(made.url) } as {
    link: { id: string; approval: boolean };
    url: string;
    token: string;
  };
};
const connect = async (a: Client, b: Client) => {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
};
const inIt = async (conversationId: string) =>
  (
    await t.ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', conversationId)
      .where('left_at', 'is', null)
      .execute()
  ).map((p) => p.user_id);
const asksOf = async (userId: string) =>
  t.ctx.db
    .selectFrom('join_requests')
    .select(['id', 'outcome', 'decided_by'])
    .where('user_id', '=', userId)
    .orderBy('created_at')
    .execute();
const told = async (userId: string) =>
  t.ctx.db
    .selectFrom('notifications')
    .select(['title', 'data'])
    .where('user_id', '=', userId)
    .where('kind', '=', 'join_request')
    .execute();

beforeAll(async () => {
  t = await createTestApp({ PUBLIC_URL: 'https://caime.example' });
  t.clock.set(new Date().toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad', handle: 'noor' });
  omar = await signup(t, { displayName: 'Omar Farouk', handle: 'omar' });
  lina = await signup(t, { displayName: 'Lina Stranger', handle: 'lina' });
  await connect(noor, omar);
  club = await group(noor, 'Book club', [omar.user.id]);
});
afterAll(async () => {
  await t.close();
});

describe('a link that asks', () => {
  let token: string;
  let ask: string;

  it('is made by whoever runs the place, and says so', async () => {
    const made = await linkTo(noor, `/v1/conversations/${club}`, true);
    expect(made.link.approval).toBe(true);
    token = made.token;
    const { links } = await noor.get(`/v1/conversations/${club}/join-links`);
    expect(links.find((l: { id: string }) => l.id === made.link.id).approval).toBe(true);
    // Opened, it says it asks, and that nobody has asked yet.
    const { link } = await lina.get(`/v1/join-links/${token}`);
    expect(link).toMatchObject({ approval: true, asked: null, member: false, name: 'Book club' });
  });

  it('takes an ask rather than letting them in, and tells whoever runs it once', async () => {
    const first = await lina.post(`/v1/join-links/${token}/accept`);
    expect(first).toEqual({ asked: true, state: 'pending' });
    expect(await inIt(club)).not.toContain(lina.user.id);
    // Twice is once, and the owner is told once.
    expect(await lina.post(`/v1/join-links/${token}/accept`)).toEqual({
      asked: true,
      state: 'pending',
    });
    expect(await asksOf(lina.user.id)).toHaveLength(1);
    const notes = await told(noor.user.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe('Lina Stranger asks to join “Book club”');
    expect(notes[0]?.data).toMatchObject({ conversationId: club });
    expect((await lina.get(`/v1/join-links/${token}`)).link.asked).toBe('pending');
    expect(t.ctx.metrics.joinLinks.get({ target: 'group', outcome: 'asked' })).toBe(1);
  });

  it('is answered only by whoever runs the place', async () => {
    // Omar is in it, but doesn't run it; Lina is nobody to it.
    expect((await omar.req('GET', `/v1/conversations/${club}/join-requests`)).statusCode).toBe(403);
    expect((await lina.req('GET', `/v1/conversations/${club}/join-requests`)).statusCode).toBe(404);
    const { requests } = await noor.get(`/v1/conversations/${club}/join-requests`);
    expect(requests).toHaveLength(1);
    expect(requests[0].person).toMatchObject({ id: lina.user.id, displayName: 'Lina Stranger' });
    ask = requests[0].id;
    expect(
      (await omar.req('POST', `/v1/conversations/${club}/join-requests/${ask}/accept`)).statusCode,
    ).toBe(403);
  });

  it('lets them in once accepted, reading what was said before, and tells them', async () => {
    // Two answers at once: one lets them in, the other finds nothing waiting.
    const [a, b] = await Promise.all([
      noor.req('POST', `/v1/conversations/${club}/join-requests/${ask}/accept`),
      noor.req('POST', `/v1/conversations/${club}/join-requests/${ask}/accept`),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 404]);
    expect(await inIt(club)).toContain(lina.user.id);
    expect(await asksOf(lina.user.id)).toEqual([
      expect.objectContaining({ outcome: 'accepted', decided_by: noor.user.id }),
    ]);
    const notes = await told(lina.user.id);
    expect(notes.map((n) => n.title)).toEqual(['You’re in “Book club”']);
    expect(notes[0]?.data).toMatchObject({ conversationId: club });
    // Nobody waits any more, and the link reads as one they're in through.
    expect((await noor.get(`/v1/conversations/${club}/join-requests`)).requests).toEqual([]);
    expect((await lina.get(`/v1/join-links/${token}`)).link.member).toBe(true);
    expect(t.ctx.metrics.joinLinks.get({ target: 'group', outcome: 'joined' })).toBe(1);
  });

  it('declined: not let in, not told by a notice, and not asking again through that link', async () => {
    const rae = await signup(t, { displayName: 'Rae Asker' });
    expect(await rae.post(`/v1/join-links/${token}/accept`)).toEqual({
      asked: true,
      state: 'pending',
    });
    const [waiting] = (await noor.get(`/v1/conversations/${club}/join-requests`)).requests;
    await noor.post(`/v1/conversations/${club}/join-requests/${waiting.id}/decline`);
    expect(await inIt(club)).not.toContain(rae.user.id);
    expect(await told(rae.user.id)).toEqual([]);
    expect((await rae.get(`/v1/join-links/${token}`)).link.asked).toBe('declined');
    expect(await rae.post(`/v1/join-links/${token}/accept`)).toEqual({
      asked: true,
      state: 'declined',
    });
    expect(await asksOf(rae.user.id)).toHaveLength(1);
    // A new link is a new ask.
    const fresh = await linkTo(noor, `/v1/conversations/${club}`, true);
    expect(await rae.post(`/v1/join-links/${fresh.token}/accept`)).toEqual({
      asked: true,
      state: 'pending',
    });
  });

  it('is taken back by whoever asked, while it waits', async () => {
    const sam = await signup(t, { displayName: 'Sam Unsure' });
    await sam.post(`/v1/join-links/${token}/accept`);
    await sam.del(`/v1/join-links/${token}/ask`);
    expect((await sam.get(`/v1/join-links/${token}`)).link.asked).toBeNull();
    expect(await asksOf(sam.user.id)).toEqual([expect.objectContaining({ outcome: 'withdrawn' })]);
    expect((await sam.req('DELETE', `/v1/join-links/${token}/ask`)).statusCode).toBe(404);
    const { requests } = await noor.get(`/v1/conversations/${club}/join-requests`);
    expect(requests.map((r: { person: { id: string } }) => r.person.id)).not.toContain(sam.user.id);
  });
});

describe('a block', () => {
  it('keeps someone out who asked, whichever way it goes', async () => {
    const link = await linkTo(noor, `/v1/conversations/${club}`, true);
    const bo = await signup(t, { displayName: 'Bo Asker' });
    await bo.post(`/v1/join-links/${link.token}/accept`);
    const waiting = (await noor.get(`/v1/conversations/${club}/join-requests`)).requests.find(
      (r: { person: { id: string } }) => r.person.id === bo.user.id,
    );
    // Asked, then blocked whoever runs it: nobody lets them in past it.
    await bo.post('/v1/blocks', { userId: noor.user.id });
    const r = await noor.req(
      'POST',
      `/v1/conversations/${club}/join-requests/${waiting.id}/accept`,
    );
    expect(r.statusCode).toBe(403);
    expect(r.json().error.message).toBe('This link can’t add them to it.');
    expect(await inIt(club)).not.toContain(bo.user.id);
  });
});

describe('under 18 (R29, R97 (3), R98 (3))', () => {
  it('a place with someone under 18 takes a link that asks, never one that lets people in', async () => {
    const tia = await signup(t, { displayName: 'Tia Teen', birthDate: '2012-05-01' });
    await connect(tia, noor);
    const family = await group(noor, 'Family', [tia.user.id]);
    const open = await noor.req('POST', `/v1/conversations/${family}/join-links`, {
      approval: false,
    });
    expect(open.statusCode).toBe(403);
    expect(open.json().error.message).toBe('Join links aren’t available here.');
    const asks = await noor.req('POST', `/v1/conversations/${family}/join-links`, {
      approval: true,
    });
    expect(asks.statusCode).toBe(201);
  });

  it('someone under 18 asks only where an adult connection of theirs runs the place', async () => {
    const kai = await signup(t, { displayName: 'Kai Teen', birthDate: '2012-03-01' });
    // Lina is a stranger to Kai: her link that asks refuses them, in the words for everyone.
    const linas = await group(lina, 'Lina’s circle');
    const strangers = await linkTo(lina, `/v1/conversations/${linas}`, true);
    const refused = await kai.req('POST', `/v1/join-links/${strangers.token}/accept`);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.message).toBe(
      'Join links are for people 18 or over: ask someone in it to add you.',
    );
    expect(await asksOf(kai.user.id)).toEqual([]);
    // Noor is Kai's connection: Kai asks, and Noor lets Kai in.
    await connect(kai, noor);
    const study = await group(noor, 'Study group', [omar.user.id]);
    const noors = await linkTo(noor, `/v1/conversations/${study}`, true);
    expect(await kai.post(`/v1/join-links/${noors.token}/accept`)).toEqual({
      asked: true,
      state: 'pending',
    });
    const [waiting] = (await noor.get(`/v1/conversations/${study}/join-requests`)).requests;
    await noor.post(`/v1/conversations/${study}/join-requests/${waiting.id}/accept`);
    expect(await inIt(study)).toContain(kai.user.id);
  });

  it('a link that lets people in, open beside it, still keeps them out', async () => {
    const ivy = await signup(t, { displayName: 'Ivy Teen', birthDate: '2012-02-01' });
    await connect(ivy, noor);
    const games = await group(noor, 'Games', [omar.user.id]);
    await linkTo(noor, `/v1/conversations/${games}`, false);
    const asks = await linkTo(noor, `/v1/conversations/${games}`, true);
    await ivy.post(`/v1/join-links/${asks.token}/accept`);
    const [waiting] = (await noor.get(`/v1/conversations/${games}/join-requests`)).requests;
    const r = await noor.req(
      'POST',
      `/v1/conversations/${games}/join-requests/${waiting.id}/accept`,
    );
    expect(r.statusCode).toBe(403);
    expect(r.json().error.message).toBe('They can’t join while a link to it is open.');
    expect(await inIt(games)).not.toContain(ivy.user.id);
  });

  it('someone under 18 asks into a verified organization’s space, whoever its owner is', async () => {
    const { org } = await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile School',
      handle: 'nileschool',
      kind: 'business',
    });
    await t.ctx.db
      .updateTable('organizations')
      .set({ domain: 'nileschool.example', verified_at: new Date() })
      .where('id', '=', org.id)
      .execute();
    const { space } = await noor.post('/v1/spaces', {
      name: 'Year 9',
      kind: 'team',
      orgId: org.id,
    });
    const link = await linkTo(noor, `/v1/spaces/${space.id}`, true);
    // A stranger to Noor, under 18: the verified organization runs it for them.
    const zoe = await signup(t, { displayName: 'Zoe Pupil', birthDate: '2011-09-01' });
    expect(await zoe.post(`/v1/join-links/${link.token}/accept`)).toEqual({
      asked: true,
      state: 'pending',
    });
    const [waiting] = (await noor.get(`/v1/spaces/${space.id}/join-requests`)).requests;
    await noor.post(`/v1/spaces/${space.id}/join-requests/${waiting.id}/accept`);
    const members = await t.ctx.db
      .selectFrom('space_members')
      .select('user_id')
      .where('space_id', '=', space.id)
      .where('left_at', 'is', null)
      .execute();
    expect(members.map((m) => m.user_id)).toContain(zoe.user.id);
  });

  it('is answered by an adult: an admin under 18 can’t let anyone in', async () => {
    const teo = await signup(t, { displayName: 'Teo Teen', birthDate: '2012-06-01' });
    await connect(teo, noor);
    const crew = await group(noor, 'Crew', [teo.user.id]);
    await t.ctx.db
      .updateTable('participants')
      .set({ role: 'admin' })
      .where('conversation_id', '=', crew)
      .where('user_id', '=', teo.user.id)
      .execute();
    const link = await linkTo(noor, `/v1/conversations/${crew}`, true);
    const ben = await signup(t, { displayName: 'Ben Grown' });
    await ben.post(`/v1/join-links/${link.token}/accept`);
    const [waiting] = (await noor.get(`/v1/conversations/${crew}/join-requests`)).requests;
    const r = await teo.req('POST', `/v1/conversations/${crew}/join-requests/${waiting.id}/accept`);
    expect(r.statusCode).toBe(403);
    expect(r.json().error.message).toBe('Asks to join are answered by people 18 or over.');
  });
});

describe('what is kept of an ask', () => {
  it('is in the asker’s export, never who answered', async () => {
    const exported = await lina.get('/v1/me/export');
    expect(exported.joinRequests).toEqual([
      expect.objectContaining({ to: 'group', outcome: 'accepted', decidedAt: expect.any(String) }),
    ]);
    expect(JSON.stringify(exported.joinRequests)).not.toContain(noor.user.id);
  });

  it('goes once answered and kept as long as a spent link; one still waiting stays', async () => {
    const waiting = await signup(t, { displayName: 'Wes Waiting' });
    const link = await linkTo(noor, `/v1/conversations/${club}`, true);
    await waiting.post(`/v1/join-links/${link.token}/accept`);
    t.clock.set(new Date(Date.now() + (KEPT_DAYS.spentInvites + 1) * DAY).toISOString());
    await sweepRecords(t.ctx);
    expect(await asksOf(lina.user.id)).toEqual([]);
    expect(await asksOf(waiting.user.id)).toEqual([expect.objectContaining({ outcome: null })]);
  });
});
