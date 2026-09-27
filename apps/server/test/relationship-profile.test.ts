import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
});

describe('how Caishy thinks you know someone (PRD §12)', () => {
  it('two people on the same team are offered as colleagues, each only for themselves', async () => {
    const org = (
      await ana.post('/v1/orgs', { name: 'Acme Parts', handle: 'acme.profile', kind: 'business' })
    ).org.id;
    await ana.post(`/v1/orgs/${org}/members`, { userIds: [ben.user.id] });
    const [forAna] = await offers(ana, ben);
    expect(forAna).toMatchObject({
      title: 'Colleague · Acme Parts',
      payload: { sphere: 'work', role: 'colleague', orgName: 'Acme Parts' },
    });
    expect(forAna.rationale).toBe('You and Ben Profile are both on Acme Parts’s team in Caishy.');
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
      await ana.post('/v1/orgs', { name: 'Parts Co', handle: 'parts.profile', kind: 'business' })
    ).org.id;
    await ana.post(`/v1/orgs/${org}/members`, { userIds: [jo.user.id, kim.user.id] });
    await connect(jo, kim);
    const [offered] = await offers(jo, kim);
    expect(offered).toMatchObject({ title: 'Colleague · Parts Co' });
    expect(offered.rationale).toBe('You and Kim Team are both on Parts Co’s team in Caishy.');
  });
});
