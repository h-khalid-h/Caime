/**
 * Organizations (PRD §36, R15): who is on a team and in what role, and which verified
 * organization a person's "Verified at …" comes from.
 */
import { randomBytes } from 'node:crypto';
import { nextOwner } from '@caime/core';
import type { Kysely, Transaction } from 'kysely';
import type { Database, Organization, OrgMember } from '../db/schema';
import { notFound } from './errors';
import { releaseHandle } from './handles';

type Q = Kysely<Database> | Transaction<Database>;

export async function orgById(db: Q, orgId: string): Promise<Organization> {
  const org = await db
    .selectFrom('organizations')
    .selectAll()
    .where('id', '=', orgId)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  if (!org) throw notFound('That organization');
  return org;
}

/** Your place on the team, or null when you aren't on it. */
export async function orgSeat(db: Q, userId: string, orgId: string): Promise<OrgMember | null> {
  return (
    (await db
      .selectFrom('org_members')
      .selectAll()
      .where('org_id', '=', orgId)
      .where('user_id', '=', userId)
      .where('left_at', 'is', null)
      .executeTakeFirst()) ?? null
  );
}

/**
 * For each person on the team of a verified organization, that organization's name (the one
 * they joined first). Their trust line reads "Verified at <name>".
 */
export async function verifiedOrgNames(db: Q, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectFrom('org_members as m')
    .innerJoin('organizations as o', 'o.id', 'm.org_id')
    .select(['m.user_id', 'o.name'])
    .where('m.user_id', 'in', ids)
    .where('m.left_at', 'is', null)
    .where('o.verified_at', 'is not', null)
    .where('o.archived_at', 'is', null)
    .orderBy('m.joined_at')
    .execute();
  const out = new Map<string, string>();
  for (const r of rows) if (!out.has(r.user_id)) out.set(r.user_id, r.name);
  return out;
}

/** The value a domain's TXT record must carry. */
export const newVerifyToken = () => randomBytes(18).toString('base64url');

/** DNS lookups, injectable so tests can stand in for the internet. */
export interface TxtResolver {
  resolveTxt(hostname: string): Promise<string[][]>;
}

/**
 * An account is going: each organization it owns passes to the next in line (admins first),
 * and one with nobody else on its team closes. Runs before the account row goes. Returns the
 * ones that closed (what they paid for ends too, once this is committed).
 */
export async function handOverOrgs(trx: Q, userId: string, now: Date): Promise<string[]> {
  const owned = await trx
    .selectFrom('org_members')
    .select('org_id')
    .where('user_id', '=', userId)
    .where('role', '=', 'owner')
    .where('left_at', 'is', null)
    .execute();
  if (owned.length === 0) return [];
  const closed: string[] = [];
  await trx
    .updateTable('org_members')
    .set({ role: 'agent' })
    .where('user_id', '=', userId)
    .where('role', '=', 'owner')
    .execute();
  for (const { org_id } of owned) {
    // People only: an app's bot never inherits an organization.
    const members = await trx
      .selectFrom('org_members as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select(['m.user_id', 'm.role', 'm.joined_at'])
      .where('m.org_id', '=', org_id)
      .where('m.left_at', 'is', null)
      .where('u.kind', '=', 'human')
      .execute();
    const heir = nextOwner(
      members.map((m) => ({
        userId: m.user_id,
        role: m.role,
        joinedAt: m.joined_at.toISOString(),
      })),
      userId,
    );
    if (heir)
      await trx
        .updateTable('org_members')
        .set({ role: 'owner' })
        .where('org_id', '=', org_id)
        .where('user_id', '=', heir)
        .execute();
    else {
      await closeOrg(trx, org_id, now);
      closed.push(org_id);
    }
  }
  return closed;
}

/**
 * An organization closes (R42): the last of its people gone, or its owner closing it. Its row
 * stays with everything its customers were sent (read-only for them from now on), its team's
 * seats end, its apps stop for good, and its handle stays in the namespace only if it was
 * verified, for whoever proves its domain again; else it's held a year, like a person's. What
 * it paid for and who followed it end after this, outside the transaction (billing, updates).
 */
export async function closeOrg(trx: Q, orgId: string, now: Date): Promise<void> {
  const org = await trx
    .selectFrom('organizations')
    .select(['handle', 'verified_at', 'archived_at'])
    .where('id', '=', orgId)
    .executeTakeFirst();
  if (!org || org.archived_at) return;
  await trx
    .updateTable('organizations')
    .set({ archived_at: now, reclaim_by: null, reclaim_token: null, updated_at: now })
    .where('id', '=', orgId)
    .execute();
  await trx
    .updateTable('org_members')
    .set({ left_at: now, role: 'agent' })
    .where('org_id', '=', orgId)
    .where('left_at', 'is', null)
    .execute();
  await trx
    .updateTable('participants')
    .set({ left_at: now })
    .where('role', '=', 'agent')
    .where('left_at', 'is', null)
    .where('conversation_id', 'in', (eb) =>
      eb.selectFrom('business_threads').select('conversation_id').where('org_id', '=', orgId),
    )
    .execute();
  await trx
    .updateTable('business_threads')
    .set({ assignee_id: null, updated_at: now })
    .where('org_id', '=', orgId)
    .execute();
  await trx
    .updateTable('api_tokens')
    .set({ revoked_at: now })
    .where('revoked_at', 'is', null)
    .where('app_id', 'in', (eb) =>
      eb.selectFrom('org_apps').select('id').where('org_id', '=', orgId),
    )
    .execute();
  await trx
    .updateTable('org_apps')
    .set({ revoked_at: now })
    .where('org_id', '=', orgId)
    .where('revoked_at', 'is', null)
    .execute();
  if (!org.verified_at) await releaseHandle(trx, org.handle, now);
}

/** A closed organization, by id: the one route in for whoever takes it back (R42). */
export async function closedOrgById(db: Q, orgId: string): Promise<Organization> {
  const org = await db
    .selectFrom('organizations')
    .selectAll()
    .where('id', '=', orgId)
    .where('archived_at', 'is not', null)
    .where('succeeded_by', 'is', null)
    .executeTakeFirst();
  if (!org) throw notFound('That organization');
  return org;
}
