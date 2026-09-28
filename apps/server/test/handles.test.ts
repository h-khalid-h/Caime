import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const ADMIN = 'operator-token-for-the-handles-test-0123456789';

let t: TestApp;
let noor: Client;
let sara: Client;
let quiet: Client;
let teen: Client;
let teen2: Client;
let blocker: Client;

beforeAll(async () => {
  t = await createTestApp({ ADMIN_TOKEN: ADMIN });
  noor = await signup(t, { displayName: 'Noor Haddad', handle: 'noor.links' });
  sara = await signup(t, { displayName: 'Sara Ali', handle: 'sara.links' });
  quiet = await signup(t, { displayName: 'Quiet Person', handle: 'quiet.links' });
  teen = await signup(t, {
    displayName: 'Rami Young',
    handle: 'rami.links',
    birthDate: '2011-12-31',
  });
  teen2 = await signup(t, {
    displayName: 'Dina Young',
    handle: 'dina.links',
    birthDate: '2012-12-31',
  });
  blocker = await signup(t, { displayName: 'Blocker', handle: 'blocker.links' });
  await quiet.req('PUT', '/v1/me/privacy', { discoverByHandle: false });
  await blocker.post('/v1/blocks', { userId: noor.user.id });
});
afterAll(async () => {
  await t.close();
});

const open = (who: Client, handle: string) =>
  who.req('GET', `/v1/handles/${encodeURIComponent(handle)}`);

/** The operator giving `person` (by their handle now) a reserved handle. */
const give = (person: string, body: unknown, token = ADMIN) =>
  t.app.inject({
    method: 'PUT',
    url: `/v1/admin/people/${person}/handle`,
    headers: { authorization: `Bearer ${token}` },
    payload: body as object,
  });

describe('@handle links', () => {
  it('open a person or an organization, however the handle is typed', async () => {
    expect((await open(noor, '@Sara.Links')).json()).toEqual({
      kind: 'person',
      id: sara.user.id,
      handle: 'sara.links',
    });
    const { org } = await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Links Clinic',
      handle: 'links.clinic',
      kind: 'clinic',
    });
    expect((await open(sara, 'links.clinic')).json()).toEqual({
      kind: 'org',
      id: org.id,
      handle: 'links.clinic',
    });
    expect((await open(noor, 'noor.links')).json().kind).toBe('person');
  });

  it('find a person only as search would', async () => {
    // Nobody by that name, not a handle at all, and somebody who can't be found read the same.
    const missing = await open(noor, 'nobody.here');
    const hidden = await open(noor, 'quiet.links');
    expect(missing.statusCode).toBe(404);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual(missing.json());
    expect((await open(noor, 'x')).statusCode).toBe(404);
    // Someone who blocked you isn't there; someone you blocked is, so you can unblock them.
    expect((await open(noor, 'blocker.links')).statusCode).toBe(404);
    expect((await open(blocker, 'noor.links')).statusCode).toBe(200);
    // Adults never find under-18s; other under-18s can.
    expect((await open(noor, 'rami.links')).statusCode).toBe(404);
    expect((await open(teen2, 'rami.links')).json().id).toBe(teen.user.id);
    // Once you're in touch, you always can.
    await quiet.post('/v1/connections/requests', { toUserId: noor.user.id });
    expect((await open(noor, 'quiet.links')).statusCode).toBe(200);
    expect((await t.app.inject({ url: '/v1/handles/sara.links' })).statusCode).toBe(401);
  });
});

describe('reserved handles (R35)', () => {
  it('a handle change can’t take one, and is told so as for one that’s taken', async () => {
    const taken = await noor.req('PATCH', '/v1/me', { handle: 'sara.links' });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({
      error: { code: 'handle_taken', message: 'That handle isn’t available.' },
    });
    for (const handle of ['caime', 'Caime', 'caime.support', 'cai.me', 'help', 'lumi', 'you']) {
      const reserved = await noor.req('PATCH', '/v1/me', { handle });
      expect(reserved.statusCode, handle).toBe(409);
      expect(reserved.json(), handle).toEqual(taken.json());
    }
    expect((await noor.get('/v1/me')).user.handle).toBe('noor.links');
  });

  it('someone who had one before it was reserved keeps it until they change it', async () => {
    // An account from before the list: the rest of the profile still changes.
    await t.ctx.db
      .updateTable('users')
      .set({ handle: 'staff' })
      .where('id', '=', sara.user.id)
      .execute();
    const kept = await sara.req('PATCH', '/v1/me', { handle: 'staff', bio: 'Still me' });
    expect(kept.statusCode).toBe(200);
    expect(kept.json().user).toMatchObject({ handle: 'staff', bio: 'Still me' });
    // Once changed, it's nobody's to take, theirs included.
    await sara.patch('/v1/me', { handle: 'sara.links' });
    expect((await sara.req('PATCH', '/v1/me', { handle: 'staff' })).statusCode).toBe(409);
  });

  it('only the operator gives one to a person, and only while nobody else has it', async () => {
    // Without ADMIN_TOKEN the route isn't there, as a route that never was.
    t.ctx.config.ADMIN_TOKEN = undefined;
    const absent = await give('noor.links', { handle: 'caime' });
    t.ctx.config.ADMIN_TOKEN = ADMIN;
    expect(absent.statusCode).toBe(404);
    expect(absent.json().error.message).toBe('No route for PUT /v1/admin/people/noor.links/handle');
    expect((await give('noor.links', { handle: 'caime' }, 'not-the-token')).statusCode).toBe(401);
    const asHerself = await noor.req('PUT', '/v1/admin/people/noor.links/handle', {
      handle: 'caime',
    });
    expect(asHerself.statusCode).toBe(401);
    // Only a reserved one: any other, whoever wants it takes it themselves.
    const ordinary = await give('noor.links', { handle: 'noor.haddad' });
    expect(ordinary.statusCode).toBe(400);
    expect(ordinary.json().error.message).toMatch(/isn’t reserved/);
    expect((await give('noor.links', { handle: 'x' })).statusCode).toBe(400);
    expect((await give('nobody.here', { handle: 'caime' })).statusCode).toBe(404);
    // Nor an account marked deleted.
    const gone = await signup(t, { displayName: 'Gone Person', handle: 'gone.links' });
    await t.ctx.db
      .updateTable('users')
      .set({ deleted_at: t.clock.now })
      .where('id', '=', gone.user.id)
      .execute();
    expect((await give('gone.links', { handle: 'support' })).statusCode).toBe(404);
    expect((await noor.get('/v1/me')).user.handle).toBe('noor.links');

    const heard: BusMessage[] = [];
    const stop = t.ctx.bus.subscribe((m) => heard.push(m));
    const given = await give('@Noor.Links', { handle: 'Caime' });
    expect(given.statusCode).toBe(200);
    expect(given.json()).toEqual({ kind: 'person', id: noor.user.id, handle: 'caime' });
    expect((await noor.get('/v1/me')).user.handle).toBe('caime');
    // Her open devices are told, as when she changes it herself.
    const told = () =>
      heard.some((m) => m.event.type === 'me.updated' && m.userIds[0] === noor.user.id);
    for (let i = 0; i < 100 && !told(); i++) await new Promise((r) => setTimeout(r, 20));
    stop();
    expect(told()).toBe(true);
    expect((await open(sara, '@caime')).json()).toEqual(given.json());
    // Given again, nothing changes.
    expect((await give('caime', { handle: 'caime' })).json()).toEqual(given.json());
    const logged = await t.ctx.db
      .selectFrom('audit_log')
      .select(['actor_id', 'target', 'metadata'])
      .where('action', '=', 'handle.claimed')
      .execute();
    expect(logged).toEqual([
      {
        actor_id: null,
        target: noor.user.id,
        metadata: { of: 'person', from: 'noor.links', to: 'caime' },
      },
    ]);
    // It's in her data, without where the operator did it from.
    const archive = (await noor.req('GET', '/v1/me/export')).json();
    expect(archive.securityRecords).toContainEqual(
      expect.objectContaining({
        action: 'handle.claimed',
        byYou: false,
        networkAddress: null,
        details: { of: 'person', from: 'noor.links', to: 'caime' },
      }),
    );
    // Nobody else is given it, and the handle she had is anyone's again.
    const second = await give('sara.links', { handle: 'caime' });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('handle_taken');
    expect((await sara.get('/v1/me')).user.handle).toBe('sara.links');
    const old = await t.app.inject({ url: '/v1/me/handle-available?handle=noor.links' });
    expect(old.json().available).toBe(true);
  });
});
