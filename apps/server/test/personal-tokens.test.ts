import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let convo: string;

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}
const make = (c: Client, body: Record<string, unknown>) => c.req('POST', '/v1/me/tokens', body);
/** A request made with a token rather than a session. */
const as = (
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
) =>
  t.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(body ? { payload: body as object } : {}),
  });

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  convo = await connect(noor, sam);
});

afterAll(async () => {
  await t.close();
});

describe('personal access tokens (PRD §74)', () => {
  let token: string;

  it('act as their maker for their own scripts, shown once, and say what sent a message', async () => {
    const made = await make(noor, {
      name: 'Home script',
      scopes: ['messages:read', 'messages:write'],
      days: 30,
    });
    expect(made.statusCode).toBe(201);
    token = made.json().token;
    expect(token).toMatch(/^cap_[\w-]{32}$/);
    const { tokens } = await noor.get('/v1/me/tokens');
    expect(tokens).toEqual([
      expect.objectContaining({
        name: 'Home script',
        scopes: ['messages:read', 'messages:write'],
        prefix: token.slice(0, 10),
        expiresAt: new Date(t.clock.now.getTime() + 30 * 86_400_000).toISOString(),
      }),
    ]);
    expect(JSON.stringify(tokens)).not.toContain(token);

    expect((await as(token, 'GET', `/v1/conversations/${convo}/messages`)).statusCode).toBe(200);
    const sent = await as(token, 'POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      body: 'Reminder: the plumber comes at 10.',
    });
    expect(sent.statusCode).toBe(201);
    expect(sent.json().message).toMatchObject({ senderId: noor.user.id, sentVia: 'Home script' });
    // Sam sees it came from Noor, through her script.
    const { messages } = await sam.get(`/v1/conversations/${convo}/messages`);
    expect(messages.at(-1)).toMatchObject({ senderId: noor.user.id, sentVia: 'Home script' });
    // Only what it was given: reading Noor's profile isn't.
    expect((await as(token, 'GET', '/v1/me')).json().error.code).toBe('token_scope');
  });

  it('reach nothing about the account itself', async () => {
    const all = (
      await make(noor, {
        name: 'Everything',
        scopes: [
          'profile:read',
          'messages:read',
          'messages:write',
          'actions:read',
          'actions:write',
        ],
      })
    ).json().token;
    for (const [method, url, body] of [
      ['PATCH', '/v1/me', { displayName: 'Someone else' }],
      ['PUT', '/v1/me/privacy', { messageRequests: 'everyone' }],
      ['GET', '/v1/me/export', undefined],
      ['DELETE', '/v1/me', { password: 'correct horse battery' }],
      ['POST', '/v1/me/tokens', { name: 'Another', scopes: ['messages:read'] }],
      ['GET', '/v1/me/tokens', undefined],
      ['POST', '/v1/auth/password', { currentPassword: 'x', newPassword: 'y' }],
      ['POST', '/v1/blocks', { userId: sam.user.id }],
    ] as const) {
      const res = await as(all, method, url, body);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json().error.code, `${method} ${url}`).toBe('token_route');
    }
    // Its profile is who it acts for, not their email, privacy or plan.
    const { user } = (await as(all, 'GET', '/v1/me')).json();
    expect(Object.keys(user).sort()).toEqual([
      'avatarUrl',
      'displayName',
      'handle',
      'id',
      'locale',
      'timeZone',
    ]);
    expect((await as(all, 'GET', '/v1/tasks')).statusCode).toBe(200);
  });

  it('stop at once when revoked, when their time is up, or when the account is recovered', async () => {
    const { tokens } = await noor.get('/v1/me/tokens');
    const home = tokens.find((k: any) => k.name === 'Home script');
    expect((await noor.req('DELETE', `/v1/me/tokens/${home.id}`)).statusCode).toBe(200);
    expect((await as(token, 'GET', `/v1/conversations/${convo}/messages`)).statusCode).toBe(401);

    const short = (await make(noor, { name: 'Short', scopes: ['messages:read'], days: 30 })).json()
      .token;
    t.clock.advance(31 * 86_400_000);
    expect((await as(short, 'GET', `/v1/conversations/${convo}/messages`)).statusCode).toBe(401);

    const kept = (await make(noor, { name: 'Kept', scopes: ['messages:read'], days: null })).json()
      .token;
    expect((await as(kept, 'GET', `/v1/conversations/${convo}/messages`)).statusCode).toBe(200);
    const recovered = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/recover',
      payload: {
        identifier: noor.user.handle,
        code: noor.recoveryCodes[0],
        newPassword: 'a brand new passphrase',
        client: 'native',
      },
    });
    expect(recovered.statusCode).toBe(200);
    expect((await as(kept, 'GET', `/v1/conversations/${convo}/messages`)).statusCode).toBe(401);
  });

  it('are for adults', async () => {
    const teen = await signup(t, { displayName: 'Rami Young', birthDate: '2011-12-31' });
    const res = await make(teen, { name: 'Mine', scopes: ['messages:read'] });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toBe('Access tokens are for people over 18.');
  });
});
