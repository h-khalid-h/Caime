import { uuidv4 } from '@caime/core';
import sharp from 'sharp';
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

/** An image uploaded by `c`, as the app uploads one. */
async function uploadImage(c: Client, name: string) {
  const data = await sharp({
    create: { width: 320, height: 320, channels: 3, background: '#7a3ff2' },
  })
    .jpeg()
    .toBuffer();
  const boundary = `----caime${uuidv4()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/files',
    payload,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${c.token}`,
    },
  });
  if (res.statusCode !== 201) throw new Error(`${res.statusCode} ${res.body}`);
  return res.json().file as { id: string };
}

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
    // On a profile, the organizations someone is on the team of (R43), as they joined them.
    const orgsOf = async (viewer: Client, person: Client) =>
      (await viewer.get(`/v1/people/${person.user.id}`)).organizations.map((o: any) => o.handle);
    expect(await orgsOf(customer, omar)).toEqual(['datac', 'datac.real']);
    expect(await orgsOf(customer, sara)).toEqual(['datac']);
    // Where someone works is one of their professional details: hidden, so is this.
    await omar.req('PUT', '/v1/me/privacy', { fields: { identityDetails: { kind: 'nobody' } } });
    expect(await orgsOf(customer, omar)).toEqual([]);
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

  it('its logo: an image of the owner’s or an admin’s own upload, shown to everyone', async () => {
    const before = (await customer.get('/v1/orgs/by-handle/datac')).org;
    expect(before.avatarUrl).toBeNull();
    // Not any file: an image the person uploaded themselves.
    const theirs = await uploadImage(omar, 'omar.jpg');
    const notMine = await sara.req('PATCH', `/v1/orgs/${orgId}`, {
      avatarFileId: theirs.id,
    });
    expect(notMine.statusCode).toBe(400);
    expect(notMine.json().error.message).toBe('Choose an image you uploaded.');
    // The team's admin sets it, and it's on the page, in a customer's view, and in the
    // conversation, for a customer as for the team.
    const logo = await uploadImage(sara, 'logo.jpg');
    const { org } = await sara
      .req('PATCH', `/v1/orgs/${orgId}`, { avatarFileId: logo.id })
      .then((r) => r.json());
    expect(org.avatarUrl).toBe(`/v1/orgs/${orgId}/avatar?v=${logo.id.slice(-8)}`);
    expect((await customer.get('/v1/orgs/by-handle/datac')).org.avatarUrl).toBe(org.avatarUrl);
    const shown = await t.app.inject({
      url: org.avatarUrl,
      headers: { authorization: `Bearer ${customer.token}` },
    });
    expect(shown.statusCode).toBe(200);
    expect(shown.headers['content-type']).toBe('image/webp');
    // Its logo is on its public page (R44): no sign-in needed for a link card to show it.
    expect((await t.app.inject({ url: org.avatarUrl })).statusCode).toBe(200);
    const convo = (await customer.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
    const { conversation } = await customer.get(`/v1/conversations/${convo}`);
    expect(conversation.business.org.avatarUrl).toBe(org.avatarUrl);
    // Taken away: the page shows its kind again, and the picture is gone.
    const cleared = (await sara.req('PATCH', `/v1/orgs/${orgId}`, { avatarFileId: null })).json()
      .org;
    expect(cleared.avatarUrl).toBeNull();
    expect(
      (
        await t.app.inject({
          url: org.avatarUrl,
          headers: { authorization: `Bearer ${customer.token}` },
        })
      ).statusCode,
    ).toBe(404);
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
      {
        target: org.id,
        metadata: { of: 'organization', from: 'our.product', to: 'caime', operator: 'operator' },
      },
    ]);
    // Nobody takes it from it: not a person, not another organization, not the operator.
    expect((await omar.req('PATCH', '/v1/me', { handle: 'caime' })).statusCode).toBe(409);
    expect((await create(omar, 'caime')).statusCode).toBe(409);
    const again = await give('people', omar.user.handle, 'caime');
    expect(again.statusCode).toBe(409);
    expect((await omar.get('/v1/me')).user.handle).toBe(omar.user.handle);
    // Only a reserved or held handle, only for an organization that's open, never for an app's
    // bot, and only by the operator. The one it had is held now.
    expect((await give('orgs', 'caime', 'nobody.has.this')).statusCode).toBe(400);
    expect((await create(omar, 'our.product')).statusCode).toBe(409);
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
    // The same one given twice at once is given, both times (and what it had, held once).
    const twice = await signup(t, { displayName: 'Twice' });
    const both = await Promise.all([
      give('people', twice.user.handle, 'trust'),
      give('people', twice.user.handle, 'trust'),
    ]);
    expect(both.map((r) => r.statusCode)).toEqual([200, 200]);
    expect((await twice.get('/v1/me')).user.handle).toBe('trust');
    const had = await t.ctx.db
      .selectFrom('released_handles')
      .select('handle')
      .where('handle', '=', twice.user.handle)
      .execute();
    expect(had).toEqual([{ handle: twice.user.handle }]);
  });

  it('a closed organization never verified lets its handle go, held a year like anyone’s', async () => {
    // Clinic One closed when its last member left, and was never verified: the hold is the
    // same as for a person's, so a year on it's anyone's.
    expect((await create(omar, 'clinicone')).statusCode).toBe(409);
    expect((await omar.req('PATCH', '/v1/me', { handle: 'clinicone' })).statusCode).toBe(409);
    const held = await t.ctx.db
      .selectFrom('released_handles')
      .select('handle')
      .where('handle', '=', 'clinicone')
      .execute();
    expect(held).toEqual([{ handle: 'clinicone' }]);
    const was = t.clock.now.toISOString();
    try {
      t.clock.set('2031-01-01T00:00:00Z');
      const later = await signup(t, { displayName: 'Much Later' });
      const check = await t.app.inject({ url: '/v1/me/handle-available?handle=clinicone' });
      expect(check.json()).toEqual({ available: true, reason: null, suggestion: null });
      const made = await create(later, 'clinicone');
      expect(made.statusCode).toBe(201);
      expect((await later.get('/v1/orgs/by-handle/clinicone')).org.id).toBe(made.json().org.id);
    } finally {
      t.clock.set(was);
    }
  });
});

describe('closing and taking back an organization (R42)', () => {
  let bakery: Client;
  let closedId: string;
  let convo: string;

  it('its owner closes it: page gone, seats ended, customers keep what they were sent', async () => {
    bakery = await signup(t, { displayName: 'Bassem Baker' });
    const { org } = await bakery.post('/v1/orgs', {
      country: 'EG',
      name: 'Bassem’s Bakery',
      handle: 'bakery',
      kind: 'shop',
      about: 'Bread since 1990.',
    });
    closedId = org.id;
    const { domain } = (
      await bakery
        .req('PUT', `/v1/orgs/${org.id}/domain`, {
          domain: 'bakery.example',
        })
        .then((r) => r.json())
    ).org;
    txt.set('_caime-verify.bakery.example', [[domain.record.value]]);
    expect((await bakery.post(`/v1/orgs/${org.id}/domain/check`)).org.verified).toBe(true);
    // A customer writes, and is answered.
    convo = (await customer.post(`/v1/orgs/${org.id}/conversations`)).conversationId;
    await customer.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      body: 'Rye?',
    });
    const threads = (await bakery.get(`/v1/orgs/${org.id}/inbox`)).threads;
    expect(threads.map((th: any) => th.conversationId)).toEqual([convo]);
    await bakery.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      body: 'Every morning.',
    });

    // Only the owner closes it.
    expect((await omar.req('POST', `/v1/orgs/${org.id}/close`)).statusCode).toBe(403);
    expect((await bakery.req('POST', `/v1/orgs/${org.id}/close`)).statusCode).toBe(200);
    expect((await customer.req('GET', `/v1/orgs/by-handle/bakery`)).statusCode).toBe(404);
    expect((await bakery.req('GET', `/v1/orgs/${org.id}`)).statusCode).toBe(404);
    expect((await bakery.get('/v1/orgs')).orgs.map((o: any) => o.handle)).not.toContain('bakery');
    // The customer still reads it, and nobody writes there anymore.
    const { messages } = await customer.get(`/v1/conversations/${convo}/messages`);
    expect(messages.map((m: any) => m.body)).toEqual(['Rye?', 'Every morning.']);
    const more = await customer.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      body: 'Still there?',
    });
    expect(more.statusCode).toBe(409);
    expect(more.json().error.code).toBe('org_closed');
    expect(
      (
        await bakery.req('POST', `/v1/conversations/${convo}/messages`, {
          clientId: uuidv4(),
          body: 'No.',
        })
      ).statusCode,
    ).not.toBe(201);
    const logged = await t.ctx.db
      .selectFrom('audit_log')
      .select(['target', 'metadata'])
      .where('action', '=', 'org.closed')
      .execute();
    expect(logged).toEqual([{ target: org.id, metadata: { handle: 'bakery', verified: true } }]);
  });

  it('verified, its handle waits for whoever proves the domain again, and says so', async () => {
    const taken = await omar.req('POST', '/v1/orgs', {
      country: 'EG',
      name: 'Bakery',
      handle: 'bakery',
      kind: 'shop',
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error).toMatchObject({
      code: 'handle_closed_org',
      message:
        'It belongs to Bassem’s Bakery, which closed. If you’re Bassem’s Bakery, verify bakery.example to take it back.',
      details: { closedOrg: { id: closedId, name: 'Bassem’s Bakery', domain: 'bakery.example' } },
    });
    // A person can't have it either, and is told the same.
    expect((await omar.req('PATCH', '/v1/me', { handle: 'bakery' })).json().error.code).toBe(
      'handle_closed_org',
    );
    const check = await t.app.inject({ url: '/v1/me/handle-available?handle=bakery' });
    expect(check.json()).toMatchObject({
      available: false,
      closedOrg: { id: closedId, name: 'Bassem’s Bakery', domain: 'bakery.example' },
    });
    expect(check.json().suggestion).toMatch(/^bakery\d+$/);
    // It holds however long: years on, still.
    const was = t.clock.now.toISOString();
    try {
      t.clock.set('2031-06-01T00:00:00Z');
      const later = await signup(t, { displayName: 'Years Later' });
      expect((await later.req('PATCH', '/v1/me', { handle: 'bakery' })).json().error.code).toBe(
        'handle_closed_org',
      );
    } finally {
      t.clock.set(was);
    }
    // Never verified: nothing to prove.
    const clinic = await t.ctx.db
      .selectFrom('organizations')
      .select('id')
      .where('handle', '=', 'clinicone')
      .where('archived_at', 'is not', null)
      .executeTakeFirstOrThrow();
    const nothing = await omar.req('POST', `/v1/orgs/${clinic.id}/reclaim`);
    expect(nothing.statusCode).toBe(409);
    expect(nothing.json().error.code).toBe('not_reclaimable');
  });

  it('proving the domain again continues it: same handle and page, a new team', async () => {
    const back = await signup(t, { displayName: 'Bassem Again' });
    expect((await teen.req('POST', `/v1/orgs/${closedId}/reclaim`)).statusCode).toBe(403);
    const started = await back.post(`/v1/orgs/${closedId}/reclaim`);
    expect(started).toMatchObject({
      org: { id: closedId, name: 'Bassem’s Bakery', handle: 'bakery' },
      domain: 'bakery.example',
      record: { name: '_caime-verify.bakery.example', type: 'TXT' },
    });
    expect(started.record.value).toMatch(/^caime-verify=[\w-]{20,}$/);
    // The old record is still there: it doesn't count (it was made for someone else).
    const stale = await back.req('POST', `/v1/orgs/${closedId}/reclaim/check`);
    expect(stale.statusCode).toBe(422);
    expect(stale.json().error.code).toBe('record_not_found');
    // Someone else can't check with this person's record.
    expect((await omar.req('POST', `/v1/orgs/${closedId}/reclaim/check`)).statusCode).toBe(400);
    txt.set('_caime-verify.bakery.example', [[started.record.value]]);
    const checked = await back.req('POST', `/v1/orgs/${closedId}/reclaim/check`);
    expect(checked.statusCode).toBe(201);
    const org = checked.json().org;
    expect(org).toMatchObject({
      handle: 'bakery',
      name: 'Bassem’s Bakery',
      about: 'Bread since 1990.',
      verified: true,
      verifiedDomain: 'bakery.example',
      myRole: 'owner',
      memberCount: 1,
    });
    expect(org.id).not.toBe(closedId);
    expect((await customer.get('/v1/orgs/by-handle/bakery')).org.id).toBe(org.id);
    // The old one is done with: not reclaimable twice, and its page is the new one's.
    expect((await omar.req('POST', `/v1/orgs/${closedId}/reclaim`)).statusCode).toBe(404);
    // The customer's old conversation stays read-only; a new one is with the new organization.
    expect(
      (
        await customer.req('POST', `/v1/conversations/${convo}/messages`, {
          clientId: uuidv4(),
          body: 'Back?',
        })
      ).json().error.code,
    ).toBe('org_closed');
    const fresh = (await customer.post(`/v1/orgs/${org.id}/conversations`)).conversationId;
    expect(fresh).not.toBe(convo);
    await customer.post(`/v1/conversations/${fresh}/messages`, {
      clientId: uuidv4(),
      body: 'Back?',
    });
    const inbox = (await back.get(`/v1/orgs/${org.id}/inbox`)).threads;
    expect(inbox.map((th: any) => th.conversationId)).toEqual([fresh]);
    // The bakery's handle is nobody else's, and the domain is the new one's alone.
    const again = await omar.req('POST', '/v1/orgs', {
      country: 'EG',
      name: 'Bakery',
      handle: 'bakery',
      kind: 'shop',
    });
    expect(again.json().error.code).toBe('handle_taken');
    const logged = await t.ctx.db
      .selectFrom('audit_log')
      .select(['target', 'metadata'])
      .where('action', '=', 'org.reclaimed')
      .execute();
    expect(logged).toEqual([
      { target: org.id, metadata: { from: closedId, domain: 'bakery.example', handle: 'bakery' } },
    ]);
  });

  it('the operator deletes a closed organization for good; never an open one', async () => {
    const del = (id: string) =>
      t.app.inject({
        method: 'DELETE',
        url: `/v1/admin/orgs/${id}`,
        headers: { authorization: `Bearer ${ADMIN}` },
      });
    const open = (await customer.get('/v1/orgs/by-handle/bakery')).org.id;
    const refused = await del(open);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('org_open');
    expect(
      (await t.app.inject({ method: 'DELETE', url: `/v1/admin/orgs/${closedId}` })).statusCode,
    ).toBe(401);
    expect((await del(closedId)).statusCode).toBe(200);
    // The customer's conversation with it went with it.
    expect((await customer.req('GET', `/v1/conversations/${convo}/messages`)).statusCode).toBe(404);
    expect((await customer.get('/v1/orgs/by-handle/bakery')).org.id).toBe(open);
    // A closed one nobody continued: its handle is held a year, like a person's.
    const clinic = await t.ctx.db
      .selectFrom('organizations')
      .select('id')
      .where('handle', '=', 'clinicone')
      .where('archived_at', 'is not', null)
      .executeTakeFirstOrThrow();
    expect((await del(clinic.id)).statusCode).toBe(200);
    expect((await del(clinic.id)).statusCode).toBe(404);
    expect(
      await t.ctx.db
        .selectFrom('released_handles')
        .select('handle')
        .where('handle', '=', 'clinicone')
        .execute(),
    ).toEqual([{ handle: 'clinicone' }]);
  });
});
