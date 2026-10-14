/**
 * An organization's closing as the DPA's section 12 says: its export stays open to its last owner
 * for `KEPT_DAYS.closedOrgExport` days, the team as it stood at closing; then the daily sweep
 * deletes what was its alone (team, page, settings, catalog, agent, apps, updates, checkout,
 * the team's notes on its threads, files nothing else uses) and keeps the conversations as its
 * customers' copies.
 */

import { uuidv4 } from '@caime/core';
import { CLOSED_ORG_EXPORT_DAYS } from '@caime/core/api';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { clearClosedOrg, sweepClosedOrgs } from '../src/lib/org-data';
import { KEPT_DAYS } from '../src/lib/retention';
import { storageFor } from '../src/lib/storage';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const DAY = 86_400_000;
let t: TestApp;
let noor: Client; // owner
let omar: Client; // admin
let lina: Client; // a customer, who follows it too

const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body,
  });

async function uploadImage(c: Client, name: string) {
  const data = await sharp({
    create: { width: 320, height: 320, channels: 3, background: '#3f8ff2' },
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

const KNOWLEDGE =
  'Nile Dental is open Sunday to Thursday, 9 to 5. A check-up costs 400 EGP. We are on Tahrir Street, second floor.';

/** An organization with everything a clinic has: a page, a logo, a catalog with a photo, an agent, an app, an update, a customer's conversation. */
async function clinic(handle: string) {
  const org = (
    await noor.post('/v1/orgs', { country: 'EG', name: 'Nile Dental', handle, kind: 'clinic' })
  ).org;
  await noor.post(`/v1/orgs/${org.id}/members`, { userIds: [omar.user.id] });
  await noor.patch(`/v1/orgs/${org.id}/members/${omar.user.id}`, { role: 'admin' });
  const logo = await uploadImage(noor, 'logo.jpg');
  const photo = await uploadImage(noor, 'brush.jpg');
  await noor.patch(`/v1/orgs/${org.id}`, {
    about: 'A family clinic on Tahrir Street.',
    website: 'https://nile.example',
    avatarFileId: logo.id,
  });
  const saved = await noor.req('PUT', `/v1/orgs/${org.id}/booking`, {
    booking: null,
    ordering: { fulfilment: ['pickup'], note: null },
    items: [
      {
        id: 'brush',
        name: 'Soft toothbrush',
        price: { value: 90, currency: 'EGP' },
        unit: 'each',
        minutes: null,
        capacity: 1,
        maxQuantity: 5,
        audience: 'public',
        providers: null,
        askTopic: false,
        photoFileId: photo.id,
      },
    ],
  });
  expect(saved.statusCode).toBe(200);
  expect(
    (
      await noor.req('PUT', `/v1/orgs/${org.id}/agent`, {
        name: 'Nile Dental Assistant',
        knowledge: KNOWLEDGE,
      })
    ).statusCode,
  ).toBe(200);
  const app = await noor.post(`/v1/orgs/${org.id}/apps`, {
    name: 'Clinic sync',
    scopes: ['messages:read'],
    webhookUrl: 'https://hooks.example/nile',
    events: ['business.message'],
  });
  await lina.req('PUT', `/v1/orgs/${org.id}/follow`, {});
  await noor.post(`/v1/orgs/${org.id}/updates`, { body: 'We open on Saturdays from next week.' });
  while (await runDueJobs(t.ctx)) await t.ctx.flush();
  const convo = (await lina.post(`/v1/orgs/${org.id}/conversations`)).conversationId as string;
  await send(lina, convo, 'My tooth hurts since Monday.');
  await send(omar, convo, 'Come in tomorrow at 10.');
  await t.ctx.flush();
  const keys = (
    await t.ctx.db
      .selectFrom('files')
      .select(['storage_key', 'thumb_key', 'preview_key'])
      .where('id', 'in', [logo.id, photo.id])
      .execute()
  ).flatMap((f) => [f.storage_key, f.thumb_key, f.preview_key].filter((k): k is string => !!k));
  const storage = storageFor(t.ctx.config);
  for (const key of keys) expect(await storage.size(key), key).not.toBeNull();
  return {
    keys,
    id: org.id as string,
    convo,
    logo: logo.id,
    photo: photo.id,
    token: app.token as string,
    secret: app.webhookSecret as string,
  };
}

beforeAll(async () => {
  // An agent needs AI assist configured; nothing here asks it anything.
  t = await createTestApp({
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
  });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Customer' });
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
});
afterAll(async () => {
  await t.close();
});

describe('closing an organization (DPA §12)', () => {
  it('keeps its export open to the owner who closed it alone, the team as it stood, then clears what was its alone', async () => {
    expect(KEPT_DAYS.closedOrgExport).toBe(CLOSED_ORG_EXPORT_DAYS);
    expect(CLOSED_ORG_EXPORT_DAYS).toBe(30);
    const c = await clinic('nile.close');
    const closedAt = new Date(t.clock.now);
    expect((await noor.req('POST', `/v1/orgs/${c.id}/close`)).statusCode).toBe(200);

    // The owner who closed it exports everything it held; nobody else sees it at all.
    const res = await noor.req('GET', `/v1/orgs/${c.id}/export`);
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.organization).toMatchObject({
      handle: 'nile.close',
      about: 'A family clinic on Tahrir Street.',
      website: 'https://nile.example',
      country: 'EG',
      closedAt: closedAt.toISOString(),
    });
    expect(
      data.team
        .map((m: { displayName: string; role: string }) => `${m.displayName}:${m.role}`)
        .sort(),
    ).toEqual(['Noor Haddad:owner', 'Omar Farouk:admin']);
    expect(data.agent).toMatchObject({ knowledge: KNOWLEDGE, paused: false });
    expect(data.apps).toEqual([
      expect.objectContaining({
        name: 'Clinic sync',
        scopes: ['messages:read'],
        webhookUrl: 'https://hooks.example/nile',
        revokedAt: closedAt.toISOString(),
      }),
    ]);
    expect(data.updates.map((u: { body: string }) => u.body)).toEqual([
      'We open on Saturdays from next week.',
    ]);
    expect(data.offer.items.map((i: { name: string }) => i.name)).toEqual(['Soft toothbrush']);
    expect(data.conversations).toHaveLength(1);
    // Never a secret: neither the app's token nor its webhook secret.
    expect(res.body).not.toContain(c.token);
    expect(res.body).not.toContain(c.secret);
    for (const other of [omar, lina])
      expect((await other.req('GET', `/v1/orgs/${c.id}/export`)).statusCode).toBe(404);
    const until = new Date(closedAt.getTime() + 30 * DAY).toISOString();
    expect((await noor.get('/v1/me/closed-orgs')).orgs).toEqual([
      {
        id: c.id,
        name: 'Nile Dental',
        handle: 'nile.close',
        closedAt: closedAt.toISOString(),
        exportUntil: until,
      },
    ]);
    expect((await omar.get('/v1/me/closed-orgs')).orgs).toEqual([]);

    // Not before its time.
    t.clock.advance(29 * DAY);
    await sweepClosedOrgs(t.ctx);
    expect(
      await t.ctx.db.selectFrom('org_agents').select('org_id').where('org_id', '=', c.id).execute(),
    ).toHaveLength(1);
    expect((await noor.req('GET', `/v1/orgs/${c.id}/export`)).statusCode).toBe(200);

    // Thirty days on, its export closes and the sweep clears it.
    t.clock.advance(DAY);
    expect((await noor.req('GET', `/v1/orgs/${c.id}/export`)).statusCode).toBe(404);
    expect((await noor.get('/v1/me/closed-orgs')).orgs).toEqual([]);
    await sweepClosedOrgs(t.ctx);
    const db = t.ctx.db;
    const of = (table: 'org_members' | 'org_agents' | 'org_apps' | 'org_updates') =>
      db.selectFrom(table).select('org_id').where('org_id', '=', c.id).execute();
    for (const table of ['org_members', 'org_agents', 'org_apps', 'org_updates'] as const)
      expect(await of(table), table).toEqual([]);
    expect(await db.selectFrom('api_tokens').select('id').execute()).toEqual([]);
    expect(
      await db
        .selectFrom('notifications')
        .select('id')
        .where('kind', '=', 'update')
        .where('user_id', '=', lina.user.id)
        .execute(),
    ).toEqual([]);
    const org = await db
      .selectFrom('organizations')
      .selectAll()
      .where('id', '=', c.id)
      .executeTakeFirstOrThrow();
    // What names it in its customers' copies stays; its page, settings and catalog go.
    expect(org).toMatchObject({
      name: 'Nile Dental',
      handle: 'nile.close',
      kind: 'clinic',
      country: 'EG',
      about: null,
      website: null,
      avatar_file_id: null,
      booking_items: [],
      ordering: null,
      last_owner_id: null,
      created_by: null,
    });
    expect(org.cleared_at?.toISOString()).toBe(t.clock.now.toISOString());
    // The logo and the photo nothing else used are gone, rows and bytes.
    expect(
      await db.selectFrom('files').select('id').where('id', 'in', [c.logo, c.photo]).execute(),
    ).toEqual([]);
    const storage = storageFor(t.ctx.config);
    for (const key of c.keys) expect(await storage.size(key), key).toBeNull();
    const thread = await db
      .selectFrom('business_threads')
      .selectAll()
      .where('conversation_id', '=', c.convo)
      .executeTakeFirstOrThrow();
    expect(thread).toMatchObject({ assignee_id: null, escalation_note: null, resolved_by: null });
    // The customer's copy is whole: every message as it was, theirs to read.
    const page = await lina.get(`/v1/conversations/${c.convo}/messages`);
    expect(page.messages.map((m: { body: string | null }) => m.body)).toEqual(
      expect.arrayContaining(['My tooth hurts since Monday.', 'Come in tomorrow at 10.']),
    );
    const cleared = await db
      .selectFrom('audit_log')
      .select(['action', 'metadata'])
      .where('target', '=', c.id)
      .where('action', '=', 'org.cleared')
      .execute();
    expect(cleared).toHaveLength(1);
    expect(cleared[0]!.metadata).toMatchObject({ handle: 'nile.close', files: 2 });
    // Once is once.
    expect(await clearClosedOrg(t.ctx, c.id)).toBe(false);
  });

  it('closed by its last person leaving, it is theirs to export, in the role they had', async () => {
    const org = (
      await omar.post('/v1/orgs', {
        country: 'EG',
        name: 'Omar Optics',
        handle: 'omar.optics',
        kind: 'shop',
      })
    ).org;
    const closedAt = new Date(t.clock.now);
    expect(
      (await omar.req('DELETE', `/v1/orgs/${org.id}/members/${omar.user.id}`)).statusCode,
    ).toBe(200);
    const data = await omar.get(`/v1/orgs/${org.id}/export`);
    expect(data.organization.closedAt).toBe(closedAt.toISOString());
    expect(
      data.team.map((m: { displayName: string; role: string }) => [m.displayName, m.role]),
    ).toEqual([['Omar Farouk', 'owner']]);
    expect((await omar.get('/v1/me/closed-orgs')).orgs.map((o: { id: string }) => o.id)).toEqual([
      org.id,
    ]);
  });

  it('closed with its owner’s account, nobody can take its export, and it clears all the same', async () => {
    const sara = await signup(t, { displayName: 'Sara Nabil' });
    const org = (
      await sara.post('/v1/orgs', {
        country: 'EG',
        name: 'Sara Studio',
        handle: 'sara.studio',
        kind: 'shop',
      })
    ).org;
    expect(
      (await sara.req('DELETE', '/v1/me', { password: 'correct horse battery' })).statusCode,
    ).toBe(200);
    const row = await t.ctx.db
      .selectFrom('organizations')
      .select(['archived_at', 'last_owner_id'])
      .where('id', '=', org.id)
      .executeTakeFirstOrThrow();
    expect(row.archived_at).not.toBeNull();
    expect(row.last_owner_id).toBeNull();
    t.clock.advance(KEPT_DAYS.closedOrgExport * DAY);
    await sweepClosedOrgs(t.ctx);
    const after = await t.ctx.db
      .selectFrom('organizations')
      .select('cleared_at')
      .where('id', '=', org.id)
      .executeTakeFirstOrThrow();
    expect(after.cleared_at).not.toBeNull();
  });
});
