import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { assertHandleAvailable, releaseHandle } from '../src/lib/handles';
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
    // Only a reserved or held one: any other, whoever wants it takes it themselves.
    const ordinary = await give('noor.links', { handle: 'noor.haddad' });
    expect(ordinary.statusCode).toBe(400);
    expect(ordinary.json().error.message).toMatch(/isn’t reserved or held/);
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
    // Nobody else is given it, and the handle she had is held from everyone…
    const second = await give('sara.links', { handle: 'caime' });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('handle_taken');
    expect((await sara.get('/v1/me')).user.handle).toBe('sara.links');
    const old = await t.app.inject({ url: '/v1/me/handle-available?handle=noor.links' });
    expect(old.json()).toMatchObject({ available: false, reason: 'That handle isn’t available.' });
    // …but the operator can give it back, once she's shown it was hers. It's held no more, and
    // @caime, reserved, needs no hold to stay the operator's to give.
    const back = await give('caime', { handle: 'noor.links' });
    expect(back.json()).toEqual({ kind: 'person', id: noor.user.id, handle: 'noor.links' });
    const held = await t.ctx.db
      .selectFrom('released_handles')
      .select('handle')
      .where('handle', 'in', ['noor.links', 'caime'])
      .execute();
    expect(held).toEqual([]);
    expect((await give('sara.links', { handle: 'caime' })).statusCode).toBe(200);
  });
});

describe('handles let go of (R35)', () => {
  it('is nobody’s even at the moment it’s let go of', async () => {
    // A handle change commits between the two looks a check takes, whether someone has it and
    // whether it's held: in that order, one of them always finds it.
    const mona = await signup(t, { displayName: 'Mona Moves', handle: 'mona.moves' });
    let changed!: () => void;
    const ready = new Promise<void>((r) => (changed = r));
    let letGo!: () => void;
    const commit = new Promise<void>((r) => (letGo = r));
    const change = t.ctx.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('users')
        .set({ handle: 'mona.moved' })
        .where('id', '=', mona.user.id)
        .execute();
      await releaseHandle(trx, 'mona.moves', t.clock.now);
      changed();
      await commit;
    });
    await ready;
    let first = true;
    const racing = t.ctx.db.withPlugin({
      transformQuery: ({ node }) => node,
      async transformResult({ result }) {
        if (first) {
          first = false;
          letGo();
          await change;
        }
        return result;
      },
    });
    await expect(assertHandleAvailable(racing, 'mona.moves', t.clock.now)).rejects.toMatchObject({
      code: 'handle_taken',
    });
  });

  const signUpAs = (handle: string) =>
    t.app.inject({
      method: 'POST',
      url: '/v1/auth/signup',
      payload: {
        email: `${handle}.held@example.com`,
        password: 'correct horse battery',
        displayName: 'Someone Else',
        handle,
        birthDate: '1990-12-31',
        country: 'EG',
        client: 'native',
      },
    });

  it('one changed from is held from everyone for a year, whoever had it included', async () => {
    const rana = await signup(t, { displayName: 'Rana Changes', handle: 'rana.before' });
    const omar = await signup(t, { displayName: 'Omar Other', handle: 'omar.other' });
    // Changing the rest of a profile, or sending the handle as it is, lets go of nothing.
    await omar.patch('/v1/me', { bio: 'Hello', handle: 'omar.other' });
    const kept = await t.ctx.db
      .selectFrom('released_handles')
      .select('handle')
      .where('handle', '=', 'omar.other')
      .execute();
    expect(kept).toEqual([]);
    expect((await rana.patch('/v1/me', { handle: 'rana.after' })).user.handle).toBe('rana.after');
    const taken = await omar.req('PATCH', '/v1/me', { handle: 'rana.after' });
    expect(taken.statusCode).toBe(409);
    // A handle change, hers or anyone's; a new organization; a sign-up: as for a taken one.
    for (const held of [
      await omar.req('PATCH', '/v1/me', { handle: 'rana.before' }),
      await rana.req('PATCH', '/v1/me', { handle: 'rana.before' }),
      await omar.req('POST', '/v1/orgs', {
        country: 'EG',
        name: 'Rana Before',
        handle: 'rana.before',
        kind: 'shop',
      }),
      await signUpAs('rana.before'),
    ]) {
      expect(held.statusCode).toBe(409);
      expect(held.json()).toEqual(taken.json());
    }
    const check = (
      await t.app.inject({ url: '/v1/me/handle-available?handle=rana.before' })
    ).json();
    expect(check).toMatchObject({ available: false, reason: 'That handle isn’t available.' });
    expect(check.suggestion).toMatch(/^rana\.before\d+$/);
    // The handle and the days: nothing says whose it was.
    const rows = await t.ctx.db
      .selectFrom('released_handles')
      .selectAll()
      .where('handle', '=', 'rana.before')
      .execute();
    expect(rows).toEqual([
      { handle: 'rana.before', released_on: '2026-09-23', held_until: '2027-09-23' },
    ]);
    const was = t.clock.now.toISOString();
    try {
      // The day before a year is up it's still held; on the day, it's anyone's. (Someone new
      // tries: a year on, the others' sign-ins have ended.)
      t.clock.set('2027-09-22T23:59:00Z');
      const later = await signup(t, { displayName: 'Later On', handle: 'later.on' });
      expect((await later.req('PATCH', '/v1/me', { handle: 'rana.before' })).statusCode).toBe(409);
      t.clock.set('2027-09-23T00:00:00Z');
      const free = await t.app.inject({ url: '/v1/me/handle-available?handle=rana.before' });
      expect(free.json()).toEqual({ available: true, reason: null, suggestion: null });
      expect((await later.req('PATCH', '/v1/me', { handle: 'rana.before' })).statusCode).toBe(200);
      // And the one they had is held from then.
      expect((await signUpAs('later.on')).statusCode).toBe(409);
      // Let go of again (its old hold not yet swept away), it's held a year from now.
      await later.patch('/v1/me', { handle: 'later.again' });
      expect((await signUpAs('rana.before')).statusCode).toBe(409);
      const again = await t.ctx.db
        .selectFrom('released_handles')
        .select(['released_on', 'held_until'])
        .where('handle', '=', 'rana.before')
        .execute();
      expect(again).toEqual([{ released_on: '2027-09-23', held_until: '2028-09-22' }]);
    } finally {
      t.clock.set(was);
    }
  });
});
