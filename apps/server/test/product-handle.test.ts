/**
 * The product's own organization takes @caime (owner, 2026-10-25): only an organization whose
 * verified domain is the product's own (PUBLIC_URL's, cai.me), by its owner or an admin, through
 * the operator's one way of moving a reserved handle. Any other domain, handle or person is
 * answered as a taken handle is; @cai is Cai's and the AI members' handles are theirs.
 */
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let owner: Client;
let member: Client;
let stranger: Client;
const txt = new Map<string, string[][]>();

async function orgWithDomain(c: Client, handle: string, domain: string, verify = true) {
  const { org } = await c.post('/v1/orgs', {
    country: 'EG',
    name: `Org ${handle}`,
    handle,
    kind: 'business',
  });
  const set = (await c.req('PUT', `/v1/orgs/${org.id}/domain`, { domain })).json().org;
  if (verify) {
    txt.set(set.domain.record.name, [[set.domain.record.value]]);
    await c.post(`/v1/orgs/${org.id}/domain/check`);
  }
  return org.id as string;
}

beforeAll(async () => {
  t = await createTestApp({ PUBLIC_URL: 'https://cai.me' });
  t.ctx.dns = {
    resolveTxt: async (name) => {
      const found = txt.get(name);
      if (!found)
        throw Object.assign(new Error(`queryTxt ENOTFOUND ${name}`), { code: 'ENOTFOUND' });
      return found;
    },
  };
  owner = await signup(t, { displayName: 'Hussein Khalid' });
  member = await signup(t, { displayName: 'Sara Ali' });
  stranger = await signup(t, { displayName: 'Omar Farouk' });
});

afterAll(async () => {
  await t?.close();
});

describe('@caime for the product’s own organization (2026-10-25)', () => {
  it('is refused to an organization whose domain is anyone else’s', async () => {
    const other = await orgWithDomain(stranger, 'omar.co', 'omar.example');
    expect((await stranger.get(`/v1/orgs/${other}`)).org.claimableHandles).toEqual([]);
    const refused = await stranger.req('POST', `/v1/orgs/${other}/handle/claim`, {
      handle: 'caime',
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('handle_taken');
    // And creating one as @caime stays refused as a taken handle is.
    const made = await stranger.req('POST', '/v1/orgs', {
      country: 'EG',
      name: 'Caime',
      handle: 'caime',
      kind: 'business',
    });
    expect(made.json().error.code).toBe('handle_taken');
  });

  it('waits for the domain to be proven, then goes to its owner, audited and the old handle held', async () => {
    const id = await orgWithDomain(owner, 'khalid.labs', 'https://www.cai.me/', false);
    expect((await owner.get(`/v1/orgs/${id}`)).org.claimableHandles).toEqual([]);
    const early = await owner.req('POST', `/v1/orgs/${id}/handle/claim`, { handle: 'caime' });
    expect(early.json().error.code).toBe('handle_taken');
    const { org: pending } = await owner.get(`/v1/orgs/${id}`);
    txt.set(pending.domain.record.name, [[pending.domain.record.value]]);
    await owner.post(`/v1/orgs/${id}/domain/check`);
    expect((await owner.get(`/v1/orgs/${id}`)).org.claimableHandles).toEqual(['caime']);

    // A team member who doesn't run it is neither told nor let.
    const asked = await owner.post('/v1/connections/requests', { toUserId: member.user.id });
    await member.post(`/v1/connections/requests/${asked.requestId}/accept`, {});
    await owner.post(`/v1/orgs/${id}/members`, { userIds: [member.user.id], role: 'agent' });
    expect((await member.get(`/v1/orgs/${id}`)).org.claimableHandles).toEqual([]);
    expect(
      (await member.req('POST', `/v1/orgs/${id}/handle/claim`, { handle: 'caime' })).statusCode,
    ).toBe(403);

    // Only @caime: Cai's, the AI members' and the product's pages stay as they are.
    for (const handle of ['cai', 'caishy', 'support', 'momo']) {
      const no = await owner.req('POST', `/v1/orgs/${id}/handle/claim`, { handle });
      expect(no.json().error.code, handle).toBe('handle_taken');
    }

    const { org } = await owner.post(`/v1/orgs/${id}/handle/claim`, { handle: '@Caime' });
    expect(org.handle).toBe('caime');
    expect(org.claimableHandles).toEqual([]);
    expect((await stranger.get('/v1/orgs/by-handle/caime')).org.name).toBe('Org khalid.labs');
    // The handle it had is held from everyone, as any let go of is.
    const held = await stranger.req('POST', '/v1/orgs', {
      country: 'EG',
      name: 'Squatter',
      handle: 'khalid.labs',
      kind: 'business',
    });
    expect(held.json().error.code).toBe('handle_taken');
    const { rows } = await sql<{ actor_id: string | null; metadata: Record<string, unknown> }>`
      select actor_id, metadata from audit_log where action = 'handle.claimed' and target = ${id}
    `.execute(t.ctx.db);
    expect(rows).toEqual([
      {
        actor_id: owner.user.id,
        metadata: { of: 'organization', from: 'khalid.labs', to: 'caime', by: 'domain' },
      },
    ]);
    // Asked again, nothing moves and nothing more is written.
    expect((await owner.post(`/v1/orgs/${id}/handle/claim`, { handle: 'caime' })).org.handle).toBe(
      'caime',
    );
  });
});
