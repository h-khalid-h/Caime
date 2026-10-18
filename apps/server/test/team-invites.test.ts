/**
 * Team invites (M16 C3a, review 2026-10-17 §1 H3): an organization's owner or admins hand out a
 * link, or send one to an address, and whoever accepts it is on the team in the role it gives,
 * without having to be connected first. A link is open to whoever has it until it runs out or
 * is taken back; one sent to an address is for whoever proves that address, and is spent once.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { clearClosedOrg } from '../src/lib/org-data';
import { KEPT_DAYS, sweepRecords } from '../src/lib/retention';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let dir: string;
const mail = memoryMailer();
let noor: Client;
let omar: Client;
let lina: Client;
let orgId: string;
const PAGE = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

const tokenOf = (url: string) => url.split('/t/')[1] ?? '';
const visit = (url: string) => t.app.inject({ method: 'GET', url, headers: { accept: PAGE } });
const codeIn = (text: string) => /is (\d{6})\./.exec(text)?.[1] ?? '';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'caime-team-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' }, { mail });
  noor = await signup(t, { displayName: 'Noor Haddad', handle: 'noor' });
  omar = await signup(t, { displayName: 'Omar Farouk', handle: 'omar' });
  lina = await signup(t, { displayName: 'Lina Customer', handle: 'lina' });
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
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id], role: 'admin' });
  // A customer wrote before anyone new joined: whoever joins answers it too.
  const { conversationId } = await lina.post(`/v1/orgs/${orgId}/conversations`, {});
  await lina.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: crypto.randomUUID(),
    body: 'Is there a time on Thursday?',
  });
  // The room on the team isn't what these tests are about, except where one says so.
  await t.ctx.db
    .updateTable('organizations')
    .set({ plan: 'business' })
    .where('id', '=', orgId)
    .execute();
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('a link to share', () => {
  let token: string;
  let inviteId: string;

  it('is made by the owner, its token shown once and kept only as its hash', async () => {
    const made = await noor.post(`/v1/orgs/${orgId}/invites`, {});
    expect(made.url).toMatch(/^https:\/\/caime\.example\/t\/t_[A-Za-z0-9_-]{43}$/);
    expect(made.invite).toMatchObject({ role: 'agent', email: null, uses: 0 });
    token = tokenOf(made.url);
    inviteId = made.invite.id;
    // Listed for the team without its token.
    const listed = await omar.get(`/v1/orgs/${orgId}/invites`);
    expect(listed.invites.map((i: { id: string }) => i.id)).toContain(inviteId);
    expect(JSON.stringify(listed)).not.toContain(token);
    // The database has its hash alone.
    const row = await t.ctx.db
      .selectFrom('org_invites')
      .selectAll()
      .where('id', '=', inviteId)
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.token_hash.length).toBe(32);
  });

  it('reads to a visitor as a page without the app, with the ways in carrying it', async () => {
    const page = await visit(`/t/${token}`);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<meta name="caime-page" content="team-invite">');
    expect(page.body).toContain('<meta name="robots" content="noindex">');
    expect(page.body).toContain('<h1>Noor Haddad invites you to Nile Dental’s team</h1>');
    expect(page.body).toContain('<dt class="mono">Role</dt><dd>Team</dd>');
    expect(page.body).toContain('Whoever has this link');
    expect(page.body).toContain(`href="/sign-up?link=${encodeURIComponent(`/t/${token}`)}"`);
    expect(page.body).toContain(`href="/sign-in?link=${encodeURIComponent(`/t/${token}`)}"`);
    expect(page.body).not.toContain('entry-abc.js');
    // A token nobody has is nobody's page, and a token of the wrong shape isn't looked up; the
    // page says the invite isn't open, never that nobody has a handle.
    const gone = await visit(`/t/t_${'x'.repeat(43)}`);
    expect(gone.statusCode).toBe(404);
    expect(gone.body).toContain('<h1>This invite isn’t open</h1>');
    expect(gone.body).not.toContain('Nobody by that handle');
    expect((await visit('/t/short')).statusCode).toBe(404);
  });

  it('opens for whoever has it, signed in, and joins them as it says', async () => {
    const karim = await signup(t, { displayName: 'Karim Saleh', handle: 'karim' });
    const open = await karim.get(`/v1/team-invites/${token}`);
    expect(open.invite).toMatchObject({
      org: {
        id: orgId,
        name: 'Nile Dental',
        handle: 'nile.dental',
        kind: 'clinic',
        verified: false,
      },
      role: 'agent',
      invitedBy: 'Noor Haddad',
      onTeam: false,
      addressed: 'anyone',
    });
    const joined = await karim.post(`/v1/team-invites/${token}/accept`);
    expect(joined).toEqual({ orgId, handle: 'nile.dental', already: false });
    const mine = await karim.get('/v1/orgs');
    expect(mine.orgs.find((o: { id: string }) => o.id === orgId)?.myRole).toBe('agent');
    // The customer's conversation from before is theirs to answer too.
    const inbox = await karim.get(`/v1/orgs/${orgId}/inbox`);
    expect(JSON.stringify(inbox)).toContain('Is there a time on Thursday?');
    // Twice is once; the invite counts the one.
    expect(await karim.post(`/v1/team-invites/${token}/accept`)).toEqual({
      orgId,
      handle: 'nile.dental',
      already: true,
    });
    expect((await karim.get(`/v1/team-invites/${token}`)).invite.onTeam).toBe(true);
    const listed = await noor.get(`/v1/orgs/${orgId}/invites`);
    expect(listed.invites.find((i: { id: string }) => i.id === inviteId)?.uses).toBe(1);
    // Whoever asked hears it, and the log says through which invite.
    await t.ctx.flush();
    const told = await noor.get('/v1/notifications');
    expect(JSON.stringify(told)).toContain('Karim Saleh joined Nile Dental’s team');
    const logged = await t.ctx.db
      .selectFrom('audit_log')
      .select('metadata')
      .where('action', '=', 'org.members_added')
      .where('actor_id', '=', karim.user.id)
      .executeTakeFirstOrThrow();
    expect(logged.metadata).toMatchObject({ userIds: [karim.user.id], inviteId });
  });

  it('opens nothing once taken back, and only the team takes it back', async () => {
    const made = await omar.post(`/v1/orgs/${orgId}/invites`, {});
    const id = made.invite.id;
    expect((await lina.req('DELETE', `/v1/orgs/${orgId}/invites/${id}`)).statusCode).toBe(404);
    await omar.del(`/v1/orgs/${orgId}/invites/${id}`);
    const late = await signup(t, {});
    expect((await late.req('GET', `/v1/team-invites/${tokenOf(made.url)}`)).statusCode).toBe(404);
    expect(
      (await late.req('POST', `/v1/team-invites/${tokenOf(made.url)}/accept`)).statusCode,
    ).toBe(404);
    expect((await visit(`/t/${tokenOf(made.url)}`)).statusCode).toBe(404);
    expect((await omar.req('DELETE', `/v1/orgs/${orgId}/invites/${id}`)).statusCode).toBe(404);
    const listed = await noor.get(`/v1/orgs/${orgId}/invites`);
    expect(listed.invites.map((i: { id: string }) => i.id)).not.toContain(id);
  });

  it('runs out after its days, and is forgotten a while after', async () => {
    const made = await noor.post(`/v1/orgs/${orgId}/invites`, {});
    const late = await signup(t, {});
    const kept = async () =>
      (
        await t.ctx.db
          .selectFrom('org_invites')
          .select('id')
          .where('id', '=', made.invite.id)
          .execute()
      ).length;
    t.clock.advance(15 * 86_400_000);
    try {
      expect((await late.req('GET', `/v1/team-invites/${tokenOf(made.url)}`)).statusCode).toBe(404);
      const listed = await noor.get(`/v1/orgs/${orgId}/invites`);
      expect(listed.invites.map((i: { id: string }) => i.id)).not.toContain(made.invite.id);
      // Run out, it's kept as a spent invite link is, then the sweep forgets it.
      await sweepRecords(t.ctx);
      expect(await kept()).toBe(1);
      t.clock.advance(KEPT_DAYS.spentInvites * 86_400_000);
      await sweepRecords(t.ctx);
      expect(await kept()).toBe(0);
    } finally {
      t.clock.advance(-(15 + KEPT_DAYS.spentInvites) * 86_400_000);
    }
  });
});

describe('who makes them, and for whom', () => {
  it('is the owner and admins only; an admin invites to the team, the owner an admin too', async () => {
    const agent = await signup(t, {});
    const link = await noor.post(`/v1/orgs/${orgId}/invites`, {});
    await agent.post(`/v1/team-invites/${tokenOf(link.url)}/accept`);
    // Someone on the team who doesn't run it, and someone not on it.
    expect((await agent.req('POST', `/v1/orgs/${orgId}/invites`, {})).statusCode).toBe(403);
    expect((await agent.req('GET', `/v1/orgs/${orgId}/invites`)).statusCode).toBe(403);
    expect((await lina.req('POST', `/v1/orgs/${orgId}/invites`, {})).statusCode).toBe(404);
    expect((await lina.req('GET', `/v1/orgs/${orgId}/invites`)).statusCode).toBe(404);
    // An admin makes no admins.
    const refused = await omar.req('POST', `/v1/orgs/${orgId}/invites`, { role: 'admin' });
    expect(refused.statusCode).toBe(403);
    const admin = await noor.post(`/v1/orgs/${orgId}/invites`, { role: 'admin' });
    const dana = await signup(t, { displayName: 'Dana Admin' });
    await dana.post(`/v1/team-invites/${tokenOf(admin.url)}/accept`);
    expect(
      (await dana.get('/v1/orgs')).orgs.find((o: { id: string }) => o.id === orgId)?.myRole,
    ).toBe('admin');
  });

  it('is never accepted by someone under 18', async () => {
    const link = await noor.post(`/v1/orgs/${orgId}/invites`, {});
    const teen = await signup(t, { birthDate: '2012-05-01' });
    const res = await teen.req('POST', `/v1/team-invites/${tokenOf(link.url)}/accept`);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toBe('Teams are for people over 18.');
  });

  it('keeps to the team’s room on its plan', async () => {
    const small = (
      await noor.post('/v1/orgs', {
        country: 'EG',
        name: 'Small Shop',
        handle: 'small.shop',
        kind: 'shop',
      })
    ).org.id;
    const link = await noor.post(`/v1/orgs/${small}/invites`, {});
    // Free has room for three: the owner and two more.
    for (let i = 0; i < 2; i++)
      await (await signup(t, {})).post(`/v1/team-invites/${tokenOf(link.url)}/accept`);
    const fourth = await signup(t, {});
    const res = await fourth.req('POST', `/v1/team-invites/${tokenOf(link.url)}/accept`);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('plan_limit');
    // A refused acceptance spends nothing.
    const listed = await noor.get(`/v1/orgs/${small}/invites`);
    expect(listed.invites[0].uses).toBe(2);
  });
});

describe('an invite sent to an address', () => {
  it('is mailed once with its link, and is for that address alone, spent by its use', async () => {
    const before = mail.outbox.length;
    const made = await noor.post(`/v1/orgs/${orgId}/invites`, { email: 'Sara@Example.com' });
    expect(made.invite.email).toBe('sara@example.com');
    await t.ctx.flush();
    const sent = mail.outbox.slice(before).find((m) => m.to === 'sara@example.com');
    expect(sent?.subject).toBe("Join Nile Dental's team on Caime");
    expect(sent?.text).toContain(made.url);
    expect(sent?.text).toContain('Noor Haddad invited you to answer for Nile Dental on Caime.');
    // Plain 7-bit text (R48), names aside.
    expect(sent?.text.replace(/Nile Dental|Noor Haddad/g, '')).toMatch(/^[\x20-\x7e\n]*$/);
    const token = tokenOf(made.url);
    // Someone else with the link: told it's for another address, never which.
    const other = await signup(t, {});
    const opened = await other.get(`/v1/team-invites/${token}`);
    expect(opened.invite.addressed).toBe('elsewhere');
    expect(JSON.stringify(opened)).not.toContain('sara@');
    expect((await other.req('POST', `/v1/team-invites/${token}/accept`)).statusCode).toBe(403);
    // The address's owner signs up with it: theirs once its code comes back.
    const sara = await signup(t, { displayName: 'Sara Nabil', email: 'sara@example.com' });
    expect((await sara.get(`/v1/team-invites/${token}`)).invite.addressed).toBe('unconfirmed');
    const early = await sara.req('POST', `/v1/team-invites/${token}/accept`);
    expect(early.statusCode).toBe(403);
    expect(early.json().error.message).toBe(
      'Confirm your address first: the invite was sent to it.',
    );
    await t.ctx.flush();
    const code = codeIn(mail.outbox.filter((m) => m.to === 'sara@example.com').at(-1)?.text ?? '');
    await sara.post('/v1/auth/email/verify', { code });
    expect((await sara.get(`/v1/team-invites/${token}`)).invite.addressed).toBe('you');
    expect((await sara.post(`/v1/team-invites/${token}/accept`)).already).toBe(false);
    // Spent: its link opens nothing now, and it's off the team's list.
    expect((await sara.req('GET', `/v1/team-invites/${token}`)).statusCode).toBe(404);
    const listed = await noor.get(`/v1/orgs/${orgId}/invites`);
    expect(listed.invites.map((i: { id: string }) => i.id)).not.toContain(made.invite.id);
    // The audit says it was sent to an address, never which.
    const logged = await t.ctx.db
      .selectFrom('audit_log')
      .select('metadata')
      .where('action', '=', 'org.invite_made')
      .where(sql<boolean>`metadata->>'inviteId' = ${made.invite.id}`)
      .executeTakeFirstOrThrow();
    expect(logged.metadata).toMatchObject({ byEmail: true, role: 'agent' });
    expect(JSON.stringify(logged.metadata)).not.toContain('sara');
  });

  it('works for an address someone added and proved theirs (R91)', async () => {
    const made = await noor.post(`/v1/orgs/${orgId}/invites`, { email: 'yusuf@work.example' });
    const yusuf = await signup(t, { displayName: 'Yusuf Adel', email: 'yusuf@home.example' });
    const token = tokenOf(made.url);
    expect((await yusuf.get(`/v1/team-invites/${token}`)).invite.addressed).toBe('elsewhere');
    await t.ctx.db
      .insertInto('own_addresses')
      .values({
        id: crypto.randomUUID(),
        user_id: yusuf.user.id,
        kind: 'email',
        value: 'yusuf@work.example',
        verified_at: t.clock.now,
      })
      .execute();
    expect((await yusuf.get(`/v1/team-invites/${token}`)).invite.addressed).toBe('you');
    expect((await yusuf.post(`/v1/team-invites/${token}/accept`)).already).toBe(false);
  });

  it('cannot be sent without a mailer, while a link still can', async () => {
    const bare = await createTestApp({ PUBLIC_URL: 'https://caime.example' });
    try {
      const owner = await signup(bare, {});
      const id = (
        await owner.post('/v1/orgs', {
          country: 'EG',
          name: 'River Books',
          handle: 'river.books',
          kind: 'shop',
        })
      ).org.id;
      const res = await owner.req('POST', `/v1/orgs/${id}/invites`, { email: 'a@example.com' });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('email_unavailable');
      expect((await owner.post(`/v1/orgs/${id}/invites`, {})).url).toContain('/t/t_');
    } finally {
      await bare.close();
    }
  });
});

describe('an organization that closes', () => {
  it('takes its invites with it', async () => {
    const id = (
      await noor.post('/v1/orgs', {
        country: 'EG',
        name: 'Brief Cafe',
        handle: 'brief.cafe',
        kind: 'shop',
      })
    ).org.id;
    const link = await noor.post(`/v1/orgs/${id}/invites`, {});
    await noor.post(`/v1/orgs/${id}/invites`, { email: 'staff@cafe.example' });
    await noor.post(`/v1/orgs/${id}/close`, {});
    const late = await signup(t, {});
    expect((await late.req('GET', `/v1/team-invites/${tokenOf(link.url)}`)).statusCode).toBe(404);
    expect((await visit(`/t/${tokenOf(link.url)}`)).statusCode).toBe(404);
    // Its export, open to its last owner, lists what it handed out, never a token.
    const exported = await noor.get(`/v1/orgs/${id}/export`);
    expect(
      exported.invites.map((i: { email: string | null; role: string }) => [i.email, i.role]),
    ).toEqual([
      [null, 'agent'],
      ['staff@cafe.example', 'agent'],
    ]);
    expect(JSON.stringify(exported)).not.toContain(tokenOf(link.url));
    // Once that's over, what was its alone goes, the addresses it invited with it.
    t.clock.advance(31 * 86_400_000);
    try {
      expect(await clearClosedOrg(t.ctx, id)).toBe(true);
    } finally {
      t.clock.advance(-31 * 86_400_000);
    }
    const left = await t.ctx.db
      .selectFrom('org_invites')
      .select('id')
      .where('org_id', '=', id)
      .execute();
    expect(left).toEqual([]);
  });
});
