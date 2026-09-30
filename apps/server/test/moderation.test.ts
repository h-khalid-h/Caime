import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const ADMIN = 'operator-token-for-the-moderation-test-0123456789';
let t: TestApp;
let noor: Client;
let sam: Client;
let conversationId: string;
let messageId: string;

const op = (method: 'GET' | 'PATCH' | 'POST', url: string, body?: unknown, token = ADMIN) =>
  t.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    payload: body as Record<string, unknown> | undefined,
  });

beforeAll(async () => {
  t = await createTestApp({ ADMIN_TOKEN: ADMIN });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  const r = await noor.post('/v1/connections/requests', {
    toUserId: sam.user.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  conversationId = (await sam.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId;
  const sent = await sam.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'text',
    body: 'Buy my coins, guaranteed 300% by Friday',
  });
  messageId = sent.message.id;
  await noor.post('/v1/reports', {
    userId: sam.user.id,
    messageId,
    conversationId,
    reason: 'scam',
    details: 'Keeps sending this.',
  });
});
afterAll(async () => {
  await t.close();
});

describe('the operator reviews reports (R49)', () => {
  it('lists what was reported, with what is left of it, to the operator alone', async () => {
    expect((await op('GET', '/v1/admin/reports', undefined, 'not-the-token')).statusCode).toBe(401);
    expect((await noor.req('GET', '/v1/admin/reports')).statusCode).toBe(401);
    const r = await op('GET', '/v1/admin/reports?status=open');
    expect(r.statusCode).toBe(200);
    const { reports } = r.json();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      status: 'open',
      reason: 'scam',
      details: 'Keeps sending this.',
      reporter: { handle: noor.user.handle, displayName: 'Noor Haddad' },
      person: { handle: sam.user.handle, displayName: 'Sam Rivera' },
      org: null,
      message: {
        id: messageId,
        conversationId,
        body: 'Buy my coins, guaranteed 300% by Friday',
        sealed: false,
        removed: false,
      },
      update: null,
    });
  });

  it('moves a report along, and removes the message for everyone as its sender would', async () => {
    const { reports } = (await op('GET', '/v1/admin/reports')).json();
    const id = reports[0].id;
    const reviewing = await op('PATCH', `/v1/admin/reports/${id}`, { status: 'reviewing' });
    expect(reviewing.json().report.status).toBe('reviewing');
    expect((await op('GET', '/v1/admin/reports?status=open')).json().reports).toHaveLength(0);
    const removed = await op('POST', `/v1/admin/reports/${id}/remove-message`);
    expect(removed.statusCode).toBe(200);
    expect(removed.json().report).toMatchObject({
      status: 'actioned',
      message: { removed: true, body: null },
    });
    // Gone for both of them: a deleted line, no words.
    const page = await noor.get(`/v1/conversations/${conversationId}/messages`);
    const m = page.messages.find((x: { id: string }) => x.id === messageId);
    expect(m.deletedAt).toBeTruthy();
    expect(m.body).toBeNull();
    // Twice is fine: nothing more to remove.
    expect((await op('POST', `/v1/admin/reports/${id}/remove-message`)).statusCode).toBe(200);
    // The audit log says the operator did it, in its own words.
    const audits = await t.ctx.db
      .selectFrom('audit_log')
      .select('action')
      .where('action', 'like', 'moderation.%')
      .execute();
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(['moderation.report_status', 'moderation.message_removed']),
    );
  });

  it('suspends a person from a report: every way in closes, nobody new finds them, and it lifts', async () => {
    await noor.post('/v1/reports', { userId: sam.user.id, reason: 'harassment' });
    const { reports } = (await op('GET', '/v1/admin/reports?status=open')).json();
    const id = reports[0].id;
    const done = await op('POST', `/v1/admin/reports/${id}/suspend`);
    expect(done.statusCode).toBe(200);
    expect(done.json().report).toMatchObject({ status: 'actioned', person: { suspended: true } });
    // Sam's session is gone, and signing in again says why.
    const me = await sam.req('GET', '/v1/auth/session');
    expect(me.statusCode).toBe(401);
    const login = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { identifier: sam.user.handle, password: 'correct horse battery', client: 'native' },
    });
    expect([login.statusCode, login.json().error.code]).toEqual([403, 'suspended']);
    // Nobody new finds them by handle; Noor, in touch already, still has the conversation.
    expect((await noor.req('GET', `/v1/handles/${sam.user.handle}`)).statusCode).toBe(404);
    expect((await noor.req('GET', `/v1/conversations/${conversationId}`)).statusCode).toBe(200);
    // Lifted: back in with the same password.
    const lift = await t.app.inject({
      method: 'PUT',
      url: `/v1/admin/people/${sam.user.handle}/suspension`,
      headers: { authorization: `Bearer ${ADMIN}` },
      payload: { suspended: false },
    });
    expect(lift.statusCode).toBe(200);
    const back = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { identifier: sam.user.handle, password: 'correct horse battery', client: 'native' },
    });
    expect(back.statusCode).toBe(200);
    const audits = await t.ctx.db
      .selectFrom('audit_log')
      .select('action')
      .where('action', 'in', ['moderation.suspended', 'moderation.unsuspended'])
      .execute();
    expect(audits).toHaveLength(2);
  });

  it('serves the reviewer page with no inline script, and the routes are gone without a token', async () => {
    const page = await t.app.inject({ method: 'GET', url: '/admin/reports' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/^text\/html/);
    expect(page.headers['content-security-policy']).toContain("script-src 'self'");
    expect(page.body).toContain('<script src="/admin/reports.js"></script>');
    expect(page.body).not.toMatch(/<script>/);
    const js = await t.app.inject({ method: 'GET', url: '/admin/reports.js' });
    expect(js.statusCode).toBe(200);
    expect(js.body).toContain("'/admin/reports?status='");
    t.ctx.config.ADMIN_TOKEN = undefined;
    expect((await op('GET', '/v1/admin/reports')).statusCode).toBe(404);
  });
});
