import { uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let alex: Client;
let convo: string;

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  alex = await signup(t, { displayName: 'Alex Kim' });
  const r = await noor.post('/v1/connections/requests', { toUserId: alex.user.id });
  convo = (await alex.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
});

/** A call with Alex's session that the app meant as `as`. */
const asIf = (as: string | null, method: 'GET' | 'POST', url: string, body?: object) =>
  t.app.inject({
    method,
    url,
    payload: body,
    headers: {
      authorization: `Bearer ${alex.token}`,
      ...(as ? { 'x-caishy-user': as } : {}),
    },
  });

describe('a call meant as one account never acts as another', () => {
  it('is refused when someone else is signed in, and nothing is done', async () => {
    const said = { clientId: uuidv4(), kind: 'text', body: 'Queued by Noor' };
    const refused = await asIf(noor.user.id, 'POST', `/v1/conversations/${convo}/messages`, said);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('wrong_account');
    const messages = (await alex.get(`/v1/conversations/${convo}/messages`)).messages;
    expect(messages.some((m: any) => m.body === 'Queued by Noor')).toBe(false);
    // Reading too: nothing of Alex's reaches a tab showing Noor's account.
    expect((await asIf(noor.user.id, 'GET', '/v1/inbox')).statusCode).toBe(409);
  });

  it('goes ahead as whoever it says, and as anyone when it says nothing', async () => {
    const own = await asIf(alex.user.id, 'POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body: 'From Alex',
    });
    expect(own.statusCode).toBe(201);
    expect((await asIf(null, 'GET', '/v1/inbox')).statusCode).toBe(200);
  });

  it('holds for a browser signed in by its cookie too', async () => {
    const login = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { identifier: alex.user.handle, password: 'correct horse battery', client: 'web' },
    });
    expect(login.statusCode, login.body).toBe(200);
    const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: { title: 'As Noor' },
      headers: { cookie, 'x-caishy-client': 'web', 'x-caishy-user': noor.user.id },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('wrong_account');
  });
});
