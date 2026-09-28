import { readFileSync } from 'node:fs';
import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let ana: Client;
let ben: Client;
let withBen: string;

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}

const send = (c: Client, convo: string, body: string) =>
  c.post(`/v1/conversations/${convo}/messages`, { clientId: uuidv4(), body });

const offers = async (c: Client, about: Client) => {
  await t.ctx.flush();
  return (await c.get(`/v1/suggestions?kind=relationship&subjectUserId=${about.user.id}`))
    .suggestions as any[];
};

beforeAll(async () => {
  t = await createTestApp();
  ana = await signup(t, { displayName: 'Ana Profile', email: 'ana@gmail.com' });
  ben = await signup(t, { displayName: 'Ben Profile', email: 'ben@yahoo.com' });
  withBen = await connect(ana, ben);
});
afterAll(async () => {
  await t.close();
});

describe('who someone is to you (PRD §67, §71)', () => {
  it('says what you talk about, how often, who owes an answer, and what they see of you', async () => {
    const empty = (await ana.get(`/v1/people/${ben.user.id}`)).summary;
    expect(empty).toMatchObject({
      rhythm: null,
      lastTalkedAt: null,
      theirAsks: 0,
      myAsks: 0,
      contexts: [],
      privacy: 'standard',
    });
    await send(ana, withBen, 'The venue is booked.');
    await send(ben, withBen, 'Can you send me the deck by Friday?');
    await send(ben, withBen, 'Could you also check the budget?');
    const asked = (await ana.get(`/v1/people/${ben.user.id}`)).summary;
    expect(asked).toMatchObject({ rhythm: 'rarely', theirAsks: 2, myAsks: 0 });
    expect(asked.lastTalkedAt).not.toBeNull();
    // From Ben's side the same conversation reads the other way round.
    expect((await ben.get(`/v1/people/${ana.user.id}`)).summary).toMatchObject({
      theirAsks: 0,
      myAsks: 2,
    });
    // Answering clears what was asked.
    await send(ana, withBen, 'Sending both now.');
    expect((await ana.get(`/v1/people/${ben.user.id}`)).summary.theirAsks).toBe(0);
    // Talked in most of the last twelve weeks, it's "most weeks"; long quiet, "not lately".
    const start = t.clock.now.toISOString();
    try {
      t.clock.advance(-10 * 7 * 86_400_000);
      for (let week = 0; week < 8; week++) {
        await send(ben, withBen, `Week ${week + 1} update`);
        t.clock.advance(7 * 86_400_000);
      }
      t.clock.set(start);
      expect((await ana.get(`/v1/people/${ben.user.id}`)).summary.rhythm).toBe('most_weeks');
      t.clock.advance(85 * 86_400_000);
      expect((await ana.get(`/v1/people/${ben.user.id}`)).summary.rhythm).toBe('not_lately');
    } finally {
      t.clock.set(start);
    }
    // What their conversations are about.
    const context = await ana.post('/v1/contexts', {
      kind: 'project',
      title: 'Project Alpha',
      conversationId: withBen,
    });
    const about = (await ana.get(`/v1/people/${ben.user.id}`)).summary.contexts;
    expect(about).toEqual([{ id: context.id, title: 'Project Alpha', kind: 'project' }]);
    // A rule just for Ben that shows him a limited view of Ana.
    const conn = (await ana.get('/v1/connections')).connections.find(
      (c: any) => c.person.id === ben.user.id,
    );
    await ana.post('/v1/policies', {
      scope: { connectionId: conn.connectionId },
      settings: { privacy: 'limited' },
    });
    expect((await ana.get(`/v1/people/${ben.user.id}`)).summary.privacy).toBe('limited');
    expect((await ben.get(`/v1/people/${ana.user.id}`)).summary.privacy).toBe('standard');
  });

  it('leaves out what the viewer deleted for themselves', async () => {
    const before = (await ana.get(`/v1/people/${ben.user.id}`)).summary;
    const asked = (await send(ben, withBen, 'Can you book the room for Monday?')).message;
    const now = (await ana.get(`/v1/people/${ben.user.id}`)).summary;
    expect(now.theirAsks).toBe(before.theirAsks + 1);
    expect(now.messages).toBe(before.messages + 1);
    await ana.del(`/v1/messages/${asked.id}?forEveryone=false`);
    const after = (await ana.get(`/v1/people/${ben.user.id}`)).summary;
    expect(after.theirAsks).toBe(before.theirAsks);
    expect(after.messages).toBe(before.messages);
    // Ben, who didn't, still has it.
    expect((await ben.get(`/v1/people/${ana.user.id}`)).summary.messages).toBe(now.messages);
  });
});

describe('how Caime thinks you know someone (PRD §12)', () => {
  it('two people on the same team are offered as colleagues, each only for themselves', async () => {
    const org = (
      await ana.post('/v1/orgs', {
        country: 'EG',
        name: 'Acme Parts',
        handle: 'acme.profile',
        kind: 'business',
      })
    ).org.id;
    await ana.post(`/v1/orgs/${org}/members`, { userIds: [ben.user.id] });
    const [forAna] = await offers(ana, ben);
    expect(forAna).toMatchObject({
      title: 'Colleague · Acme Parts',
      payload: { sphere: 'work', role: 'colleague', orgName: 'Acme Parts' },
    });
    expect(forAna.rationale).toBe('You and Ben Profile are both on Acme Parts’s team in Caime.');
    expect((await offers(ben, ana))[0]).toMatchObject({ title: 'Colleague · Acme Parts' });
    // Accepted, it's a label of Ana's only; Ben still decides for himself.
    await ana.post(`/v1/suggestions/${forAna.id}/accept`);
    const labels = (await ana.get(`/v1/people/${ben.user.id}`)).relationships;
    expect(labels).toEqual([
      expect.objectContaining({ sphere: 'work', role: 'colleague', orgName: 'Acme Parts' }),
    ]);
    expect((await ben.get(`/v1/people/${ana.user.id}`)).relationships).toEqual([]);
    expect(await offers(ana, ben)).toEqual([]);
    // Someone who connects later with a teammate is offered it as they connect.
    const cy = await signup(t, { displayName: 'Cy Later', email: 'cy@outlook.com' });
    await connect(ana, cy);
    await ana.post(`/v1/orgs/${org}/members`, { userIds: [cy.user.id] });
    expect((await offers(cy, ben)).length).toBe(0);
    await connect(ben, cy);
    expect((await offers(cy, ben))[0]).toMatchObject({ title: 'Colleague · Acme Parts' });
    expect((await offers(ben, cy))[0]).toMatchObject({ title: 'Colleague · Acme Parts' });
  });

  it('a space two people share is offered as what it’s for; nothing for strangers in it', async () => {
    const dee = await signup(t, { displayName: 'Dee Family', email: 'dee@gmail.com' });
    const eli = await signup(t, { displayName: 'Eli Family', email: 'eli@gmail.com' });
    const fay = await signup(t, { displayName: 'Fay Family', email: 'fay@gmail.com' });
    await connect(dee, eli);
    await connect(dee, fay);
    await dee.post('/v1/spaces', {
      name: 'The Nile family',
      kind: 'family',
      memberIds: [eli.user.id, fay.user.id],
    });
    const [dees] = await offers(dee, eli);
    expect(dees).toMatchObject({ title: 'Family', payload: { sphere: 'family', role: null } });
    expect(dees.rationale).toBe('You and Eli Family are both in The Nile family, a family space.');
    expect((await offers(eli, dee))[0]).toMatchObject({ title: 'Family' });
    // Eli and Fay aren't connected: neither is offered anything about the other.
    expect(await offers(eli, fay)).toEqual([]);
    expect(await offers(fay, eli)).toEqual([]);
    // Dismissed, it doesn't come back.
    await dee.post(`/v1/suggestions/${dees.id}/dismiss`);
    const gil = await signup(t, { displayName: 'Gil Family', email: 'gil@gmail.com' });
    await connect(dee, gil);
    const space = (await dee.get('/v1/spaces')).spaces[0].id;
    await dee.post(`/v1/spaces/${space}/members`, { userIds: [gil.user.id] });
    expect(await offers(dee, eli)).toEqual([]);
    expect((await offers(dee, gil))[0]).toMatchObject({ title: 'Family' });
    // Someone Dee has already said how she knows isn't offered to her again; she is to them.
    const ivy = await signup(t, { displayName: 'Ivy Friend', email: 'ivy@gmail.com' });
    const asked = await dee.post('/v1/connections/requests', {
      toUserId: ivy.user.id,
      relationship: { sphere: 'friend' },
    });
    await ivy.post(`/v1/connections/requests/${asked.requestId}/accept`, {});
    await dee.post(`/v1/spaces/${space}/members`, { userIds: [ivy.user.id] });
    expect(await offers(dee, ivy)).toEqual([]);
    expect(
      await t.ctx.db
        .selectFrom('suggestions')
        .select('id')
        .where('user_id', '=', dee.user.id)
        .where('subject_user_id', '=', ivy.user.id)
        .execute(),
    ).toEqual([]);
    expect((await offers(ivy, dee))[0]).toMatchObject({ title: 'Family' });
    // Nor anything between two people whose connection ended.
    const hal = await signup(t, { displayName: 'Hal Former', email: 'hal@gmail.com' });
    await connect(dee, hal);
    await connect(gil, hal);
    const ended = (await gil.get('/v1/connections')).connections.find(
      (c: any) => c.person.id === hal.user.id,
    );
    await gil.del(`/v1/connections/${ended.connectionId}`);
    await dee.post(`/v1/spaces/${space}/members`, { userIds: [hal.user.id] });
    expect(await offers(gil, hal)).toEqual([]);
    expect(await offers(hal, gil)).toEqual([]);
    expect((await offers(hal, dee))[0]).toMatchObject({ title: 'Family' });
  });

  it('a team both are on says more than the email domain they share', async () => {
    const jo = await signup(t, { displayName: 'Jo Team', email: 'jo@acmeparts.io' });
    const kim = await signup(t, { displayName: 'Kim Team', email: 'kim@acmeparts.io' });
    await connect(ana, jo);
    await connect(ana, kim);
    const org = (
      await ana.post('/v1/orgs', {
        country: 'EG',
        name: 'Parts Co',
        handle: 'parts.profile',
        kind: 'business',
      })
    ).org.id;
    await ana.post(`/v1/orgs/${org}/members`, { userIds: [jo.user.id, kim.user.id] });
    await connect(jo, kim);
    const [offered] = await offers(jo, kim);
    expect(offered).toMatchObject({ title: 'Colleague · Parts Co' });
    expect(offered.rationale).toBe('You and Kim Team are both on Parts Co’s team in Caime.');
  });

  it('goes once you say how you know them, and is never about someone blocked', async () => {
    const mo = await signup(t, { displayName: 'Mo Nile', email: 'mo@nileworks.io' });
    const nia = await signup(t, { displayName: 'Nia Nile', email: 'nia@nileworks.io' });
    await connect(mo, nia);
    // Two reasons to think so: an email domain, then a team.
    expect((await offers(mo, nia)).map((o) => o.title)).toEqual(['Colleague · Nileworks']);
    const org = (
      await mo.post('/v1/orgs', {
        country: 'EG',
        name: 'Delta Works',
        handle: 'delta.profile',
        kind: 'business',
      })
    ).org.id;
    await mo.post(`/v1/orgs/${org}/members`, { userIds: [nia.user.id] });
    const both = await offers(mo, nia);
    expect(both.map((o) => o.title).sort()).toEqual([
      'Colleague · Delta Works',
      'Colleague · Nileworks',
    ]);
    // Accepting one answers the other: Mo has said how he knows Nia, on each of his devices.
    const heard: BusMessage[] = [];
    const stop = t.ctx.bus.subscribe((m) => heard.push(m));
    const changedFor = async (userId: string) => {
      const told = () =>
        heard.some((m) => m.event.type === 'relationship.changed' && m.userIds.includes(userId));
      for (let i = 0; i < 300 && !told(); i++) await new Promise((r) => setTimeout(r, 10));
      return told();
    };
    try {
      await mo.post(`/v1/suggestions/${both[0].id}/accept`);
      expect(await offers(mo, nia)).toEqual([]);
      // Answered, not only out of sight.
      const rows = await t.ctx.db
        .selectFrom('suggestions')
        .select(['id', 'status'])
        .where('user_id', '=', mo.user.id)
        .where('subject_user_id', '=', nia.user.id)
        .execute();
      expect(rows.map((r) => r.status).sort()).toEqual(['accepted', 'expired']);
      expect(await changedFor(mo.user.id)).toBe(true);
      // One left pending from before this is never shown while he's said.
      await t.ctx.db
        .insertInto('suggestions')
        .values({
          id: uuidv4(),
          user_id: mo.user.id,
          kind: 'relationship',
          title: 'Friend',
          rationale: 'From before',
          confidence: 0.5,
          payload: { sphere: 'friend' },
          subject_user_id: nia.user.id,
          fingerprint: `relationship:${nia.user.id}:friend::`,
        })
        .execute();
      expect(await offers(mo, nia)).toEqual([]);
      // Saying it by hand does the same.
      expect((await offers(nia, mo)).length).toBeGreaterThan(0);
      await nia.post('/v1/relationships', { userId: mo.user.id, sphere: 'friend' });
      expect(await offers(nia, mo)).toEqual([]);
      expect(await changedFor(nia.user.id)).toBe(true);
    } finally {
      stop();
    }
    // Blocked, neither is offered anything about the other, now or later, and an offer from
    // before can't be accepted.
    const pia = await signup(t, { displayName: 'Pia Block', email: 'pia@gmail.com' });
    const quin = await signup(t, { displayName: 'Quin Block', email: 'quin@gmail.com' });
    await connect(pia, quin);
    const choir = (
      await pia.post('/v1/spaces', { name: 'Choir', kind: 'community', memberIds: [quin.user.id] })
    ).space.id;
    const [quins] = await offers(quin, pia);
    expect(quins).toMatchObject({ payload: { sphere: 'community' } });
    expect((await offers(pia, quin)).length).toBe(1);
    await pia.post('/v1/blocks', { userId: quin.user.id });
    expect(await offers(pia, quin)).toEqual([]);
    expect(await offers(quin, pia)).toEqual([]);
    expect((await quin.req('POST', `/v1/suggestions/${quins.id}/accept`)).statusCode).toBe(404);
    const team = (
      await pia.post('/v1/orgs', {
        country: 'EG',
        name: 'Choir Co',
        handle: 'choir.profile',
        kind: 'business',
      })
    ).org.id;
    await pia.post(`/v1/orgs/${team}/members`, { userIds: [quin.user.id] }).catch(() => null);
    expect(await offers(pia, quin)).toEqual([]);
    expect(await offers(quin, pia)).toEqual([]);
    // One made before a block isn't listed across it either.
    await t.ctx.db
      .insertInto('suggestions')
      .values({
        id: uuidv4(),
        user_id: pia.user.id,
        kind: 'relationship',
        title: 'Friend',
        rationale: 'From before',
        confidence: 0.5,
        payload: { sphere: 'friend' },
        subject_user_id: quin.user.id,
        fingerprint: `relationship:${quin.user.id}:friend::`,
      })
      .execute();
    expect(await offers(pia, quin)).toEqual([]);
    await t.ctx.db
      .deleteFrom('suggestions')
      .where('user_id', '=', pia.user.id)
      .where('subject_user_id', '=', quin.user.id)
      .execute();
    // Unblocked, what the place suggests may be offered again, as if it never was.
    await pia.del(`/v1/blocks/${quin.user.id}`);
    await quin.del(`/v1/spaces/${choir}/members/${quin.user.id}`);
    await pia.post(`/v1/spaces/${choir}/members`, { userIds: [quin.user.id] });
    expect((await offers(quin, pia))[0]).toMatchObject({ payload: { sphere: 'community' } });
  });

  it('goes when either of the two leaves the team or space it came from', async () => {
    const ray = await signup(t, { displayName: 'Ray Harbor', email: 'ray@gmail.com' });
    const sue = await signup(t, { displayName: 'Sue Harbor', email: 'sue@gmail.com' });
    await connect(ray, sue);
    const harbor = (
      await ray.post('/v1/orgs', {
        country: 'EG',
        name: 'Harbor',
        handle: 'harbor.profile',
        kind: 'business',
      })
    ).org.id;
    await ray.post(`/v1/orgs/${harbor}/members`, { userIds: [sue.user.id] });
    expect((await offers(ray, sue))[0]).toMatchObject({ title: 'Colleague · Harbor' });
    expect((await offers(sue, ray))[0]).toMatchObject({ title: 'Colleague · Harbor' });
    // Sue leaves the team: "You and Sue are both on Harbor's team" isn't so any more.
    await sue.del(`/v1/orgs/${harbor}/members/${sue.user.id}`);
    expect(await offers(ray, sue)).toEqual([]);
    expect(await offers(sue, ray)).toEqual([]);
    // The same for a space.
    const home = (
      await ray.post('/v1/spaces', {
        name: 'Harbor house',
        kind: 'family',
        memberIds: [sue.user.id],
      })
    ).space.id;
    expect((await offers(sue, ray))[0]).toMatchObject({ title: 'Family' });
    await ray.del(`/v1/spaces/${home}/members/${sue.user.id}`);
    expect(await offers(ray, sue)).toEqual([]);
    expect(await offers(sue, ray)).toEqual([]);
  });

  it('is offered once however it came, and names them as they show themselves', async () => {
    // Rae told Sol how they know each other as she asked; a family space later says the same.
    const rae = await signup(t, { displayName: 'Rae Nile', email: 'rae@gmail.com' });
    const sol = await signup(t, { displayName: 'Sol Nile', email: 'sol@gmail.com' });
    const r = await rae.post('/v1/connections/requests', {
      toUserId: sol.user.id,
      context: { sphere: 'family' },
    });
    await sol.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    const [first] = await offers(sol, rae);
    expect(first).toMatchObject({ title: 'Family', payload: { sphere: 'family' } });
    await rae.post('/v1/spaces', { name: 'The Niles', kind: 'family', memberIds: [sol.user.id] });
    expect((await offers(sol, rae)).map((o) => o.id)).toEqual([first.id]);
    // Dismissed, the same offer never comes back from somewhere else.
    await sol.post(`/v1/suggestions/${first.id}/dismiss`);
    await rae.post('/v1/spaces', { name: 'Cousins', kind: 'family', memberIds: [sol.user.id] });
    expect(await offers(sol, rae)).toEqual([]);
    // Samira shows herself to Ana as Sam Haddad: Caime's reasons name Sam, as she asks to
    // connect and later.
    const samira = await signup(t, { displayName: 'Samira Khoury', email: 'samira@gmail.com' });
    const identity = (
      await samira.post('/v1/me/identities', { kind: 'professional', displayName: 'Sam Haddad' })
    ).id;
    const asked = await samira.post('/v1/connections/requests', {
      toUserId: ana.user.id,
      identityId: identity,
      context: { sphere: 'professional' },
    });
    await ana.post(`/v1/connections/requests/${asked.requestId}/accept`, {});
    const [described] = await offers(ana, samira);
    expect(described.rationale).toMatch(/^Sam Haddad described how you know each other/);
    await ana.post(`/v1/suggestions/${described.id}/dismiss`);
    const side = await t.ctx.db
      .selectFrom('connection_sides')
      .select('connection_id')
      .where('owner_id', '=', samira.user.id)
      .where('other_id', '=', ana.user.id)
      .executeTakeFirstOrThrow();
    await samira.patch(`/v1/connections/${side.connection_id}`, { identityId: identity });
    const clinic = (
      await ana.post('/v1/orgs', {
        country: 'EG',
        name: 'Clinic',
        handle: 'clinic.profile',
        kind: 'business',
      })
    ).org.id;
    await ana.post(`/v1/orgs/${clinic}/members`, { userIds: [samira.user.id] });
    const [toAna] = await offers(ana, samira);
    expect(toAna.rationale).toBe('You and Sam Haddad are both on Clinic’s team in Caime.');
    // Samira, who shows Ana nothing but herself, reads Ana's own name.
    expect((await offers(samira, ana))[0].rationale).toBe(
      'You and Ana Profile are both on Clinic’s team in Caime.',
    );
  });

  it('offers written before in two ways become one, and what was dismissed stays so', async () => {
    const uma = await signup(t, { displayName: 'Uma Old', email: 'uma@gmail.com' });
    const vin = await signup(t, { displayName: 'Vin Old', email: 'vin@gmail.com' });
    const row = (fingerprint: string, status: string, payload: Record<string, unknown>) => ({
      id: uuidv4(),
      user_id: uma.user.id,
      kind: 'relationship',
      title: 'Family',
      rationale: 'Old',
      confidence: 0.8,
      payload,
      subject_user_id: vin.user.id,
      status: status as 'pending',
      fingerprint,
    });
    const family = { sphere: 'family', role: null, orgName: null };
    const acme = { sphere: 'work', role: 'colleague', orgName: 'ACME' };
    await t.ctx.db
      .insertInto('suggestions')
      .values([
        // How Vin described it (the old four-part form), dismissed, and a space's, pending.
        row(`relationship:${vin.user.id}:family:`, 'dismissed', family),
        row(`relationship:${vin.user.id}:family::`, 'pending', family),
        // The same team, its name cased two ways.
        row(`relationship:${vin.user.id}:work:colleague:ACME`, 'pending', acme),
        row(`relationship:${vin.user.id}:work:colleague:Acme`, 'pending', {
          ...acme,
          orgName: 'Acme',
        }),
      ])
      .execute();
    const migration = readFileSync(
      new URL('../src/db/migrations/0029_relationship_offer_fingerprints.sql', import.meta.url),
      'utf8',
    );
    await sql.raw(migration).execute(t.ctx.db);
    const left = await t.ctx.db
      .selectFrom('suggestions')
      .select(['status', 'fingerprint'])
      .where('user_id', '=', uma.user.id)
      .orderBy('fingerprint')
      .execute();
    expect(left).toEqual([
      { status: 'dismissed', fingerprint: `relationship:${vin.user.id}:family::` },
      { status: 'pending', fingerprint: `relationship:${vin.user.id}:work:colleague:acme` },
    ]);
    // Run again, it changes nothing.
    await sql.raw(migration).execute(t.ctx.db);
    expect(
      await t.ctx.db
        .selectFrom('suggestions')
        .select(['status', 'fingerprint'])
        .where('user_id', '=', uma.user.id)
        .orderBy('fingerprint')
        .execute(),
    ).toEqual(left);
  });
});
