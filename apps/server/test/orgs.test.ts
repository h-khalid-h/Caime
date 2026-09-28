import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const ADMIN = 'operator-token-for-the-orgs-test-0123456789';

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
  t = await createTestApp({ ADMIN_TOKEN: ADMIN });
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
  teen = await signup(t, { displayName: 'Rami Young', birthDate: '2011-12-31' });
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
      country: 'EG',
      name: 'Rami’s shop',
      handle: 'ramishop',
      kind: 'shop',
    });
    expect(young.statusCode).toBe(403);
    const clash = await noor.req('POST', '/v1/orgs', {
      country: 'EG',
      name: 'Lina Co',
      handle: 'lina.customer',
      kind: 'business',
    });
    expect(clash.json().error.code).toBe('handle_taken');

    // Where it's based, and the year it began.
    const nowhere = await noor.req('POST', '/v1/orgs', {
      name: 'DATA C',
      handle: 'datac',
      kind: 'business',
    });
    expect(nowhere.json().error.details.fields[0].path).toBe('country');
    const soon = await noor.req('POST', '/v1/orgs', {
      country: 'EG',
      name: 'DATA C',
      handle: 'datac',
      kind: 'business',
      foundedYear: 2099,
    });
    expect(soon.json().error.details.fields[0].path).toBe('foundedYear');
    const { org } = await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'DATA C',
      handle: 'datac',
      kind: 'business',
      about: 'Data and analytics for clinics',
      website: 'https://datac.com',
      foundedYear: 2019,
    });
    orgId = org.id;
    expect(org).toMatchObject({
      name: 'DATA C',
      handle: 'datac',
      country: 'EG',
      currency: 'EGP',
      foundedYear: 2019,
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

  it('its owner says where it moved, and that it doesn’t say when it began', async () => {
    const { org } = await noor.patch(`/v1/orgs/${orgId}`, { country: 'AE', foundedYear: null });
    expect(org).toMatchObject({ country: 'AE', currency: 'AED', foundedYear: null });
    const nowhere = await noor.req('PATCH', `/v1/orgs/${orgId}`, { country: 'ZZ' });
    expect(nowhere.statusCode).toBe(400);
    await noor.patch(`/v1/orgs/${orgId}`, { country: 'EG', foundedYear: 2019 });
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
      record: { name: '_caime-verify.datac.com', type: 'TXT' },
    });
    const value: string = org.domain.record.value;
    expect(value).toMatch(/^caime-verify=[\w-]{20,}$/);
    // Not there yet: it says so, and nothing changes.
    const early = await sara.req('POST', `/v1/orgs/${orgId}/domain/check`);
    expect(early.statusCode).toBe(422);
    expect(early.json().error.code).toBe('record_not_found');
    // A record with the value split in two chunks, as DNS may return it.
    txt.set('_caime-verify.datac.com', [['v=spf1 -all'], [value.slice(0, 10), value.slice(10)]]);
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
      await omar.post('/v1/orgs', {
        country: 'EG',
        name: 'DATA C (real)',
        handle: 'datac.real',
        kind: 'business',
      })
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
      country: 'EG',
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

describe('reserved handles (R35)', () => {
  const create = (who: Client, handle: string) =>
    who.req('POST', '/v1/orgs', { country: 'EE', name: 'Caime', handle, kind: 'business' });
  /** The operator giving an organization, or a person, a reserved handle. */
  const give = (to: 'orgs' | 'people', holder: string, handle: string) =>
    t.app.inject({
      method: 'PUT',
      url: `/v1/admin/${to}/${holder}/handle`,
      headers: { authorization: `Bearer ${ADMIN}` },
      payload: { handle },
    });

  it('an organization can’t be made with one, and is told so as for one that’s taken', async () => {
    const taken = await create(noor, 'lina.customer');
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({
      error: { code: 'handle_taken', message: 'That handle isn’t available.' },
    });
    for (const handle of ['caime', 'caime.official', 'caimeapp', 'official', 'help', 'panda']) {
      const reserved = await create(noor, handle);
      expect(reserved.statusCode, handle).toBe(409);
      expect(reserved.json(), handle).toEqual(taken.json());
    }
  });

  it('the operator gives @caime to the product’s own organization, and it stays its own', async () => {
    const { org } = await noor.post('/v1/orgs', {
      country: 'EE',
      name: 'Caime',
      handle: 'our.product',
      kind: 'business',
    });
    const given = await give('orgs', '@our.product', 'caime');
    expect(given.statusCode).toBe(200);
    expect(given.json()).toEqual({ kind: 'org', id: org.id, handle: 'caime' });
    expect((await customer.get('/v1/orgs/by-handle/caime')).org).toMatchObject({
      id: org.id,
      name: 'Caime',
      handle: 'caime',
    });
    expect(await customer.get('/v1/handles/caime')).toEqual(given.json());
    const logged = await t.ctx.db
      .selectFrom('audit_log')
      .select(['target', 'metadata'])
      .where('action', '=', 'handle.claimed')
      .execute();
    expect(logged).toEqual([
      { target: org.id, metadata: { of: 'organization', from: 'our.product', to: 'caime' } },
    ]);
    // Nobody takes it from it: not a person, not another organization, not the operator.
    expect((await omar.req('PATCH', '/v1/me', { handle: 'caime' })).statusCode).toBe(409);
    expect((await create(omar, 'caime')).statusCode).toBe(409);
    const again = await give('people', omar.user.handle, 'caime');
    expect(again.statusCode).toBe(409);
    expect((await omar.get('/v1/me')).user.handle).toBe(omar.user.handle);
    // Only a reserved handle, only for an organization that's open, never for an app's bot, and
    // only by the operator.
    expect((await give('orgs', 'caime', 'our.product')).statusCode).toBe(400);
    expect((await give('orgs', 'nothing.here', 'support')).statusCode).toBe(404);
    expect((await give('orgs', 'clinicone', 'support')).statusCode).toBe(404);
    await noor.post(`/v1/orgs/${org.id}/apps`, { name: 'Support', scopes: ['inbox:read'] });
    const bot = await t.ctx.db
      .selectFrom('users')
      .select('handle')
      .where('kind', '=', 'bot')
      .where('display_name', '=', 'Support')
      .executeTakeFirstOrThrow();
    expect((await give('people', bot.handle, 'support')).statusCode).toBe(404);
    const asOwner = await noor.req('PUT', '/v1/admin/orgs/caime/handle', { handle: 'support' });
    expect(asOwner.statusCode).toBe(401);
    const wrong = await t.app.inject({
      method: 'PUT',
      url: '/v1/admin/orgs/caime/handle',
      headers: { authorization: 'Bearer not-the-token' },
      payload: { handle: 'support' },
    });
    expect(wrong.statusCode).toBe(401);
    expect((await customer.get('/v1/orgs/by-handle/caime')).org.id).toBe(org.id);
  });

  it('two given one handle at once, a person and an organization, leave it with one', async () => {
    const pairs = await Promise.all(
      ['support', 'security', 'staff'].map(async (handle, i) => {
        const { org } = await noor.post('/v1/orgs', {
          country: 'EE',
          name: `Race ${i}`,
          handle: `race.org${i}`,
          kind: 'business',
        });
        const person = await signup(t, { displayName: `Racer ${i}` });
        return { handle, org, person };
      }),
    );
    const results = await Promise.all(
      pairs.flatMap(({ handle, org, person }) => [
        give('orgs', org.handle, handle),
        give('people', person.user.handle, handle),
      ]),
    );
    for (const [i, { handle }] of pairs.entries()) {
      const codes = [results[2 * i]!.statusCode, results[2 * i + 1]!.statusCode].sort();
      expect(codes, handle).toEqual([200, 409]);
      const holders = await Promise.all([
        t.ctx.db.selectFrom('users').select('id').where('handle', '=', handle).execute(),
        t.ctx.db.selectFrom('organizations').select('id').where('handle', '=', handle).execute(),
      ]);
      expect(holders.flat(), handle).toHaveLength(1);
    }
    // The same one given twice at once is given, both times.
    const twice = await signup(t, { displayName: 'Twice' });
    const both = await Promise.all([
      give('people', twice.user.handle, 'trust'),
      give('people', twice.user.handle, 'trust'),
    ]);
    expect(both.map((r) => r.statusCode)).toEqual([200, 200]);
    expect((await twice.get('/v1/me')).user.handle).toBe('trust');
  });
});
