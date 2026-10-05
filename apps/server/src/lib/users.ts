/**
 * User records and their two views: `meView` (the account owner) and `personView` (anyone else,
 * filtered by the owner's privacy rules and the owner's classification of the viewer).
 */
import {
  canSee,
  defaultPolicies,
  defaultPrivacy,
  defaultWorkweek,
  isMinor,
  type MeView,
  type PersonView,
  type PrivacySettings,
  type Sphere,
  trustFor,
  type UserPreferences,
  uuidv7,
} from '@caime/core';
import type { Kysely, Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database, User } from '../db/schema';
import { currencyOf } from './geo';

export const ONLINE_WINDOW_MS = 2 * 60_000;

/** Under 18 (R29), from the date of birth where they are: select `birth_date` and `time_zone`. */
export function minorOf(user: Pick<User, 'birth_date' | 'time_zone'>, now: Date): boolean {
  return isMinor(user.birth_date, now, user.time_zone);
}

export function privacyOf(
  user: Pick<User, 'privacy' | 'birth_date' | 'time_zone'>,
  now: Date,
): PrivacySettings {
  const fallback = defaultPrivacy({ minor: minorOf(user, now) });
  const p = user.privacy as Partial<PrivacySettings> | null;
  if (!p) return fallback;
  return {
    fields: { ...fallback.fields, ...(p.fields ?? {}) },
    discoverByHandle: p.discoverByHandle ?? fallback.discoverByHandle,
    // Minors are never discoverable by email, whatever is stored (R29).
    discoverByEmail: minorOf(user, now) ? false : (p.discoverByEmail ?? fallback.discoverByEmail),
    messageRequests: p.messageRequests ?? fallback.messageRequests,
  };
}

export function avatarUrl(user: Pick<User, 'id' | 'avatar_file_id'>): string | null {
  return user.avatar_file_id
    ? `/v1/users/${user.id}/avatar?v=${user.avatar_file_id.slice(-8)}`
    : null;
}

export type { MeView, PersonView };

export function meView(user: User, now: Date): MeView {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified_at !== null,
    handle: user.handle,
    displayName: user.display_name,
    kind: user.kind,
    birthDate: user.birth_date,
    minor: minorOf(user, now),
    locale: user.locale,
    timeZone: user.time_zone,
    country: user.country,
    currency: currencyOf(user.country),
    workweek: user.workweek,
    quietHours: user.quiet_hours ?? null,
    plan: user.plan,
    avatarUrl: avatarUrl(user),
    bio: user.bio,
    pronouns: user.pronouns,
    statusText: user.status_text,
    statusEmoji: user.status_emoji,
    presence: user.presence,
    privacy: privacyOf(user, now),
    preferences: (user.preferences ?? {}) as UserPreferences,
    aiEnabled: user.ai_enabled,
    onboarded: user.onboarded_at !== null,
    createdAt: user.created_at.toISOString(),
  };
}

export interface ViewerRelation {
  isSelf: boolean;
  isConnected: boolean;
  blocked: boolean;
  /** The owner's classification of the viewer (spheres), never revealed. */
  ownerSpheresForViewer: Sphere[];
  preset?: 'open' | 'standard' | 'limited';
  sharesConversation?: boolean;
  verifiedOrgName?: string | null;
}

export function presenceOf(
  user: Pick<User, 'presence' | 'last_active_at'>,
  now: Date,
): 'online' | 'busy' | 'away' | 'offline' {
  if (user.presence === 'invisible') return 'offline';
  if (user.presence === 'busy') return 'busy';
  if (user.presence === 'away') return 'away';
  const active =
    user.last_active_at && now.getTime() - user.last_active_at.getTime() < ONLINE_WINDOW_MS;
  return active ? 'online' : 'offline';
}

export function personView(
  user: User,
  viewer: ViewerRelation,
  now: Date,
  identity?: { displayName: string; headline: string | null; orgName: string | null } | null,
): PersonView {
  const privacy = privacyOf(user, now);
  const v = { ...viewer };
  const see = (field: Parameters<typeof canSee>[1]) => canSee(privacy, field, v);
  const presence = see('onlineStatus') ? presenceOf(user, now) : null;
  return {
    id: user.id,
    handle: user.handle,
    displayName: identity?.displayName ?? user.display_name,
    kind: user.kind,
    avatarUrl: see('profilePhoto') ? avatarUrl(user) : null,
    bio: see('bio') ? user.bio : null,
    pronouns: see('pronouns') ? user.pronouns : null,
    statusText: see('status') ? user.status_text : null,
    statusEmoji: see('status') ? user.status_emoji : null,
    presence,
    lastSeenAt:
      see('lastSeen') && user.last_active_at && user.presence !== 'invisible'
        ? user.last_active_at.toISOString()
        : null,
    identity:
      identity && see('identityDetails')
        ? { headline: identity.headline, orgName: identity.orgName }
        : null,
    trust: trustFor({
      known: viewer.isConnected || Boolean(viewer.sharesConversation),
      emailVerified: user.email_verified_at !== null,
      // Who a person works for is one of their professional details, shown as those are; a bot
      // or an agent is always said to be the organization's.
      verifiedOrgName:
        user.kind !== 'human' || see('identityDetails') ? (viewer.verifiedOrgName ?? null) : null,
      kind: user.kind,
    }),
  };
}

export async function seedDefaults(
  trx: Kysely<Database> | Transaction<Database>,
  userId: string,
  workweek: number[],
): Promise<void> {
  const rows = defaultPolicies(workweek).map((p) => ({
    id: uuidv7(),
    user_id: userId,
    name: p.name ?? null,
    scope_sphere: p.scope.sphere ?? null,
    scope_role: p.scope.role ?? null,
    scope_org_id: p.scope.orgId ?? null,
    scope_connection_id: p.scope.connectionId ?? null,
    settings: p.settings as Record<string, unknown>,
  }));
  if (rows.length) await trx.insertInto('relationship_policies').values(rows).execute();
}

/** The work week where someone lives (R31): Sunday to Thursday in Egypt, Monday to Friday here. */
export function workweekFor(country: string | null): number[] {
  return defaultWorkweek(country);
}

/**
 * How someone appears to one other person: the identity they chose for that connection, else their
 * default one (PRD §35). Null when they have neither.
 */
export async function identityShownTo(
  ctx: Pick<AppContext, 'db'>,
  ownerId: string,
  viewerId: string,
): Promise<ShownIdentity | null> {
  return (await identitiesShownTo(ctx, ownerId, [viewerId])).get(viewerId) ?? null;
}

export interface ShownIdentity {
  displayName: string;
  headline: string | null;
  orgName: string | null;
}

/**
 * How someone appears to each of several people (a group they wrote to), in two queries for
 * them all: the identity chosen for each connection, else the default one once.
 */
export async function identitiesShownTo(
  ctx: Pick<AppContext, 'db'>,
  ownerId: string,
  viewerIds: string[],
): Promise<Map<string, ShownIdentity | null>> {
  const out = new Map<string, ShownIdentity | null>();
  if (!viewerIds.length) return out;
  const sides = await ctx.db
    .selectFrom('connection_sides')
    .innerJoin('identities', 'identities.id', 'connection_sides.identity_id')
    .select([
      'connection_sides.other_id',
      'identities.display_name',
      'identities.headline',
      'identities.org_name',
    ])
    .where('connection_sides.owner_id', '=', ownerId)
    .where('connection_sides.other_id', 'in', viewerIds)
    .execute();
  const chosen = new Map(sides.map((s) => [s.other_id, s]));
  const fallback =
    chosen.size < viewerIds.length
      ? await ctx.db
          .selectFrom('identities')
          .select(['display_name', 'headline', 'org_name'])
          .where('user_id', '=', ownerId)
          .where('is_default', '=', true)
          .executeTakeFirst()
      : undefined;
  for (const id of viewerIds) {
    const identity = chosen.get(id) ?? fallback;
    out.set(
      id,
      identity
        ? {
            displayName: identity.display_name,
            headline: identity.headline,
            orgName: identity.org_name,
          }
        : null,
    );
  }
  return out;
}
