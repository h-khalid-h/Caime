import { createHmac } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { type AddressInfo, createServer as createTcpServer } from 'node:net';
import { parseSignature, uuidv4 } from '@caishy/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkWebhookUrl, isPrivateAddress, postWebhook } from '../src/lib/apps';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owner
let omar: Client; // team
let lina: Client; // customer
let orgId: string;
let otherOrgId: string;
let convo: string;
let hook: Server;
let hookUrl: string;
/** What the organization's endpoint received, and what it answers next. */
const received: Array<{ headers: IncomingHttpHeaders; body: string }> = [];
const answers: number[] = [];
const ALL = ['inbox:read', 'messages:read', 'messages:write', 'threads:write'];

const as = (token: string, method: 'GET' | 'POST', url: string, body?: unknown) =>
  t.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(body ? { payload: body as object } : {}),
  });
async function deliver() {
  await runDueJobs(t.ctx);
  return received.at(-1);
}

beforeAll(async () => {
  hook = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ headers: req.headers, body });
    res.writeHead(answers.shift() ?? 200).end('ok');
  });
  await new Promise<void>((done) => hook.listen(0, '127.0.0.1', done));
  hookUrl = `http://127.0.0.1:${(hook.address() as AddressInfo).port}/caishy`;
  t = await createTestApp({ WEBHOOKS_ALLOW_PRIVATE: 'true' });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Customer' });
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Tiles Co',
      handle: 'tiles.co',
      kind: 'shop',
    })
  ).org.id;
  otherOrgId = (
    await omar.post('/v1/orgs', {
      country: 'EG',
      name: 'Other Shop',
      handle: 'other.shop',
      kind: 'shop',
    })
  ).org.id;
  // On Business, so it can have more than one app: plans have their own tests (plans.test.ts).
  await t.ctx.db
    .updateTable('organizations')
    .set({ plan: 'business' })
    .where('id', '=', orgId)
    .execute();
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  convo = (await lina.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
});
afterAll(async () => {
  await t.close();
  await new Promise((done) => hook.close(done));
});

describe('apps: tokens, bots and webhooks (PRD §73–75, R16)', () => {
  let token: string;
  let secret: string;
  let botId: string;

  it('owners and admins make them; the token and secret are shown once', async () => {
    const denied = await omar.req('POST', `/v1/orgs/${orgId}/apps`, { name: 'Mine', scopes: ALL });
    expect(denied.statusCode).toBe(403);
    const made = await noor.req('POST', `/v1/orgs/${orgId}/apps`, {
      name: 'Tiles Assistant',
      scopes: ALL,
      webhookUrl: hookUrl,
      events: ['business.message', 'business.thread'],
    });
    expect(made.statusCode).toBe(201);
    ({ token, webhookSecret: secret } = made.json());
    botId = made.json().app.bot.userId;
    expect(token).toMatch(/^cai_[\w-]{32}$/);
    expect(secret).toMatch(/^whsec_/);
    const { apps } = await noor.get(`/v1/orgs/${orgId}/apps`);
    expect(apps).toEqual([
      expect.objectContaining({ name: 'Tiles Assistant', tokenPrefix: token.slice(0, 10) }),
    ]);
    expect(JSON.stringify(apps)).not.toContain(token);
    expect(JSON.stringify(apps)).not.toContain(secret);

    // Its bot is on the team and labelled as one; nobody can sign in as it or promote it.
    const team = (await noor.get(`/v1/orgs/${orgId}`)).org.members;
    expect(team.find((m: any) => m.userId === botId).person).toMatchObject({
      displayName: 'Tiles Assistant',
      kind: 'bot',
    });
    const { handle } = team.find((m: any) => m.userId === botId).person;
    const login = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { 'x-caishy-client': 'web' },
      payload: { identifier: handle, password: '!' },
    });
    expect(login.statusCode).toBe(401);
    expect(
      (await noor.req('PATCH', `/v1/orgs/${orgId}/members/${botId}`, { role: 'admin' })).statusCode,
    ).toBe(400);
    expect((await noor.req('DELETE', `/v1/orgs/${orgId}/members/${botId}`)).statusCode).toBe(400);
  });

  it('a token reaches only its routes, its scopes and its organization', async () => {
    expect((await as(token, 'GET', `/v1/orgs/${orgId}/inbox`)).statusCode).toBe(200);
    const elsewhere = await as(token, 'GET', '/v1/me');
    expect(elsewhere.statusCode).toBe(403);
    expect(elsewhere.json().error.code).toBe('token_route');
    expect((await as(token, 'GET', `/v1/orgs/${otherOrgId}/inbox`)).statusCode).toBe(404);
    expect((await as('cai_nothing', 'GET', `/v1/orgs/${orgId}/inbox`)).statusCode).toBe(401);
    const readOnly = (
      await noor.post(`/v1/orgs/${orgId}/apps`, { name: 'Reports', scopes: ['inbox:read'] })
    ).token;
    const write = await as(readOnly, 'POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      body: 'Hello',
    });
    expect(write.statusCode).toBe(403);
    expect(write.json().error.code).toBe('token_scope');
  });

  it('hears a customer write, signed so the organization can check it came from Caishy', async () => {
    await lina.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      body: 'Do you deliver to Maadi?',
    });
    const got = await deliver();
    expect(got?.headers['caishy-event']).toBe('business.message');
    const sig = parseSignature(String(got?.headers['caishy-signature']));
    expect(sig).not.toBeNull();
    const expected = createHmac('sha256', secret).update(`${sig!.t}.${got!.body}`).digest('hex');
    expect(sig!.v1).toBe(expected);
    expect(JSON.parse(got!.body)).toMatchObject({
      event: 'business.message',
      orgId,
      data: {
        conversationId: convo,
        message: { body: 'Do you deliver to Maadi?' },
        customer: { id: lina.user.id, displayName: 'Lina Customer', under18: false },
      },
    });
  });

  it('its bot answers as the organization, says it’s automated, and leaves the thread to people', async () => {
    const sent = await as(token, 'POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      body: 'Yes, we deliver to Maadi on Tuesdays. Someone from the team will confirm.',
    });
    expect(sent.statusCode).toBe(201);
    const { messages } = await lina.get(`/v1/conversations/${convo}/messages`);
    expect(messages.at(-1)).toMatchObject({ senderId: orgId, automated: true });
    expect(messages[0]).toMatchObject({ senderId: lina.user.id, automated: false });
    await t.ctx.flush(); // Notifications are written after the response.
    const alerts = (await lina.get('/v1/notifications')).notifications;
    expect(alerts.map((n: any) => n.title)).toContain('Tiles Co (automated)');
    // The customer still waits for a person: the bot neither took it nor answered for the team.
    expect(
      (await noor.get(`/v1/conversations/${convo}`)).conversation.business.thread,
    ).toMatchObject({ state: 'new', assignee: null });
  });

  it('its bot is never given a conversation, and nobody can find it or connect with it', async () => {
    const given = await noor.req('POST', `/v1/business/${convo}/assign`, { userId: botId });
    expect(given.statusCode).toBe(400);
    const taken = await as(token, 'POST', `/v1/business/${convo}/assign`, { userId: botId });
    expect(taken.statusCode).toBe(400);
    const team = (await noor.get(`/v1/orgs/${orgId}`)).org.members;
    const { handle } = team.find((m: any) => m.userId === botId).person;
    expect((await lina.req('GET', `/v1/handles/${handle}`)).statusCode).toBe(404);
    for (const q of [handle, 'Tiles Assistant'])
      expect((await lina.get(`/v1/people/search?q=${encodeURIComponent(q)}`)).results).toEqual([]);
    const asked = await noor.req('POST', '/v1/connections/requests', { toUserId: botId });
    expect(asked.statusCode).toBe(404);
  });

  it('hears the thread change, and tries again when its endpoint fails', async () => {
    answers.push(500);
    await noor.post(`/v1/business/${convo}/resolve`);
    const first = await deliver();
    expect(first?.headers['caishy-event']).toBe('business.thread');
    const appId = (await noor.get(`/v1/orgs/${orgId}/apps`)).apps[0].id;
    const failing = (await noor.get(`/v1/orgs/${orgId}/apps/${appId}/deliveries`)).deliveries[0];
    expect(failing).toMatchObject({ status: 'pending', attempts: 1, lastStatus: 500 });
    t.clock.advance(60_000);
    await deliver();
    expect(JSON.parse(received.at(-1)!.body).data).toMatchObject({
      change: 'resolved',
      by: 'person',
    });
    const done = (await noor.get(`/v1/orgs/${orgId}/apps/${appId}/deliveries`)).deliveries[0];
    expect(done).toMatchObject({ status: 'delivered', attempts: 2, lastStatus: 200 });
  });

  it('a replaced token stops at once; a removed app takes its bot off the team', async () => {
    const appId = (await noor.get(`/v1/orgs/${orgId}/apps`)).apps[0].id;
    const fresh = (await noor.post(`/v1/orgs/${orgId}/apps/${appId}/token`)).token;
    expect((await as(token, 'GET', `/v1/orgs/${orgId}/inbox`)).statusCode).toBe(401);
    expect((await as(fresh, 'GET', `/v1/orgs/${orgId}/inbox`)).statusCode).toBe(200);
    await noor.req('DELETE', `/v1/orgs/${orgId}/apps/${appId}`);
    expect((await as(fresh, 'GET', `/v1/orgs/${orgId}/inbox`)).statusCode).toBe(401);
    const team = (await noor.get(`/v1/orgs/${orgId}`)).org.members;
    expect(team.map((m: any) => m.userId)).not.toContain(botId);
    const people = (await noor.get(`/v1/conversations/${convo}`)).conversation.participants;
    expect(people.map((p: any) => p.userId)).not.toContain(botId);
  });

  it('an organization is never left to its bot: with nobody left, it closes and its apps stop', async () => {
    const made = await omar.req('POST', `/v1/orgs/${otherOrgId}/apps`, {
      name: 'Other Bot',
      scopes: ALL,
    });
    expect(made.statusCode).toBe(201);
    const other = made.json().token;
    expect((await as(other, 'GET', `/v1/orgs/${otherOrgId}/inbox`)).statusCode).toBe(200);
    await omar.req('DELETE', `/v1/orgs/${otherOrgId}/members/${omar.user.id}`);
    const org = await t.ctx.db
      .selectFrom('organizations')
      .select('archived_at')
      .where('id', '=', otherOrgId)
      .executeTakeFirstOrThrow();
    expect(org.archived_at).not.toBeNull();
    const owners = await t.ctx.db
      .selectFrom('org_members')
      .select('user_id')
      .where('org_id', '=', otherOrgId)
      .where('role', '=', 'owner')
      .execute();
    expect(owners).toEqual([]);
    expect((await as(other, 'GET', `/v1/orgs/${otherOrgId}/inbox`)).statusCode).toBe(401);
  });

  it('webhooks never reach a private address', () => {
    expect(() => checkWebhookUrl('http://hooks.example/x', false)).toThrow(/https/);
    for (const bad of [
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://[::1]/x',
      'https://10.1.2.3/x',
      'https://localhost./x',
      'https://0x7f000001/x',
      // IPv4 written as IPv6, which the URL parser turns into hex groups: [::ffff:7f00:1]
      'https://[::ffff:127.0.0.1]/x',
      'https://[::ffff:a9fe:a9fe]/x',
      'https://[::127.0.0.1]/x',
      'https://[64:ff9b::169.254.169.254]/x',
      'https://[2002:c0a8:101::1]/x',
      'https://[fec0::1]/x',
      'https://[ff02::1]/x',
    ])
      expect(() => checkWebhookUrl(bad, false), bad).toThrow(/private/);
    expect(checkWebhookUrl('https://hooks.example/caishy', false)).toBe(
      'https://hooks.example/caishy',
    );
    for (const ip of [
      '169.254.169.254',
      '192.168.1.1',
      '172.20.0.1',
      '100.64.0.1',
      'fd00::1',
      '::ffff:10.0.0.1',
      '::ffff:7f00:1',
      '::',
      '0.0.0.0',
      '192.0.0.192',
      '198.18.0.1',
      'fe80::1%eth0',
      '64:ff9b:1::1',
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of [
      '93.184.216.34',
      '::ffff:5db8:d822',
      '2606:4700:4700::1111',
      '2002:5db8:d822::1',
    ])
      expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('a delivery gets one deadline, however slowly the endpoint answers', async () => {
    // An endpoint that trickles its headers never trips a socket's idle timeout.
    const drip = createTcpServer((socket) => {
      socket.on('error', () => {});
      socket.write('HTTP/1.1 200 OK\r\n');
      const timer = setInterval(() => socket.write('x-wait: 1\r\n'), 50);
      socket.on('close', () => clearInterval(timer));
    });
    await new Promise<void>((done) => drip.listen(0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${(drip.address() as AddressInfo).port}/`;
    const started = Date.now();
    await expect(
      postWebhook(url, '{}', {}, { allowPrivate: true, timeoutMs: 300 }),
    ).rejects.toThrow(/No answer within/);
    expect(Date.now() - started).toBeLessThan(2000);
    await new Promise((done) => drip.close(done));
  });
});
