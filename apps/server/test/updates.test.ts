import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owner
let omar: Client; // on the team, not an admin
let lina: Client; // follows, quietly
let kai: Client; // follows, and is told
let orgId: string;

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
const updates = async (c: Client) => c.get(`/v1/orgs/${orgId}/updates`);
const notified = async (c: Client) => {
  await t.ctx.flush();
  return ((await c.get('/v1/notifications')).notifications as any[]).filter(
    (n) => n.kind === 'update',
  );
};

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Farouk' });
  lina = await signup(t, { displayName: 'Lina Aziz' });
  kai = await signup(t, { displayName: 'Kai Short' });
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  orgId = (
    await noor.post('/v1/orgs', { name: 'Nile Dental', handle: 'nile.dental', kind: 'clinic' })
  ).org.id;
  await t.ctx.db
    .updateTable('organizations')
    .set({ plan: 'business' })
    .where('id', '=', orgId)
    .execute();
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
});
afterAll(async () => {
  await t.close();
});

describe('an organization’s updates (PRD §59)', () => {
  it('its owner and admins post; anyone reads them on its page, as the organization’s', async () => {
    for (const c of [omar, lina]) {
      const denied = await c.req('POST', `/v1/orgs/${orgId}/updates`, { body: 'Hello' });
      expect(denied.statusCode).toBe(403);
    }
    for (const body of ['   ', 'x'.repeat(2001)])
      expect((await noor.req('POST', `/v1/orgs/${orgId}/updates`, { body })).statusCode).toBe(400);
    const posted = await noor.req('POST', `/v1/orgs/${orgId}/updates`, {
      body: '  We open at 9 on Saturdays now.  ',
    });
    expect(posted.statusCode).toBe(201);
    expect(posted.json().update).toMatchObject({
      body: 'We open at 9 on Saturdays now.',
      org: { id: orgId, name: 'Nile Dental', handle: 'nile.dental' },
    });

    // Someone who doesn't follow it reads it too, and sees the organization, never who posted.
    const seen = await updates(lina);
    expect(seen).toMatchObject({
      updates: [{ body: 'We open at 9 on Saturdays now.', postedBy: null }],
      nextBefore: null,
      following: null,
      followers: null,
      canPost: false,
      blockedByMe: false,
    });
    expect(JSON.stringify(seen)).not.toContain(noor.user.id);
    // The team sees who on it posted, and how many follow.
    for (const c of [noor, omar]) {
      const team = await updates(c);
      expect(team.updates[0].postedBy).toEqual({ id: noor.user.id, displayName: 'Noor Haddad' });
      expect(team.followers).toBe(0);
      expect(team.canPost).toBe(c === noor);
    }
  });

  it('following is theirs alone: nobody sees who follows, and only those who asked are told', async () => {
    expect((await lina.req('PUT', `/v1/orgs/${orgId}/follow`, {})).json()).toEqual({
      following: { notify: false },
    });
    expect((await kai.req('PUT', `/v1/orgs/${orgId}/follow`, { notify: true })).json()).toEqual({
      following: { notify: true },
    });
    const team = await updates(noor);
    expect(team.followers).toBe(2);
    expect(JSON.stringify(team)).not.toContain(lina.user.id);
    expect(JSON.stringify(team)).not.toContain(kai.user.id);
    // What was posted before they followed isn't new to them.
    const before = (await lina.get('/v1/updates')).following;
    expect(before).toMatchObject([
      { org: { name: 'Nile Dental' }, unread: 0, notify: false, latest: { postedBy: null } },
    ]);

    // Whoever posts isn't told of their own update, even following it.
    await noor.req('PUT', `/v1/orgs/${orgId}/follow`, { notify: true });
    t.clock.advance(60_000);
    await noor.post(`/v1/orgs/${orgId}/updates`, { body: 'Closed on Monday for the holiday.' });
    const [kaiHeard] = await notified(kai);
    expect(kaiHeard).toMatchObject({
      title: 'Nile Dental',
      body: 'Closed on Monday for the holiday.',
      data: { orgId, handle: 'nile.dental' },
    });
    expect(JSON.stringify(kaiHeard)).not.toContain(noor.user.id);
    expect(await notified(lina)).toEqual([]);
    expect(await notified(noor)).toEqual([]);
    const now = (await lina.get('/v1/updates')).following[0];
    expect(now).toMatchObject({ unread: 1, latest: { body: 'Closed on Monday for the holiday.' } });
    await lina.post(`/v1/orgs/${orgId}/updates/read`, {});
    expect((await lina.get('/v1/updates')).following[0].unread).toBe(0);

    // Told from now on; following again without saying keeps it so; unfollowed, it's gone.
    await lina.req('PUT', `/v1/orgs/${orgId}/follow`, { notify: true });
    expect((await lina.req('PUT', `/v1/orgs/${orgId}/follow`, {})).json().following.notify).toBe(
      true,
    );
    expect((await updates(lina)).following).toEqual({ notify: true });
    await kai.req('DELETE', `/v1/orgs/${orgId}/follow`);
    await noor.req('DELETE', `/v1/orgs/${orgId}/follow`);
    expect((await kai.get('/v1/updates')).following).toEqual([]);
    expect((await updates(noor)).followers).toBe(1);
  });

  it('pages back through older ones', async () => {
    for (let i = 0; i < 3; i++) await noor.post(`/v1/orgs/${orgId}/updates`, { body: `Tip ${i}` });
    const first = await lina.get(`/v1/orgs/${orgId}/updates?limit=2`);
    expect(first.updates.map((u: any) => u.body)).toEqual(['Tip 2', 'Tip 1']);
    const next = await lina.get(`/v1/orgs/${orgId}/updates?limit=2&before=${first.nextBefore}`);
    expect(next.updates.map((u: any) => u.body)).toEqual([
      'Tip 0',
      'Closed on Monday for the holiday.',
    ]);
  });

  it('its own app posts with “updates”; no other app, and no token acting as a person', async () => {
    const mine = (
      await noor.post(`/v1/orgs/${orgId}/apps`, { name: 'Clinic News', scopes: ['updates'] })
    ).token as string;
    const posted = await as(mine, 'POST', `/v1/orgs/${orgId}/updates`, { body: 'From the app' });
    expect(posted.statusCode).toBe(201);
    expect((await as(mine, 'GET', `/v1/orgs/${orgId}/updates`)).statusCode).toBe(200);
    // The team sees it came from the app; everyone else, from the organization.
    expect((await updates(noor)).updates[0].postedBy.displayName).toBe('Clinic News');
    expect((await updates(lina)).updates[0].postedBy).toBeNull();

    const readOnly = (
      await noor.post(`/v1/orgs/${orgId}/apps`, { name: 'Reports', scopes: ['inbox:read'] })
    ).token as string;
    const noScope = await as(readOnly, 'POST', `/v1/orgs/${orgId}/updates`, { body: 'x' });
    expect(noScope.json().error.code).toBe('token_scope');
    const otherOrg = (
      await omar.post('/v1/orgs', { name: 'Other Shop', handle: 'other.shop', kind: 'shop' })
    ).org.id;
    const theirs = (
      await omar.post(`/v1/orgs/${otherOrg}/apps`, { name: 'Theirs', scopes: ['updates'] })
    ).token as string;
    expect((await as(theirs, 'POST', `/v1/orgs/${orgId}/updates`, { body: 'x' })).statusCode).toBe(
      404,
    );
    const personal = (
      await noor.post('/v1/me/tokens', { name: 'Script', scopes: ['messages:write'], days: 30 })
    ).token as string;
    const asPerson = await as(personal, 'POST', `/v1/orgs/${orgId}/updates`, { body: 'x' });
    expect(asPerson.json().error.code).toBe('token_route');
  });

  it('edited or taken back by the team, and every change is in the audit log', async () => {
    const id = (await updates(noor)).updates[0].id as string;
    expect(
      (await omar.req('PATCH', `/v1/orgs/${orgId}/updates/${id}`, { body: 'Nope' })).statusCode,
    ).toBe(403);
    const edited = await noor.patch(`/v1/orgs/${orgId}/updates/${id}`, { body: 'From the team' });
    expect(edited.update.editedAt).not.toBeNull();
    expect((await updates(lina)).updates[0].body).toBe('From the team');
    // Only its own organization's: another's update isn't reached through this one.
    const shop = (await omar.get('/v1/orgs')).orgs.find((o: any) => o.handle === 'other.shop').id;
    const theirs = (await omar.post(`/v1/orgs/${shop}/updates`, { body: 'Sale on' })).update.id;
    for (const method of ['PATCH', 'DELETE'] as const)
      expect(
        (await noor.req(method, `/v1/orgs/${orgId}/updates/${theirs}`, { body: 'Mine now' }))
          .statusCode,
      ).toBe(404);
    expect((await updates(omar)).updates.map((u: any) => u.body)).not.toContain('Mine now');
    expect((await omar.get(`/v1/orgs/${shop}/updates`)).updates[0].body).toBe('Sale on');
    await noor.req('DELETE', `/v1/orgs/${orgId}/updates/${id}`);
    expect((await updates(lina)).updates.map((u: any) => u.id)).not.toContain(id);
    expect((await noor.req('DELETE', `/v1/orgs/${orgId}/updates/${id}`)).statusCode).toBe(404);
    const logged = await t.ctx.db
      .selectFrom('audit_log')
      .select('action')
      .where('target', '=', orgId)
      .where('action', 'like', 'org.update_%')
      .execute();
    expect(new Set(logged.map((l) => l.action))).toEqual(
      new Set(['org.update_posted', 'org.update_edited', 'org.update_removed']),
    );
  });

  it('blocked, it stops reaching them, and they can’t follow it until they unblock it', async () => {
    await lina.post(`/v1/orgs/${orgId}/block`, {});
    expect((await lina.get('/v1/updates')).following).toEqual([]);
    const refused = await lina.req('PUT', `/v1/orgs/${orgId}/follow`, {});
    expect(refused.statusCode).toBe(409);
    expect((await updates(lina)).blockedByMe).toBe(true);
    await lina.req('DELETE', `/v1/orgs/${orgId}/block`);
    expect((await lina.req('PUT', `/v1/orgs/${orgId}/follow`, {})).statusCode).toBe(200);
    // What they follow is in their export.
    const exported = await lina.get('/v1/me/export');
    expect(exported.following).toEqual([
      expect.objectContaining({ organization: { name: 'Nile Dental', handle: 'nile.dental' } }),
    ]);
  });
});
