import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sara: Client;
let omar: Client;
let teen: Client;
let customer: Client;
/** DNS as the tests say it is. */
const txt = new Map<string, string[][]>();

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
}
const trustOf = async (viewer: Client, person: Client) =>
  (await viewer.get(`/v1/people/${person.user.id}`)).person.trust.label;

beforeAll(async () => {
  t = await createTestApp();
  t.ctx.dns = {
    resolveTxt: async (name) => {
      const found = txt.get(name);
      if (!found)
        throw Object.assign(new Error(`queryTxt ENOTFOUND ${name}`), { code: 'ENOTFOUND' });
      return found;
    },
  };
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sara = await signup(t, { displayName: 'Sara Ali' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  teen = await signup(t, { displayName: 'Rami Young', birthYear: 2011 });
  customer = await signup(t, { displayName: 'Lina Customer', handle: 'lina.customer' });
  await connect(noor, sara);
  await connect(noor, omar);
  await connect(teen, noor);
  await connect(customer, sara);
});
afterAll(async () => {
  await t.close();
});

describe('organizations (PRD §36, R15)', () => {
  let orgId: string;

  it('an adult creates one; its handle is one namespace with people', async () => {
    const young = await teen.req('POST', '/v1/orgs', {
      name: 'Rami’s shop',
      handle: 'ramishop',
      kind: 'shop',
    });
    expect(young.statusCode).toBe(403);
    const clash = await noor.req('POST', '/v1/orgs', {
      name: 'Lina Co',
      handle: 'lina.customer',
      kind: 'business',
    });
    expect(clash.json().error.code).toBe('handle_taken');

    const { org } = await noor.post('/v1/orgs', {
      name: 'DATA C',
      handle: 'datac',
      kind: 'business',
      about: 'Data and analytics for clinics',
      website: 'https://datac.com',
    });
    orgId = org.id;
    expect(org).toMatchObject({
      name: 'DATA C',
      handle: 'datac',
      verified: false,
      verifiedDomain: null,
      memberCount: 1,
      myRole: 'owner',
      domain: null,
    });
    expect(org.members.map((m: any) => [m.person.displayName, m.role])).toEqual([
      ['Noor Haddad', 'owner'],
    ]);
    // Nobody can become @datac now, or take it back from the organization.
    expect(
      (await t.app.inject({ url: '/v1/me/handle-available?handle=datac' })).json(),
    ).toMatchObject({
      available: false,
    });
    const rename = await omar.req('PATCH', '/v1/me', { handle: 'datac' });
    expect(rename.json().error.code).toBe('handle_taken');
  });

  it('anyone can find it and see its profile, but not its team or its verification', async () => {
    const { org } = await customer.get('/v1/orgs/by-handle/@datac');
    expect(org).toMatchObject({ name: 'DATA C', myRole: null, members: null, domain: null });
    const { orgs } = await customer.get('/v1/orgs/search?q=data');
    expect(orgs.map((o: any) => o.handle)).toContain('datac');
    // Its team isn't shown to a customer, and they can't change anything.
    const edit = await customer.req('PATCH', `/v1/orgs/${orgId}`, { name: 'Mine' });
    expect(edit.statusCode).toBe(404);
  });

  it('the team is made of people you’re connected with, adults only; admins can’t make admins', async () => {
    const stranger = await noor.req('POST', `/v1/orgs/${orgId}/members`, {
      userIds: [customer.user.id],
    });
    expect(stranger.json().error.message).toBe('You can add people you’re connected with.');
    const young = await noor.req('POST', `/v1/orgs/${orgId}/members`, { userIds: [teen.user.id] });
    expect(young.statusCode).toBe(403);
    await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [sara.user.id], role: 'admin' });
    await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
    await noor.patch(`/v1/orgs/${orgId}/members/${omar.user.id}`, { title: 'Support' });
    const { org } = await sara.get(`/v1/orgs/${orgId}`);
    expect(org.members.map((m: any) => [m.person.displayName, m.role, m.title])).toEqual([
      ['Noor Haddad', 'owner', null],
      ['Sara Ali', 'admin', null],
      ['Omar Farouk', 'agent', 'Support'],
    ]);
    const promote = await sara.req('PATCH', `/v1/orgs/${orgId}/members/${omar.user.id}`, {
      role: 'admin',
    });
    expect(promote.statusCode).toBe(403);
    const upward = await sara.req('DELETE', `/v1/orgs/${orgId}/members/${noor.user.id}`);
    expect(upward.statusCode).toBe(403);
  });

  it('a DNS record verifies its domain, and only then does its team show as verified', async () => {
    expect(await trustOf(customer, sara)).not.toMatch(/Verified at/);
    const { org } = await sara
      .req('PUT', `/v1/orgs/${orgId}/domain`, {
        domain: 'https://www.DataC.com/about',
      })
      .then((r) => r.json());
    expect(org.domain).toMatchObject({
      name: 'datac.com',
      verified: false,
      record: { name: '_caishy-verify.datac.com', type: 'TXT' },
    });
    const value: string = org.domain.record.value;
    expect(value).toMatch(/^caishy-verify=[\w-]{20,}$/);
    // Not there yet: it says so, and nothing changes.
    const early = await sara.req('POST', `/v1/orgs/${orgId}/domain/check`);
    expect(early.statusCode).toBe(422);
    expect(early.json().error.code).toBe('record_not_found');
    // A record with the value split in two chunks, as DNS may return it.
    txt.set('_caishy-verify.datac.com', [['v=spf1 -all'], [value.slice(0, 10), value.slice(10)]]);
    const checked = (await sara.post(`/v1/orgs/${orgId}/domain/check`)).org;
    expect(checked).toMatchObject({ verified: true, verifiedDomain: 'datac.com' });
    expect(await trustOf(customer, sara)).toBe('Verified at DATA C');
    // The customer sees it verified, but not how.
    expect((await customer.get('/v1/orgs/by-handle/datac')).org).toMatchObject({
      verified: true,
      verifiedDomain: 'datac.com',
      domain: null,
    });

    // Nobody else can claim the same domain.
    const copycat = (
      await omar.post('/v1/orgs', { name: 'DATA C (real)', handle: 'datac.real', kind: 'business' })
    ).org;
    const claim = await omar.req('PUT', `/v1/orgs/${copycat.id}/domain`, { domain: 'datac.com' });
    expect(claim.json().error.code).toBe('domain_taken');
    expect(await trustOf(customer, omar)).toBe('Verified at DATA C');
    // Where someone works is one of their professional details: hidden, so is this.
    await omar.req('PUT', '/v1/me/privacy', { fields: { identityDetails: { kind: 'nobody' } } });
    expect(await trustOf(customer, omar)).not.toMatch(/Verified at/);
    await omar.req('PUT', '/v1/me/privacy', { fields: { identityDetails: { kind: 'everyone' } } });
    expect(await trustOf(customer, omar)).toBe('Verified at DATA C');
  });

  it('changing the domain unverifies it until the new one is proven', async () => {
    const { org } = await noor
      .req('PUT', `/v1/orgs/${orgId}/domain`, { domain: 'datac.io' })
      .then((r) => r.json());
    expect(org).toMatchObject({ verified: false, domain: { name: 'datac.io', verified: false } });
    expect(await trustOf(customer, sara)).not.toMatch(/Verified at/);
    const bad = await noor.req('PUT', `/v1/orgs/${orgId}/domain`, { domain: 'localhost' });
    expect(bad.json().error.message).toBe('Enter a domain like datac.com.');
  });

  it('when the owner goes, the organization stays with its team', async () => {
    const leaving = await signup(t, { displayName: 'Rana Owner' });
    await connect(leaving, sara);
    const { org } = await leaving.post('/v1/orgs', {
      name: 'Clinic One',
      handle: 'clinicone',
      kind: 'clinic',
    });
    await leaving.post(`/v1/orgs/${org.id}/members`, { userIds: [sara.user.id] });
    expect(
      (await leaving.req('DELETE', '/v1/me', { password: 'correct horse battery' })).statusCode,
    ).toBe(200);
    const kept = (await sara.get(`/v1/orgs/${org.id}`)).org;
    expect(kept).toMatchObject({ myRole: 'owner', memberCount: 1 });
    const archive = JSON.parse((await sara.req('GET', '/v1/me/export')).body);
    expect(archive.organizations.map((o: any) => [o.handle, o.role])).toEqual([
      ['datac', 'admin'],
      ['clinicone', 'owner'],
    ]);
    // The last one out closes it.
    await sara.req('DELETE', `/v1/orgs/${org.id}/members/${sara.user.id}`);
    expect((await customer.req('GET', '/v1/orgs/by-handle/clinicone')).statusCode).toBe(404);
  });
});
