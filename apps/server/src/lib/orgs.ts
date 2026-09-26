/**
 * Organizations (PRD §36, R15): who is on a team and in what role, and which verified
 * organization a person's "Verified at …" comes from.
 */
import { randomBytes } from 'node:crypto';
import { nextOwner } from '@caishy/core';
import type { Kysely, Transaction } from 'kysely';
import type { Database, Organization, OrgMember } from '../db/schema';
import { notFound } from './errors';

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
 * and one with nobody else on its team closes. Runs before the account row goes.
 */
export async function handOverOrgs(trx: Q, userId: string, now: Date): Promise<void> {
  const owned = await trx
    .selectFrom('org_members')
    .select('org_id')
    .where('user_id', '=', userId)
    .where('role', '=', 'owner')
    .where('left_at', 'is', null)
    .execute();
  if (owned.length === 0) return;
  await trx
    .updateTable('org_members')
    .set({ role: 'agent' })
    .where('user_id', '=', userId)
    .where('role', '=', 'owner')
    .execute();
  for (const { org_id } of owned) {
    const members = await trx
      .selectFrom('org_members')
      .select(['user_id', 'role', 'joined_at'])
      .where('org_id', '=', org_id)
      .where('left_at', 'is', null)
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
    else
      await trx
        .updateTable('organizations')
        .set({ archived_at: now })
        .where('id', '=', org_id)
        .execute();
  }
}
