import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { orgsOf } from '../src/lib/orgs';
import { orgRowByHandle } from '../src/lib/public-pages';
import { KEPT_DAYS, sweepRecords } from '../src/lib/retention';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * Reports that hold up (M16 B3): what the reporter saw is kept with the report whatever is
 * deleted since, a child's safety comes first, a closed report goes after its time, and the
 * operator can suspend an organization and correct a date of birth.
 */
const ADMIN = 'operator-token-for-the-reports-test-0123456789';
let t: TestApp;
let noor: Client;
let sam: Client;
let lina: Client;
let rana: Client;
let direct: string;

const op = (method: 'GET' | 'PATCH' | 'POST' | 'PUT', url: string, body?: unknown) =>
  t.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${ADMIN}` },
    payload: body as Record<string, unknown> | undefined,
  });
const send = async (c: Client, conversationId: string, body: string) =>
  (
    await c.post(`/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body,
    })
  ).message.id as string;
const reports = async (status = 'open') =>
  (await op('GET', `/v1/admin/reports?status=${status}`)).json().reports as any[];

beforeAll(async () => {
  t = await createTestApp({ ADMIN_TOKEN: ADMIN });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  lina = await signup(t, { displayName: 'Lina Customer' });
  rana = await signup(t, { displayName: 'Rana New' });
  const r = await noor.post('/v1/connections/requests', {
    toUserId: sam.user.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  direct = (await sam.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
});

describe('reports that hold up (M16 B3)', () => {
  it('keeps what the reporter saw, whatever its sender deletes since', async () => {
    const ids: string[] = [];
    for (const word of ['one', 'two', 'three', 'four', 'five', 'six', 'seven'])
      ids.push(await send(sam, direct, word));
    // What the reporter had hidden for themselves isn't theirs to hand over, and a private
    // message's words are nobody's to keep.
    expect((await noor.req('DELETE', `/v1/messages/${ids[2]}?forEveryone=false`)).statusCode).toBe(
      200,
    );
    await t.ctx.db
      .updateTable('messages')
      .set({ sealed: JSON.stringify({ v: 1 }) as never })
      .where('id', '=', ids[4]!)
      .execute();
    const made = await noor.req('POST', '/v1/reports', {
      userId: sam.user.id,
      messageId: ids[6],
      reason: 'harassment',
    });
    expect(made.statusCode).toBe(201);
    // The sender takes it down for everyone afterwards: the report still holds what was said.
    expect((await sam.req('DELETE', `/v1/messages/${ids[6]}`)).statusCode).toBe(200);
    const [report] = await reports();
    expect(report.message).toMatchObject({ id: ids[6], removed: true, body: null });
    expect(report.evidence.map((e: any) => e.body)).toEqual(['one', 'two', 'four', 'six', 'seven']);
    expect(report.evidence.map((e: any) => e.reported)).toEqual([false, false, false, false, true]);
    expect(report.evidence[4]).toMatchObject({
      messageId: ids[6],
      senderId: sam.user.id,
      senderName: 'Sam Rivera',
      kind: 'text',
      imported: false,
    });
  });

  it('puts a child’s safety first, and lets a closed report go after its time', async () => {
    const urgent = await noor.req('POST', '/v1/reports', {
      userId: sam.user.id,
      reason: 'child_safety',
    });
    expect(urgent.statusCode).toBe(201);
    await noor.post('/v1/reports', { userId: sam.user.id, reason: 'spam' });
    const open = await reports();
    // Older than the spam report, it's still read first.
    expect(open.map((r) => r.reason)).toEqual(['child_safety', 'spam', 'harassment']);
    const [child, spam, harassment] = open;
    for (const r of [child, spam, harassment]) {
      const done = await op('PATCH', `/v1/admin/reports/${r.id}`, { status: 'dismissed' });
      expect(done.json().report.closedAt).not.toBeNull();
    }
    // Opened again, it isn't closed any more; closed again, it is.
    const reopened = await op('PATCH', `/v1/admin/reports/${spam.id}`, { status: 'open' });
    expect(reopened.json().report.closedAt).toBeNull();
    await op('PATCH', `/v1/admin/reports/${spam.id}`, { status: 'actioned' });

    const closedDaysAgo = (id: string, days: number) =>
      t.ctx.db
        .updateTable('reports')
        .set({ closed_at: new Date(t.clock.now.getTime() - days * 86_400_000) })
        .where('id', '=', id)
        .execute();
    const left = async () =>
      (await t.ctx.db.selectFrom('reports').select('id').execute()).map((r) => r.id);
    await closedDaysAgo(child.id, KEPT_DAYS.closedReports + 1);
    await closedDaysAgo(spam.id, KEPT_DAYS.closedReports + 1);
    await closedDaysAgo(harassment.id, KEPT_DAYS.closedReports - 1);
    await sweepRecords(t.ctx);
    expect(await left()).toEqual(expect.arrayContaining([child.id, harassment.id]));
    expect(await left()).not.toContain(spam.id);
    // A child's safety is kept a year after it closes, then it goes, its evidence with it.
    await closedDaysAgo(child.id, KEPT_DAYS.childSafetyReports + 1);
    await closedDaysAgo(harassment.id, KEPT_DAYS.closedReports + 1);
    await sweepRecords(t.ctx);
    expect(await left()).toEqual([]);
    expect(await t.ctx.db.selectFrom('report_evidence').select('report_id').execute()).toEqual([]);
  });

  it('suspends an organization: nobody new finds it, nothing is written as it or to it', async () => {
    const org = (
      await noor.post('/v1/orgs', {
        country: 'EG',
        name: 'Tiles Co',
        handle: 'tiles.co',
        kind: 'business',
      })
    ).org;
    await noor.post(`/v1/orgs/${org.id}/members`, { userIds: [sam.user.id] });
    const convo = (await lina.post(`/v1/orgs/${org.id}/conversations`)).conversationId;
    await send(lina, convo, 'Do you have the blue tiles?');
    const app = await noor.req('POST', `/v1/orgs/${org.id}/apps`, {
      name: 'Stock',
      scopes: ['inbox:read'],
    });
    const asApp = () =>
      t.app.inject({
        method: 'GET',
        url: '/v1/apps/me',
        headers: { authorization: `Bearer ${app.json().token}` },
      });
    expect((await asApp()).statusCode).toBe(200);
    expect(await orgsOf(t.ctx.db, sam.user.id)).toHaveLength(1);

    const suspended = await op('PUT', '/v1/admin/orgs/tiles.co/suspension', {
      suspended: true,
      reason: 'Selling counterfeit goods',
    });
    expect(suspended.statusCode).toBe(200);
    const audit = await t.ctx.db
      .selectFrom('audit_log')
      .select('metadata')
      .where('action', '=', 'moderation.org_suspended')
      .where('target', '=', org.id)
      .executeTakeFirstOrThrow();
    expect(audit.metadata).toEqual({ reason: 'Selling counterfeit goods', operator: 'operator' });

    // To anyone new it answers as nobody's: not found by its handle, its id or a search, no
    // page, no new conversation.
    expect((await rana.req('GET', '/v1/orgs/by-handle/tiles.co')).statusCode).toBe(404);
    expect((await rana.req('GET', `/v1/orgs/${org.id}`)).statusCode).toBe(404);
    expect((await rana.get('/v1/orgs/search?q=tiles')).orgs).toEqual([]);
    expect(await orgRowByHandle(t.ctx.db, 'tiles.co')).toBeNull();
    const start = await rana.req('POST', `/v1/orgs/${org.id}/conversations`);
    expect(start.statusCode).toBe(409);
    expect(start.json().error.code).toBe('org_suspended');
    // Nor does it vouch for its team on their profiles.
    expect(await orgsOf(t.ctx.db, sam.user.id)).toEqual([]);

    // Its customer keeps the conversation, to read: nothing is written to it or as it.
    expect((await lina.req('GET', '/v1/orgs/by-handle/tiles.co')).statusCode).toBe(200);
    const hers = (await lina.get(`/v1/conversations/${convo}`)).conversation;
    expect(hers.business.orgSuspended).toBe(true);
    expect((await lina.req('GET', `/v1/conversations/${convo}/messages`)).statusCode).toBe(200);
    for (const who of [lina, sam]) {
      const refused = await who.req('POST', `/v1/conversations/${convo}/messages`, {
        clientId: uuidv4(),
        kind: 'text',
        body: 'Hello?',
      });
      expect(refused.statusCode).toBe(409);
      expect(refused.json().error.code).toBe('org_suspended');
    }
    // Its team reads why; a customer reads only that it's suspended.
    expect((await sam.get(`/v1/orgs/${org.id}`)).org.suspension).toMatchObject({
      reason: 'Selling counterfeit goods',
    });
    expect((await lina.get(`/v1/orgs/${org.id}`)).org.suspension).toBeNull();
    // Its apps' tokens are refused, and it posts no update.
    expect((await asApp()).statusCode).toBe(401);
    const update = await noor.req('POST', `/v1/orgs/${org.id}/updates`, { body: 'Sale!' });
    expect(update.statusCode).toBe(409);

    // Lifted, all of it comes back.
    expect(
      (await op('PUT', '/v1/admin/orgs/tiles.co/suspension', { suspended: false })).statusCode,
    ).toBe(200);
    expect((await rana.req('GET', '/v1/orgs/by-handle/tiles.co')).statusCode).toBe(200);
    expect((await asApp()).statusCode).toBe(200);
    expect(await send(lina, convo, 'Thanks, all good now')).toBeTruthy();
    expect(
      (await noor.req('POST', `/v1/orgs/${org.id}/updates`, { body: 'Sale!' })).statusCode,
    ).toBe(201);
    expect((await sam.get(`/v1/orgs/${org.id}`)).org.suspension).toBeNull();
  });

  it('suspends the organization a report names, from the report', async () => {
    const org = (
      await noor.post('/v1/orgs', {
        country: 'EG',
        name: 'Quick Loans',
        handle: 'quickloans.co',
        kind: 'business',
      })
    ).org;
    await lina.post('/v1/reports', { orgId: org.id, reason: 'scam' });
    const [report] = await reports();
    expect(report.org).toMatchObject({ id: org.id, suspended: false });
    const done = await op('POST', `/v1/admin/reports/${report.id}/suspend-org`);
    expect(done.statusCode).toBe(200);
    expect(done.json().report).toMatchObject({ status: 'actioned', org: { suspended: true } });
    expect((await noor.get(`/v1/orgs/${org.id}`)).org.suspension.reason).toBe(
      `Report ${report.id}: scam`,
    );
    // A report about a person names no organization to suspend.
    await noor.post('/v1/reports', { userId: sam.user.id, reason: 'spam' });
    const [aboutSam] = await reports();
    expect((await op('POST', `/v1/admin/reports/${aboutSam.id}/suspend-org`)).statusCode).toBe(400);
  });

  it('corrects a date of birth: a real day, never too young, kept out of the audit log', async () => {
    const teen = await signup(t, { displayName: 'Rami Said' });
    const handle = teen.user.handle;
    const put = (birthDate: string) =>
      op('PUT', `/v1/admin/people/${handle}/birth-date`, { birthDate });
    expect(
      (
        await t.app.inject({
          method: 'PUT',
          url: `/v1/admin/people/${handle}/birth-date`,
          headers: { authorization: `Bearer ${teen.token}` },
          payload: { birthDate: '2010-01-01' },
        })
      ).statusCode,
    ).toBe(401);
    expect((await put('2010-02-31')).statusCode).toBe(400);
    const young = await put('2020-01-01');
    expect(young.statusCode).toBe(400);
    expect(young.json().error.code).toBe('too_young');
    expect((await teen.get('/v1/me')).user.minor).toBe(false);

    expect((await put('2010-01-01')).statusCode).toBe(200);
    // Under 18 at once: the rules read it on every request.
    expect((await teen.get('/v1/me')).user.minor).toBe(true);
    const audit = await t.ctx.db
      .selectFrom('audit_log')
      .select(['metadata', 'target'])
      .where('action', '=', 'moderation.birth_date')
      .executeTakeFirstOrThrow();
    expect(audit).toEqual({ metadata: { operator: 'operator' }, target: teen.user.id });
    expect(JSON.stringify(audit)).not.toContain('2010');
  });
});
