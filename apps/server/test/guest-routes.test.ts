/**
 * A guest can do nothing else (R84 (2)): a provisional person's session is refused on every
 * route of the API but the guest's own, by one guard in the auth plugin. This walks every
 * registered route, so a route added later fails here until it's closed to guests or listed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GUEST_ROUTES, routeKey } from '../src/lib/guest-routes';
import { registeredRoutes } from '../src/plugins/auth';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let guest: Client;
let person: Client;

const ID = '00000000-0000-4000-8000-000000000001';
const filled = (url: string) =>
  url
    .replace(/\*$/, 'x')
    .replace(/:(\w+)\.ics$/, 'x.ics')
    .replace(/:(\w+)/g, ID);

beforeAll(async () => {
  t = await createTestApp();
  person = await signup(t, { displayName: 'Hana Host' });
  guest = await signup(t, { displayName: 'Gus Guest' });
  // A guest is a provisional person with a session (R75, R84).
  await t.ctx.db
    .updateTable('users')
    .set({ kind: 'provisional' })
    .where('id', '=', guest.user.id)
    .execute();
});
afterAll(async () => {
  await t.close();
});

describe('a guest can do nothing else (R84)', () => {
  it('lists only routes that exist', () => {
    const all = new Set(registeredRoutes(t.app).map((r) => routeKey(r.method, r.url)));
    for (const key of GUEST_ROUTES) expect(all.has(key), key).toBe(true);
  });

  it('is refused on every other route of the API, before the route runs', async () => {
    const routes = registeredRoutes(t.app).filter(
      (r) =>
        r.url.startsWith('/v1/') &&
        r.method !== 'HEAD' &&
        r.method !== 'OPTIONS' &&
        !GUEST_ROUTES.has(routeKey(r.method, r.url)),
    );
    expect(routes.length).toBeGreaterThan(100);
    const open: string[] = [];
    for (const r of routes) {
      const res = await guest.req(
        r.method as never,
        filled(r.url),
        r.method === 'GET' ? undefined : {},
      );
      // Refused by the guard, in the API's shape (`guest_route`) or, on OAuth's two form
      // endpoints, in RFC 6749's, which carries the same words.
      const refused = res.statusCode === 403 && res.body.includes('A guest can’t do this.');
      if (!refused) open.push(`${routeKey(r.method, r.url)} → ${res.statusCode}`);
    }
    expect(open).toEqual([]);
  });

  it('may see its session and sign out; a person on Caime is untouched', async () => {
    expect((await guest.req('GET', '/v1/auth/session')).statusCode).toBe(200);
    expect((await person.req('GET', '/v1/me')).statusCode).toBe(200);
    expect((await guest.req('GET', '/v1/me')).statusCode).toBe(403);
    expect((await guest.req('POST', '/v1/auth/logout', {})).statusCode).toBe(200);
    expect((await guest.req('GET', '/v1/auth/session')).statusCode).not.toBe(200);
  });
});
