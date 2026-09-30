import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { uuidv4, uuidv7 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const ADMIN = 'operator-token-for-the-plans-test-0123456789';
const PLANS_URL = 'https://plans.caime.example/';
const GB = 1024 ** 3;

let t: TestApp;
let noor: Client; // owns the organization
let omar: Client;
let alex: Client;
let sara: Client;
let lina: Client;
let orgId: string;

const operator = (url: string, body: unknown, token = ADMIN) =>
  t.app.inject({
    method: 'PUT',
    url,
    headers: { authorization: `Bearer ${token}` },
    payload: body as object,
  });

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
}

function multipart(data: Buffer) {
  const boundary = `----caime${uuidv4()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes.txt"\r\nContent-Type: text/plain\r\n\r\n`,
  );
  return {
    payload: Buffer.concat([head, data, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

beforeAll(async () => {
  t = await createTestApp({ ADMIN_TOKEN: ADMIN, PLANS_URL });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  alex = await signup(t, { displayName: 'Alex Chen' });
  sara = await signup(t, { displayName: 'Sara Ali' });
  lina = await signup(t, { displayName: 'Lina Customer' });
  for (const c of [omar, alex, sara]) await connect(noor, c);
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Tiles Co',
      handle: 'tiles.co',
      kind: 'shop',
    })
  ).org.id;
});

afterAll(async () => {
  await t.close();
});

describe('plans (PRD §84, R23)', () => {
  it('only the operator sets plans, and without a token the routes don’t exist', async () => {
    const saved = t.ctx.config.ADMIN_TOKEN;
    t.ctx.config.ADMIN_TOKEN = undefined;
    const absent = await operator(`/v1/admin/people/${lina.user.handle}/plan`, { plan: 'pro' });
    t.ctx.config.ADMIN_TOKEN = saved;
    // Exactly what a route that was never there answers.
    const never = await operator('/v1/admin/nothing-here', { plan: 'pro' });
    expect(never.statusCode).toBe(404);
    expect(absent.statusCode).toBe(404);
    expect(absent.json()).toEqual({
      error: {
        ...never.json().error,
        message: `No route for PUT /v1/admin/people/${lina.user.handle}/plan`,
      },
    });
    expect(Object.keys(absent.json().error)).toEqual(Object.keys(never.json().error));

    const wrong = await operator(`/v1/admin/people/${lina.user.handle}/plan`, { plan: 'pro' }, 'x');
    expect(wrong.statusCode).toBe(401);
    const asPerson = await lina.req('PUT', `/v1/admin/people/${lina.user.handle}/plan`, {
      plan: 'pro',
    });
    expect(asPerson.statusCode).toBe(401);
    expect((await lina.get('/v1/me')).user.plan).toBe('personal');

    const bad = await operator(`/v1/admin/people/${lina.user.handle}/plan`, { plan: 'gold' });
    expect(bad.statusCode).toBe(400);
    const set = await operator(`/v1/admin/people/@${lina.user.handle}/plan`, { plan: 'pro' });
    expect(set.statusCode).toBe(200);
    expect(set.json().plan).toMatchObject({ plan: 'pro', allowance: { aiPerDay: 200 } });
    expect((await lina.get('/v1/me')).user.plan).toBe('pro');
    const logged = await t.ctx.db
      .selectFrom('audit_log')
      .select(['target', 'metadata'])
      .where('action', '=', 'plan.changed')
      .execute();
    expect(logged).toEqual([
      {
        target: lina.user.id,
        metadata: { of: 'person', from: 'personal', to: 'pro', operator: 'operator' },
      },
    ]);
    await operator(`/v1/admin/people/${lina.user.handle}/plan`, { plan: 'personal' });
  });

  it('says what yours includes and what you’ve used', async () => {
    expect(await lina.get('/v1/me/plan')).toEqual({
      plan: 'personal',
      allowance: { aiPerDay: 10, storageBytes: 5 * GB, automations: 5, insights: false },
      used: { aiToday: 0, storageBytes: 0, automations: 0 },
      aiNextAt: null,
      upgradeUrl: PLANS_URL,
    });
  });

  it('a free organization has room for three people, and its bot isn’t one of them', async () => {
    await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id, alex.user.id] });
    const app = await noor.req('POST', `/v1/orgs/${orgId}/apps`, { name: 'Helper', scopes: [] });
    expect(app.statusCode).toBe(201);

    const full = await noor.req('POST', `/v1/orgs/${orgId}/members`, { userIds: [sara.user.id] });
    expect(full.statusCode).toBe(403);
    expect(full.json().error).toMatchObject({
      code: 'plan_limit',
      message: 'Tiles Co’s Free plan has room for 3 people on the team. Business has room for 100.',
      details: { upgradeUrl: PLANS_URL },
    });
    const second = await noor.req('POST', `/v1/orgs/${orgId}/apps`, { name: 'More', scopes: [] });
    expect(second.statusCode).toBe(403);
    expect(second.json().error.message).toBe(
      'Tiles Co’s Free plan includes one app. Business includes 25.',
    );

    const { org } = await noor.get(`/v1/orgs/${orgId}`);
    expect(org.memberCount).toBe(3);
    expect(org.plan).toEqual({
      plan: 'free',
      allowance: {
        teamSize: 3,
        apps: 1,
        insights: false,
        startsPerDay: 20,
        agentRepliesPerDay: 50,
      },
      used: { teamSize: 3, apps: 1, startsToday: 0, agentRepliesToday: 0 },
      upgradeUrl: PLANS_URL,
    });
    // Only its owner and admins see its plan.
    expect((await omar.get(`/v1/orgs/${orgId}`)).org.plan).toBeNull();
    expect((await lina.get(`/v1/orgs/${orgId}`)).org.plan).toBeNull();
  });

  it('a bigger plan makes room, and a smaller one takes nothing away', async () => {
    const up = await operator('/v1/admin/orgs/tiles.co/plan', { plan: 'business' });
    expect(up.json().plan).toMatchObject({ plan: 'business', used: { teamSize: 3, apps: 1 } });
    await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [sara.user.id] });
    expect((await noor.req('POST', `/v1/orgs/${orgId}/apps`, { name: 'More' })).statusCode).toBe(
      201,
    );

    await operator('/v1/admin/orgs/tiles.co/plan', { plan: 'free' });
    const { org } = await noor.get(`/v1/orgs/${orgId}`);
    expect(org.plan.used).toEqual({ teamSize: 4, apps: 2, startsToday: 0, agentRepliesToday: 0 });
    expect(org.members.filter((m: any) => m.person.kind === 'human')).toHaveLength(4);
    const apps = (await noor.get(`/v1/orgs/${orgId}/apps`)).apps;
    expect(apps).toHaveLength(2);
    // Someone leaving still works; only additions wait until the team fits.
    await sara.req('DELETE', `/v1/orgs/${orgId}/members/${sara.user.id}`);
    const again = await noor.req('POST', `/v1/orgs/${orgId}/members`, { userIds: [sara.user.id] });
    expect(again.json().error.code).toBe('plan_limit');
  });

  it('files count against your storage, uploads under way included', async () => {
    // Most of Lina's 5 GB is already used.
    await t.ctx.db
      .insertInto('files')
      .values({
        id: uuidv7(),
        owner_id: lina.user.id,
        storage_key: 'files/earlier',
        name: 'earlier.mov',
        mime: 'video/quicktime',
        size: 5 * GB - 1000,
        kind: 'video',
        status: 'ready',
      })
      .execute();
    const resumable = await lina.req('POST', '/v1/uploads', {
      name: 'big.pdf',
      mime: 'application/pdf',
      size: 2000,
    });
    expect(resumable.statusCode).toBe(403);
    expect(resumable.json().error).toMatchObject({
      code: 'plan_limit',
      message:
        'That’s more than the 5 GB of files your plan includes (5 GB used). Pro includes 100 GB.',
    });
    const started = await lina.post('/v1/uploads', {
      name: 'small.pdf',
      mime: 'application/pdf',
      size: 600,
    });
    expect(started.id).toBeTruthy();

    // The 600 bytes under way count: 800 more doesn't fit, and isn't kept.
    const direct = multipart(Buffer.alloc(800, 'a'));
    const refused = await t.app.inject({
      method: 'POST',
      url: '/v1/files',
      payload: direct.payload,
      headers: { ...direct.headers, authorization: `Bearer ${lina.token}` },
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe('plan_limit');
    const tmp = await readdir(join(t.ctx.config.DATA_DIR, 'tmp')).catch(() => []);
    expect(tmp).toEqual([]);

    await operator(`/v1/admin/people/${lina.user.handle}/plan`, { plan: 'pro' });
    const fits = multipart(Buffer.alloc(800, 'a'));
    const kept = await t.app.inject({
      method: 'POST',
      url: '/v1/files',
      payload: fits.payload,
      headers: { ...fits.headers, authorization: `Bearer ${lina.token}` },
    });
    expect(kept.statusCode).toBe(201);
    expect((await lina.get('/v1/me/plan')).used.storageBytes).toBe(5 * GB - 1000 + 600 + 800);
  });
});
