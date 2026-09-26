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
  type PrivacySettings,
  type Sphere,
  trustFor,
  uuidv7,
} from '@caishy/core';
import type { Kysely, Transaction } from 'kysely';
import type { Database, User } from '../db/schema';

export const ONLINE_WINDOW_MS = 2 * 60_000;

export function privacyOf(user: Pick<User, 'privacy' | 'birth_year'>, now: Date): PrivacySettings {
  const fallback = defaultPrivacy({ minor: isMinor(user.birth_year, now) });
  const p = user.privacy as Partial<PrivacySettings> | null;
  if (!p) return fallback;
  return {
    fields: { ...fallback.fields, ...(p.fields ?? {}) },
    discoverByHandle: p.discoverByHandle ?? fallback.discoverByHandle,
    // Minors are never discoverable by email, whatever is stored (R29).
    discoverByEmail: isMinor(user.birth_year, now)
      ? false
      : (p.discoverByEmail ?? fallback.discoverByEmail),
    messageRequests: p.messageRequests ?? fallback.messageRequests,
  };
}

export function avatarUrl(user: Pick<User, 'id' | 'avatar_file_id'>): string | null {
  return user.avatar_file_id
    ? `/v1/users/${user.id}/avatar?v=${user.avatar_file_id.slice(-8)}`
    : null;
}

export function meView(user: User, now: Date) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified_at !== null,
    handle: user.handle,
    displayName: user.display_name,
    kind: user.kind,
    birthYear: user.birth_year,
    minor: isMinor(user.birth_year, now),
    locale: user.locale,
    timeZone: user.time_zone,
    region: user.region,
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
    preferences: user.preferences ?? {},
    aiEnabled: user.ai_enabled,
    onboarded: user.onboarded_at !== null,
    createdAt: user.created_at.toISOString(),
  };
}

export type MeView = ReturnType<typeof meView>;

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
) {
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
      verifiedOrgName: viewer.verifiedOrgName ?? null,
      kind: user.kind,
    }),
  };
}

export type PersonView = ReturnType<typeof personView>;

/** Region from a locale like "ar-EG" (used for workweek defaults, R31). */
export function regionFromLocale(locale: string | undefined): string | null {
  const part = locale?.split('-')[1];
  return part && /^[A-Za-z]{2}$/.test(part) ? part.toUpperCase() : null;
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

export function workweekFor(region: string | null, locale: string | undefined): number[] {
  return defaultWorkweek(region ?? locale ?? null);
}
