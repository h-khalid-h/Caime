/**
 * Onto a verified organization's team by an address at its domain (M16 C3b, review 2026-10-17
 * §1 H3): its owner or an admin turns it on, and anyone with a confirmed address there joins as a
 * team member in one tap, without an invite each. An address counts once proven; teams are for
 * adults (R29); and someone the team took off comes back only by a manager or an invite.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
const mail = memoryMailer();
const txt = new Map<string, string[][]>();
let noor: Client;
let orgId: string;
const DOMAIN = 'niledental.example';

const codeIn = (text: string) => /is (\d{6})/.exec(text)?.[1] ?? '';
const lastCodeTo = async (to: string) => {
  await t.ctx.flush();
  return codeIn(mail.outbox.filter((m) => m.to === to).at(-1)?.text ?? '');
};
/** Someone signed up with an address, and (unless `confirm` is false) confirmed it. */
const person = async (
  name: string,
  email: string,
  opts: { confirm?: boolean; birthDate?: string } = {},
) => {
  const c = await signup(t, { displayName: name, email, birthDate: opts.birthDate });
  if (opts.confirm !== false)
    await c.post('/v1/auth/email/verify', { code: await lastCodeTo(email) });
  return c;
};
const standing = async (c: Client) => {
  const { org } = await c.get('/v1/orgs/by-handle/nile.dental');
  return { joinableAs: org.joinableAs, joinOnceConfirmed: org.joinOnceConfirmed };
};
const myRole = async (c: Client) =>
  (await c.get('/v1/orgs')).orgs.find((o: { id: string }) => o.id === orgId)?.myRole ?? null;
const verify = async (owner: Client, id: string, domain: string) => {
  const { org } = await owner.req('PUT', `/v1/orgs/${id}/domain`, { domain }).then((r) => r.json());
  txt.set(`_caime-verify.${domain}`, [[org.domain.record.value]]);
  await owner.post(`/v1/orgs/${id}/domain/check`);
};

beforeAll(async () => {
  t = await createTestApp({}, { mail });
  t.ctx.dns = {
    resolveTxt: async (name) => {
      const found = txt.get(name);
      if (!found)
        throw Object.assign(new Error(`queryTxt ENOTFOUND ${name}`), { code: 'ENOTFOUND' });
      return found;
    },
  };
  noor = await signup(t, { displayName: 'Noor Haddad' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
  await verify(noor, orgId, DOMAIN);
  // The room on the team isn't what these tests are about, except where one says so.
  await t.ctx.db
    .updateTable('organizations')
    .set({ plan: 'business' })
    .where('id', '=', orgId)
    .execute();
});
afterAll(async () => {
  await t.close();
});

describe('joining by an address at its domain', () => {
  let rana: Client;

  it('is off until its owner or an admin turns it on', async () => {
    rana = await person('Rana Staff', `rana@${DOMAIN}`);
    expect(await standing(rana)).toEqual({ joinableAs: null, joinOnceConfirmed: null });
    const early = await rana.req('POST', `/v1/orgs/${orgId}/join`);
    expect(early.statusCode).toBe(403);
    expect(early.json().error.message).toBe('No address of yours lets you join this team.');
    // Someone on the team who doesn't run it can't turn it on.
    const agent = await signup(t, {});
    await t.ctx.db
      .insertInto('org_members')
      .values({ org_id: orgId, user_id: agent.user.id, role: 'agent', added_by: noor.user.id })
      .execute();
    expect((await agent.req('PATCH', `/v1/orgs/${orgId}`, { joinByDomain: true })).statusCode).toBe(
      403,
    );
    const { org } = await noor.patch(`/v1/orgs/${orgId}`, { joinByDomain: true });
    expect(org.domain).toMatchObject({ name: DOMAIN, verified: true, joinByDomain: true });
    const logged = await t.ctx.db
      .selectFrom('audit_log')
      .select(['actor_id', 'metadata'])
      .where('action', '=', 'org.domain_join_set')
      .executeTakeFirstOrThrow();
    expect(logged).toMatchObject({ actor_id: noor.user.id, metadata: { on: true } });
  });

  it('lets someone with a confirmed address in with one tap, as a team member', async () => {
    expect(await standing(rana)).toEqual({ joinableAs: `rana@${DOMAIN}`, joinOnceConfirmed: null });
    expect(await rana.post(`/v1/orgs/${orgId}/join`)).toEqual({
      orgId,
      handle: 'nile.dental',
      already: false,
    });
    expect(await myRole(rana)).toBe('agent');
    // On the team, the page offers nothing more; twice is once.
    expect(await standing(rana)).toEqual({ joinableAs: null, joinOnceConfirmed: null });
    expect((await rana.post(`/v1/orgs/${orgId}/join`)).already).toBe(true);
    // Whoever runs it hears who came in; the log says how, never by which address.
    await t.ctx.flush();
    expect(JSON.stringify(await noor.get('/v1/notifications'))).toContain(
      'Rana Staff joined Nile Dental’s team',
    );
    const logged = await t.ctx.db
      .selectFrom('audit_log')
      .select('metadata')
      .where('action', '=', 'org.members_added')
      .where('actor_id', '=', rana.user.id)
      .executeTakeFirstOrThrow();
    expect(logged.metadata).toEqual({ userIds: [rana.user.id], byDomain: true });
    expect(JSON.stringify(logged.metadata)).not.toContain(DOMAIN);
    expect(t.ctx.metrics.teamJoins.get({ by: 'domain' })).toBe(1);
  });

  it('asks first for a sign-in address still waiting for its code, then offers the team', async () => {
    const sami = await person('Sami New', `sami@${DOMAIN}`, { confirm: false });
    expect(await standing(sami)).toEqual({ joinableAs: null, joinOnceConfirmed: `sami@${DOMAIN}` });
    const early = await sami.req('POST', `/v1/orgs/${orgId}/join`);
    expect(early.statusCode).toBe(403);
    expect(early.json().error.message).toBe('Confirm your address first: it’s what lets you join.');
    // Confirmed, they hear they may join, and the notice opens the organization's page.
    await sami.post('/v1/auth/email/verify', { code: await lastCodeTo(`sami@${DOMAIN}`) });
    await t.ctx.flush();
    const told = await sami.get('/v1/notifications');
    const offer = told.notifications.find(
      (n: { title: string }) => n.title === 'You can join Nile Dental’s team',
    );
    expect(offer).toMatchObject({
      body: `Your address at ${DOMAIN} lets you in.`,
      data: { handle: 'nile.dental', orgId },
    });
    expect(await standing(sami)).toEqual({ joinableAs: `sami@${DOMAIN}`, joinOnceConfirmed: null });
  });

  it('counts an address added and proven (R91), never one only typed', async () => {
    const yusuf = await person('Yusuf Adel', 'yusuf@home.example');
    const add = await yusuf.req('POST', '/v1/me/addresses', {
      kind: 'email',
      value: `yusuf@${DOMAIN}`,
    });
    expect(add.statusCode).toBe(201);
    const { address } = add.json();
    // Added, not proven: nothing yet, and nothing to confirm on the page (it isn't their sign-in).
    expect(await standing(yusuf)).toEqual({ joinableAs: null, joinOnceConfirmed: null });
    await yusuf.post(`/v1/me/addresses/${address.id}/verify`, {
      code: await lastCodeTo(`yusuf@${DOMAIN}`),
    });
    await t.ctx.flush();
    expect(JSON.stringify(await yusuf.get('/v1/notifications'))).toContain(
      'You can join Nile Dental’s team',
    );
    expect(await standing(yusuf)).toEqual({
      joinableAs: `yusuf@${DOMAIN}`,
      joinOnceConfirmed: null,
    });
    expect((await yusuf.post(`/v1/orgs/${orgId}/join`)).already).toBe(false);
  });

  it('keeps teams for adults, and an address at another domain lets nobody in', async () => {
    const teen = await person('Tia Teen', `tia@${DOMAIN}`, { birthDate: '2011-05-01' });
    expect(await standing(teen)).toEqual({ joinableAs: null, joinOnceConfirmed: null });
    const res = await teen.req('POST', `/v1/orgs/${orgId}/join`);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toBe('Teams are for people over 18.');
    // A lookalike domain is another domain.
    const near = await person('Near Miss', `near@mail.${DOMAIN}`);
    expect(await standing(near)).toEqual({ joinableAs: null, joinOnceConfirmed: null });
    expect((await near.req('POST', `/v1/orgs/${orgId}/join`)).statusCode).toBe(403);
  });
});

describe('what it costs (convention 14)', () => {
  it('reads three rows more on the page, for someone not on the team, only where it takes people', async () => {
    const reader = await person('Reader One', 'reader@elsewhere.example');
    const cost = async () => {
      const before = t.queries();
      await reader.get('/v1/orgs/by-handle/nile.dental');
      return t.queries() - before;
    };
    await cost(); // whatever the first read warms
    const on = await cost();
    await noor.patch(`/v1/orgs/${orgId}`, { joinByDomain: false });
    const off = await cost();
    await noor.patch(`/v1/orgs/${orgId}`, { joinByDomain: true });
    // Measured 2026-10-18: the person, their seat, their added addresses.
    expect(on - off).toBe(3);
  });
});

describe('who stays off the team', () => {
  it('is someone it removed, until a manager or an invite brings them back', async () => {
    const lina = await person('Lina Removed', `lina@${DOMAIN}`);
    await lina.post(`/v1/orgs/${orgId}/join`);
    await noor.del(`/v1/orgs/${orgId}/members/${lina.user.id}`);
    expect(await myRole(lina)).toBeNull();
    expect(await standing(lina)).toEqual({ joinableAs: null, joinOnceConfirmed: null });
    const back = await lina.req('POST', `/v1/orgs/${orgId}/join`);
    expect(back.statusCode).toBe(403);
    expect(back.json().error.message).toBe('No address of yours lets you join this team.');
    // An invite brings them back, and with it their address counts again.
    const invite = await noor.post(`/v1/orgs/${orgId}/invites`, {});
    await lina.post(`/v1/team-invites/${invite.url.split('/t/')[1]}/accept`);
    expect(await myRole(lina)).toBe('agent');
    expect(t.ctx.metrics.teamJoins.get({ by: 'invite' })).toBe(1);
    // Leaving of their own accord isn't being removed: they may come back by their address.
    await lina.del(`/v1/orgs/${orgId}/members/${lina.user.id}`);
    expect(await standing(lina)).toEqual({ joinableAs: `lina@${DOMAIN}`, joinOnceConfirmed: null });
  });

  it('is everyone once it is turned off, or the domain is let go', async () => {
    const omar = await person('Omar Late', `omar@${DOMAIN}`);
    await noor.patch(`/v1/orgs/${orgId}`, { joinByDomain: false });
    expect(await standing(omar)).toEqual({ joinableAs: null, joinOnceConfirmed: null });
    expect((await omar.req('POST', `/v1/orgs/${orgId}/join`)).statusCode).toBe(403);
    await noor.patch(`/v1/orgs/${orgId}`, { joinByDomain: true });
    expect((await standing(omar)).joinableAs).toBe(`omar@${DOMAIN}`);
    await noor.del(`/v1/orgs/${orgId}/domain`);
    expect(await standing(omar)).toEqual({ joinableAs: null, joinOnceConfirmed: null });
    expect((await omar.req('POST', `/v1/orgs/${orgId}/join`)).statusCode).toBe(403);
    await verify(noor, orgId, DOMAIN);
  });

  it('is anyone past the room on its plan, and an unverified organization takes nobody', async () => {
    // Free has room for three: the owner and two more.
    const small = (
      await noor.post('/v1/orgs', {
        country: 'EG',
        name: 'Small Shop',
        handle: 'small.shop',
        kind: 'shop',
      })
    ).org.id;
    await verify(noor, small, 'smallshop.example');
    await noor.patch(`/v1/orgs/${small}`, { joinByDomain: true });
    for (const n of ['a', 'b'])
      await (await person(n, `${n}@smallshop.example`)).post(`/v1/orgs/${small}/join`);
    const third = await person('Third', 'c@smallshop.example');
    const full = await third.req('POST', `/v1/orgs/${small}/join`);
    expect(full.statusCode).toBe(403);
    expect(full.json().error.code).toBe('plan_limit');
    // A domain only claimed, never proven, lets nobody in, whatever the switch says.
    const claimed = (
      await noor.post('/v1/orgs', {
        country: 'EG',
        name: 'Claimed Only',
        handle: 'claimed.only',
        kind: 'shop',
      })
    ).org.id;
    await noor.req('PUT', `/v1/orgs/${claimed}/domain`, { domain: 'claimed.example' });
    await noor.patch(`/v1/orgs/${claimed}`, { joinByDomain: true });
    const someone = await person('Some One', 'some@claimed.example');
    const { org } = await someone.get('/v1/orgs/by-handle/claimed.only');
    expect(org.joinableAs).toBeNull();
    expect((await someone.req('POST', `/v1/orgs/${claimed}/join`)).statusCode).toBe(403);
  });
});
