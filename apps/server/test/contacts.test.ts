import { CONTACTS_MATCH_MAX } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * A contacts file into People (R79): the app reads the file on the device and asks the server
 * only who, of the addresses, is on Caime and findable by address. Nothing of the file is kept.
 */
let t: TestApp;
let noor: Client;
let sara: Client;
let omar: Client;
let blocked: Client;
let teen: Client;

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sara = await signup(t, { displayName: 'Sara Haddad', email: 'Sara@Partner.example' });
  omar = await signup(t, { displayName: 'Omar Quiet', email: 'omar@example.com' });
  blocked = await signup(t, { displayName: 'Blocked Person', email: 'blocked@example.com' });
  teen = await signup(t, {
    displayName: 'Teen Haddad',
    email: 'teen@example.com',
    birthDate: '2011-12-31',
  });
  // Findable by address is a choice (as search has it): Omar turned it off.
  await omar.req('PUT', '/v1/me/privacy', { discoverByEmail: false });
  await noor.post('/v1/blocks', { userId: blocked.user.id });
});

afterAll(async () => {
  await t.close();
});

describe('POST /v1/people/match', () => {
  it('finds who is on Caime by address: only those findable by it, never blocked, never under 18 to a stranger', async () => {
    const { matches } = await noor.post('/v1/people/match', {
      emails: [
        'sara@partner.example',
        'omar@example.com',
        'blocked@example.com',
        'teen@example.com',
        'nobody@example.com',
        `${noor.user.handle}@example.com`,
      ],
    });
    expect(matches).toEqual([
      {
        email: 'sara@partner.example',
        person: expect.objectContaining({ id: sara.user.id, displayName: 'Sara Haddad' }),
        connection: { state: 'none', connectionId: null, requestId: null },
      },
    ]);
    // A stranger found by address is a stranger still: nothing says they share anything.
    expect(matches[0].person.trust.level).not.toBe('known');
    // Nothing of a match says more than a search would: no email but the one sent.
    expect(JSON.stringify(matches)).not.toContain('omar@');
    // Omar turns it back on: found next time, with where things stand between them.
    await omar.req('PUT', '/v1/me/privacy', { discoverByEmail: true });
    await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
    const again = await noor.post('/v1/people/match', { emails: ['OMAR@example.com'] });
    expect(again.matches).toEqual([
      expect.objectContaining({
        email: 'omar@example.com',
        connection: expect.objectContaining({ state: 'outgoing' }),
      }),
    ]);
    // A minor finds a minor, as search lets them.
    const asTeen = await teen.post('/v1/people/match', { emails: ['sara@partner.example'] });
    expect(asTeen.matches.map((m: { email: string }) => m.email)).toEqual(['sara@partner.example']);
  });

  it('takes a page of addresses at a time, valid ones only, and never a token’s call', async () => {
    const tooMany = await noor.req('POST', '/v1/people/match', {
      emails: Array.from({ length: CONTACTS_MATCH_MAX + 1 }, (_, i) => `p${i}@example.com`),
    });
    expect(tooMany.statusCode).toBe(400);
    expect(
      (await noor.req('POST', '/v1/people/match', { emails: ['not an address'] })).statusCode,
    ).toBe(400);
    expect((await noor.req('POST', '/v1/people/match', { emails: [] })).statusCode).toBe(400);
    const page = await noor.post('/v1/people/match', {
      emails: Array.from({ length: CONTACTS_MATCH_MAX }, (_, i) => `p${i}@example.com`),
    });
    expect(page.matches).toEqual([]);
    const made = await noor.post('/v1/me/tokens', { name: 'script', scopes: ['profile:read'] });
    const asToken = await t.app.inject({
      method: 'POST',
      url: '/v1/people/match',
      headers: { authorization: `Bearer ${made.token}` },
      payload: { emails: ['sara@partner.example'] },
    });
    expect(asToken.statusCode).toBe(403);
    expect(asToken.json().error.code).toBe('token_route');
  });
});
