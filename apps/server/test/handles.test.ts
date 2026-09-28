import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sara: Client;
let quiet: Client;
let teen: Client;
let teen2: Client;
let blocker: Client;

beforeAll(async () => {
  t = await createTestApp();
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
