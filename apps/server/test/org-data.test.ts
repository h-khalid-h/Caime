/**
 * What a clinic's lawyer needs (R54): an organization exports its own conversations, erases a
 * customer's at that customer's request, and sets how long its conversations are kept; the
 * privacy page names who processes data from the one list in the code.
 */
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPeriodic } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owner
let omar: Client; // admin
let lina: Client; // a customer
let rami: Client; // another customer
let orgId: string;
let linaConvo: string;
let ramiConvo: string;

const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body,
  });
const messagesOf = async (conversationId: string) =>
  t.ctx.db
    .selectFrom('messages')
    .select(['id', 'body', 'deleted_at', 'expires_at', 'kind', 'payload'])
    .where('conversation_id', '=', conversationId)
    .orderBy('seq')
    .execute();

beforeAll(async () => {
  t = await createTestApp({ CLOUDFLARE_TURN_KEY_ID: 'k', CLOUDFLARE_TURN_API_TOKEN: 'tok' });
  noor = await signup(t, { displayName: 'Noor Haddad', handle: 'noor' });
  omar = await signup(t, { displayName: 'Omar Farouk', handle: 'omar' });
  lina = await signup(t, { displayName: 'Lina Customer', handle: 'lina' });
  rami = await signup(t, { displayName: 'Rami Customer', handle: 'rami' });
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  await noor.patch(`/v1/orgs/${orgId}/members/${omar.user.id}`, { role: 'admin' });
  linaConvo = (await lina.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
  ramiConvo = (await rami.post(`/v1/orgs/${orgId}/conversations`)).conversationId;
  await send(lina, linaConvo, 'My tooth hurts since Monday.');
  await send(omar, linaConvo, 'Come in tomorrow at 10.');
  await send(rami, ramiConvo, 'Do you take insurance?');
  await t.ctx.flush();
});
afterAll(async () => {
  await t.close();
});

describe('the export', () => {
  it('is the organization’s own: its team by name, its customers’ conversations, nothing of its people’s own', async () => {
    const res = await noor.req('GET', `/v1/orgs/${orgId}/export`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="nile\.dental-caime-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    const data = res.json();
    expect(data.organization).toMatchObject({ handle: 'nile.dental', retentionDays: null });
    expect(
      data.team
        .map((m: { displayName: string; role: string }) => `${m.displayName}:${m.role}`)
        .sort(),
    ).toEqual(['Noor Haddad:owner', 'Omar Farouk:admin']);
    expect(data.conversations).toHaveLength(2);
    const lina1 = data.conversations.find(
      (c: { conversationId: string }) => c.conversationId === linaConvo,
    );
    expect(lina1.customer).toMatchObject({ displayName: 'Lina Customer', handle: 'lina' });
    expect(
      lina1.messages.map((m: { from: string; body: string | null; senderName: string | null }) => [
        m.from,
        m.body,
        m.senderName,
      ]),
    ).toEqual([
      ['customer', 'My tooth hurts since Monday.', null],
      ['team', 'Come in tomorrow at 10.', 'Omar Farouk'],
    ]);
    // Nothing of the team's own conversations, connections or relationships is in it.
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/relationships|connections|password|email/);
  });

  it('is the owner’s and admins’ to take, logged each time, never a member’s or a customer’s', async () => {
    expect((await omar.req('GET', `/v1/orgs/${orgId}/export`)).statusCode).toBe(200);
    expect((await lina.req('GET', `/v1/orgs/${orgId}/export`)).statusCode).toBe(404);
    const logged = await t.ctx.db
      .selectFrom('audit_log')
      .select(['actor_id'])
      .where('action', '=', 'org.exported')
      .where('target', '=', orgId)
      .execute();
    expect(logged.map((l) => l.actor_id).sort()).toEqual([noor.user.id, omar.user.id].sort());
  });
});

describe('erasing a customer’s conversation at their request', () => {
  it('empties every message, forgets what showed them, tells the customer in a line, and marks the thread', async () => {
    const before = await messagesOf(linaConvo);
    expect(before.filter((m) => m.body)).toHaveLength(2);
    const res = await omar.del(`/v1/orgs/${orgId}/conversations/${linaConvo}`);
    expect(res).toEqual({ erased: 2 });
    await t.ctx.flush();
    const after = await messagesOf(linaConvo);
    const erased = after.filter((m) => m.kind !== 'system');
    expect(erased).toHaveLength(2);
    for (const m of erased) {
      expect(m.body).toBeNull();
      expect(m.deleted_at).not.toBeNull();
      expect(m.payload).toEqual({});
    }
    // The customer reads it from the organization, by its name, never the person who did it.
    const asLina = await lina.get(`/v1/conversations/${linaConvo}/messages`);
    const line = asLina.messages.find((m: { kind: string }) => m.kind === 'system');
    expect(line.payload.event).toBe('erased');
    expect(JSON.stringify(line.payload)).not.toContain('Omar');
    expect(line.payload.by).toBe('Nile Dental');
    // The team sees who did it, and that the thread was erased.
    const asOmar = await omar.get(`/v1/conversations/${linaConvo}/messages`);
    expect(asOmar.messages.find((m: { kind: string }) => m.kind === 'system').payload.by).toBe(
      'Omar Farouk',
    );
    const asTeam = await omar.get(`/v1/conversations/${linaConvo}`);
    expect(asTeam.conversation.business.thread.erasedAt).toBeTruthy();
    const logged = await t.ctx.db
      .selectFrom('audit_log')
      .select(['actor_id', 'metadata'])
      .where('action', '=', 'org.conversation_erased')
      .where('target', '=', linaConvo)
      .executeTakeFirst();
    expect(logged?.actor_id).toBe(omar.user.id);
  });

  it('is only the team’s to do, only of its own conversations', async () => {
    expect(
      (await lina.req('DELETE', `/v1/orgs/${orgId}/conversations/${ramiConvo}`)).statusCode,
    ).toBe(404);
    const other = (
      await noor.post('/v1/orgs', {
        country: 'EG',
        name: 'River Books',
        handle: 'river.books',
        kind: 'shop',
      })
    ).org.id;
    expect(
      (await noor.req('DELETE', `/v1/orgs/${other}/conversations/${ramiConvo}`)).statusCode,
    ).toBe(404);
    expect((await messagesOf(ramiConvo)).filter((m) => m.body)).toHaveLength(1);
  });
});

describe('how long conversations are kept', () => {
  it('is the owner’s to set, applies to what’s there, and to what’s sent from then on', async () => {
    expect((await omar.req('PATCH', `/v1/orgs/${orgId}`, { retentionDays: 30 })).statusCode).toBe(
      403,
    );
    const { org } = await noor.patch(`/v1/orgs/${orgId}`, { retentionDays: 30 });
    expect(org.retentionDays).toBe(30);
    const sentAt = (await messagesOf(ramiConvo))[0];
    expect(sentAt?.expires_at).not.toBeNull();
    await send(rami, ramiConvo, 'And on Saturdays?');
    const after = await messagesOf(ramiConvo);
    const latest = after[after.length - 1];
    expect(latest?.expires_at?.getTime()).toBe(t.clock.now.getTime() + 30 * 86_400_000);
    // The customer is told how long the organization keeps it.
    const convo = await rami.get(`/v1/conversations/${ramiConvo}`);
    expect(convo.conversation.business.retentionDays).toBe(30);
    // The conversation's own, shorter setting wins; a longer one doesn't outlive the organization's.
    await noor.patch(`/v1/orgs/${orgId}`, { retentionDays: 365 });
    const again = await messagesOf(ramiConvo);
    for (const m of again.filter((x) => x.kind !== 'system'))
      expect(m.expires_at?.getTime()).toBeGreaterThan(t.clock.now.getTime() + 300 * 86_400_000);
    // Turned off, the messages stay (no setting of their own).
    await noor.patch(`/v1/orgs/${orgId}`, { retentionDays: null });
    for (const m of await messagesOf(ramiConvo)) expect(m.expires_at).toBeNull();
  });

  it('the sweep takes what’s due, as it does disappearing messages', async () => {
    await noor.patch(`/v1/orgs/${orgId}`, { retentionDays: 1 });
    t.clock.advance(2 * 86_400_000);
    await runPeriodic(t.ctx);
    const after = await messagesOf(ramiConvo);
    for (const m of after.filter((x) => x.kind !== 'system')) expect(m.body).toBeNull();
  });
});

describe('who processes data', () => {
  it('is one list, read by the privacy page as this server is configured', async () => {
    const page = await t.app.inject({ url: '/privacy', headers: { accept: 'text/html' } });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Stripe Payments Europe');
    expect(page.body).toContain('Anthropic');
    expect(page.body).toContain('Cloudflare, Inc.');
    expect(page.body).toContain('Our hosting provider');
    expect(page.body).not.toContain('the email provider the operator set');
    expect(page.body).toContain('it is\nthe controller');
  });
});
