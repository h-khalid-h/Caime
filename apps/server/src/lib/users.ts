/**
 * User records and their two views: `meView` (the account owner) and `personView` (anyone else,
 * filtered by the owner's privacy rules and the owner's classification of the viewer).
 */
import {
  type AgeCheckView,
  canSee,
  clampForMinor,
  defaultPolicies,
  defaultPrivacy,
  isMinor,
  type MeView,
  meetsMinimumAge,
  type PersonView,
  type PrivacySettings,
  type Sphere,
  trustFor,
  type UserPreferences,
  uuidv7,
} from '@caime/core';
import { countryFacts, defaultWorkweek } from '@caime/core/countries';
import { tr } from '@caime/core/i18n';
import type { Kysely, Transaction } from 'kysely';
import type { Config } from '../config';
import type { Database, User, UserRow } from '../db/schema';
import { AppError } from './errors';
import { currencyOf } from './geo';
import { isUnverifiedAddress, type MailConfig, mailAddressOf } from './mail-address';

export const ONLINE_WINDOW_MS = 2 * 60_000;

/**
 * The age below which nobody living in `country` is on Caime: this Caime's own minimum
 * (MINIMUM_AGE), or the law's there where it asks more (core `countryFacts().minimumAge`:
 * counsel's decision of 2026-10-14). Sign-up and a change of country both read it.
 */
export function minimumAgeIn(minimumAge: number, country: string | null | undefined): number {
  return Math.max(minimumAge, countryFacts(country).minimumAge ?? 0);
}

/** Whether someone born on `birthDate` may be on Caime living in `country`, today where they are. */
export function oldEnoughIn(
  minimumAge: number,
  country: string | null | undefined,
  birthDate: string,
  now: Date,
  timeZone: string | null | undefined,
): boolean {
  return meetsMinimumAge(birthDate, now, minimumAgeIn(minimumAge, country), timeZone);
}

/**
 * The refusal for someone too young for Caime where they live, in the request's language. Where a
 * parent's yes opens a younger age there (R122), it says from when, never a dead end: someone
 * between the two isn't refused at all, their account waits for a parent (R122 (2)).
 */
export function tooYoung(minimumAge: number, country: string | null | undefined): AppError {
  const age = minimumAgeIn(minimumAge, country);
  const guardianAge = countryFacts(country).guardianAge;
  if (guardianAge !== null && guardianAge < age)
    return new AppError(
      400,
      'too_young',
      tr(
        'Where you live, Caime is for people {age} and older, and from {younger} with a parent’s or guardian’s yes.',
        { age, younger: guardianAge },
      ),
    );
  return new AppError(
    400,
    'too_young',
    age > minimumAge
      ? tr('Where you live, Caime is for people {age} and older.', { age })
      : tr('You need to be at least {age} to use Caime.', { age: age }),
  );
}

/**
 * Under 18 (R29): by the date of birth where they are, or by a check of their age that said so
 * while it holds (M16 B7: the stricter reading wins). Select `birth_date`, `time_zone` and
 * `age_minor_until`.
 */
export function minorOf(
  user: Pick<User, 'birth_date' | 'time_zone' | 'age_minor_until'>,
  now: Date,
): boolean {
  if (user.age_minor_until && user.age_minor_until.getTime() > now.getTime()) return true;
  return isMinor(user.birth_date, now, user.time_zone);
}

/** Whether anyone among these people is under 18 (R29), in one query. */
export async function anyMinor(
  db: Kysely<Database> | Transaction<Database>,
  userIds: string[],
  now: Date,
): Promise<boolean> {
  if (!userIds.length) return false;
  const people = await db
    .selectFrom('users')
    .select(['birth_date', 'time_zone', 'age_minor_until'])
    // A meeting's guest who didn't say they're 18 or over on its page (R85 (3)) is taken at their
    // word: their age is the one thing a guest says of themselves.
    .select((eb) =>
      eb
        .exists(
          eb
            .selectFrom('meeting_guests as g')
            .select('g.id')
            .whereRef('g.user_id', '=', 'users.id')
            .where('g.joined_at', 'is not', null)
            .where('g.adult', '=', false),
        )
        .as('saidMinor'),
    )
    .where('id', 'in', userIds)
    .execute();
  return people.some((u) => u.saidMinor || minorOf(u, now));
}

export function privacyOf(
  user: Pick<User, 'privacy' | 'birth_date' | 'time_zone' | 'age_minor_until'>,
  now: Date,
): PrivacySettings {
  const minor = minorOf(user, now);
  const fallback = defaultPrivacy({ minor });
  const p = user.privacy as Partial<PrivacySettings> | null;
  // A number finds only someone who said it may (R91): never by a default nobody saved.
  if (!p) return { ...fallback, discoverByPhone: false };
  const settings: PrivacySettings = {
    fields: { ...fallback.fields, ...(p.fields ?? {}) },
    discoverByHandle: p.discoverByHandle ?? fallback.discoverByHandle,
    discoverByEmail: p.discoverByEmail ?? fallback.discoverByEmail,
    // Off where it was never said (R91): a number finds only someone who said it may.
    discoverByPhone: p.discoverByPhone ?? false,
    messageRequests: p.messageRequests ?? fallback.messageRequests,
    groupAdds: p.groupAdds ?? fallback.groupAdds,
  };
  // Under 18, whatever is stored (R29): nothing to everyone, never found by an address.
  return minor ? clampForMinor(settings) : settings;
}

export function avatarUrl(user: Pick<User, 'id' | 'avatar_file_id'>): string | null {
  return user.avatar_file_id
    ? `/v1/users/${user.id}/avatar?v=${user.avatar_file_id.slice(-8)}`
    : null;
}

export type { MeView, PersonView };

/** Whether this Caime checks ages (M16 B7): a provider and its keys are set. */
export function ageChecksOn(
  config: Pick<Config, 'AGE_PROVIDER' | 'AGEMIN_ASSET_ID' | 'AGEMIN_SECRET_KEY'>,
): boolean {
  return Boolean(config.AGE_PROVIDER && config.AGEMIN_ASSET_ID && config.AGEMIN_SECRET_KEY);
}

/** A check of someone's age as they read it (M16 B7), or null while never checked. */
export function ageCheckView(
  user: Pick<User, 'age_check' | 'age_check_method' | 'age_checked_at' | 'age_minor_until'>,
): AgeCheckView | null {
  if (!user.age_check || !user.age_check_method || !user.age_checked_at) return null;
  return {
    outcome: user.age_check,
    method: user.age_check_method,
    checkedAt: user.age_checked_at.toISOString(),
    holdsUntil: user.age_minor_until?.toISOString() ?? null,
  };
}

export function meView(
  user: UserRow,
  now: Date,
  config: MailConfig & Pick<Config, 'AGE_PROVIDER' | 'AGEMIN_ASSET_ID' | 'AGEMIN_SECRET_KEY'>,
): MeView {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified_at !== null,
    handle: user.handle,
    // Adults have an address where mail is on (R75); a minor's handle takes no mail.
    mailAddress:
      user.kind === 'human' && !minorOf(user, now) ? mailAddressOf(user.handle, config) : null,
    displayName: user.display_name,
    kind: user.kind,
    birthDate: user.birth_date,
    minor: minorOf(user, now),
    locale: user.locale,
    timeZone: user.time_zone,
    country: user.country,
    currency: currencyOf(user.country),
    workweek: user.workweek,
    ...countryDerived(user.country),
    quietHours: user.quiet_hours ?? null,
    plan: user.plan,
    avatarUrl: avatarUrl(user),
    bio: user.bio,
    headline: user.headline,
    pronouns: user.pronouns,
    gender: user.gender,
    statusText: user.status_text,
    statusEmoji: user.status_emoji,
    presence: user.presence,
    privacy: privacyOf(user, now),
    preferences: (user.preferences ?? {}) as UserPreferences,
    aiEnabled: user.ai_enabled,
    onboarded: user.onboarded_at !== null,
    recoveryCodesSeen: user.recovery_codes_seen_at !== null,
    ageCheck: ageCheckView(user),
    ageSource: user.age_check ? 'checked' : user.birth_date_confirmed_at ? 'parent' : 'declared',
    ageCheckOffered: ageChecksOn(config) && user.kind === 'human',
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

export function personView(user: UserRow, viewer: ViewerRelation, now: Date): PersonView {
  const privacy = privacyOf(user, now);
  const v = { ...viewer };
  const see = (field: Parameters<typeof canSee>[1]) => canSee(privacy, field, v);
  const presence = see('onlineStatus') ? presenceOf(user, now) : null;
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.display_name,
    kind: user.kind,
    avatarUrl: see('profilePhoto') ? avatarUrl(user) : null,
    bio: see('bio') ? user.bio : null,
    pronouns: see('pronouns') ? user.pronouns : null,
    gender: see('gender') ? user.gender : null,
    statusText: see('status') ? user.status_text : null,
    statusEmoji: see('status') ? user.status_emoji : null,
    presence,
    lastSeenAt:
      see('lastSeen') && user.last_active_at && user.presence !== 'invisible'
        ? user.last_active_at.toISOString()
        : null,
    headline: see('identityDetails') ? user.headline : null,
    trust: trustFor({
      known: viewer.isConnected || Boolean(viewer.sharesConversation),
      emailVerified: user.email_verified_at !== null,
      // Who a person works for is one of their professional details, shown as those are; a bot
      // or an agent is always said to be the organization's.
      verifiedOrgName:
        user.kind !== 'human' || see('identityDetails') ? (viewer.verifiedOrgName ?? null) : null,
      kind: user.kind,
      unverifiedSender: user.kind === 'provisional' && isUnverifiedAddress(user.email),
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
 * What a country sets for a person or an organization (R76), as their views carry it: the
 * calendar's first day, the weekend, the clock and the ways people are paid there.
 */
export function countryDerived(country: string | null) {
  const f = countryFacts(country);
  return { weekStart: f.weekStart, weekend: f.weekend, hour12: f.hour12, payKinds: f.payKinds };
}
