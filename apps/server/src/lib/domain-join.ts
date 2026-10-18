/**
 * Onto a verified organization's team by an address at its domain (M16 C3b, review 2026-10-17
 * §1 H3): its owner or an admin turns it on (`organizations.domain_join`), and anyone with a
 * proven address there joins as a team member without an invite, through the one way onto a team
 * (`seatOnTeam`). An address counts once proven: the sign-in once its code came back, or one they
 * added and proved (R91), never one only typed. Teams are for adult people (R29), and someone the
 * team took off (`org_members.removed_at`) comes back only when a manager or an invite brings them.
 */
import { tr } from '@caime/core/i18n';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { notify } from './notify';
import { minorOf } from './users';

type Q = Kysely<Database> | Transaction<Database>;

/** The part of an address after its last @, as a domain is compared: lowercased. */
export const domainOf = (address: string): string =>
  address.slice(address.lastIndexOf('@') + 1).toLowerCase();

/** What of an organization says whether its domain lets people in. */
export type DomainOrg = {
  id: string;
  domain: string | null;
  verified_at: Date | null;
  domain_join: boolean;
  archived_at: Date | null;
};

/** Whether its domain lets anyone in at all: on, verified and open. */
export const takesByDomain = (org: DomainOrg): org is DomainOrg & { domain: string } =>
  org.domain_join && org.verified_at !== null && org.domain !== null && org.archived_at === null;

/**
 * Where someone stands with an organization's domain: the proven address that lets them join its
 * team now, or else their sign-in address there still waiting for its code. Both null for anyone
 * on the team, anyone it removed, anyone under 18 or not a person, and wherever it takes nobody by
 * its domain.
 */
export async function domainStanding(
  db: Q,
  org: DomainOrg,
  userId: string,
  now: Date,
): Promise<{ joinableAs: string | null; joinOnceConfirmed: string | null }> {
  const none = { joinableAs: null, joinOnceConfirmed: null };
  if (!takesByDomain(org)) return none;
  const [me, seat] = await Promise.all([
    db
      .selectFrom('users')
      .select(['kind', 'email', 'email_verified_at', 'birth_date', 'time_zone'])
      .where('id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst(),
    db
      .selectFrom('org_members')
      .select(['left_at', 'removed_at'])
      .where('org_id', '=', org.id)
      .where('user_id', '=', userId)
      .executeTakeFirst(),
  ]);
  if (me?.kind !== 'human' || minorOf(me, now)) return none;
  if (seat && (seat.left_at === null || seat.removed_at !== null)) return none;
  const domain = org.domain.toLowerCase();
  if (domainOf(me.email) === domain && me.email_verified_at)
    return { joinableAs: me.email, joinOnceConfirmed: null };
  const added = await db
    .selectFrom('own_addresses')
    .select('value')
    .where('user_id', '=', userId)
    .where('kind', '=', 'email')
    .where('verified_at', 'is not', null)
    .where(sql<boolean>`lower(split_part(value, '@', 2)) = ${domain}`)
    .orderBy('verified_at')
    .executeTakeFirst();
  if (added) return { joinableAs: added.value, joinOnceConfirmed: null };
  return { joinableAs: null, joinOnceConfirmed: domainOf(me.email) === domain ? me.email : null };
}

/**
 * An address just proven: if the organization that verified its domain takes people by it, they
 * hear they may join, and its page opens on the way in. Nothing for anyone it wouldn't let in.
 */
export async function offerTeamByDomain(
  ctx: AppContext,
  userId: string,
  address: string,
): Promise<void> {
  const domain = domainOf(address);
  const org = await ctx.db
    .selectFrom('organizations')
    .select(['id', 'name', 'handle', 'domain', 'verified_at', 'domain_join', 'archived_at'])
    .where(sql<boolean>`lower(domain) = ${domain}`)
    .where('verified_at', 'is not', null)
    .executeTakeFirst();
  if (!org) return;
  const { joinableAs } = await domainStanding(ctx.db, org, userId, ctx.now());
  if (!joinableAs) return;
  await notify(ctx, {
    userId,
    kind: 'business',
    level: 'activity',
    title: () => tr('You can join {org}’s team', { org: org.name }),
    body: () => tr('Your address at {domain} lets you in.', { domain }),
    data: { handle: org.handle, orgId: org.id },
    groupKey: `team-domain:${org.id}`,
  });
}
