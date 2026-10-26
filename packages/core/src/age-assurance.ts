/**
 * Age assurance (M16 B7, REVIEW 2026-10-17 §3): what a check of someone's age found, and how it
 * moves the age every under-18 rule reads (R29). A check is a provider's estimate from a face, or
 * a document, made on the provider's own page; Caime keeps only its outcome (18 or over, or
 * under), how it was made, how sure the provider said it was, which provider and when: never an
 * image or a template. The stricter reading wins: a check that says under 18 makes someone under
 * 18 whatever they declared, for a year (`MINOR_HOLD_DAYS`, so a seventeen-year-old checked isn't
 * a minor for ever), and only a document lifts it sooner; nothing lifts what someone declared of
 * themselves (under 18 by their date of birth stays so until the date says otherwise). Pure: the
 * server applies it, the app reads its words.
 */

export const AGE_OUTCOMES = ['adult', 'minor'] as const;
export type AgeOutcome = (typeof AGE_OUTCOMES)[number];

export const AGE_METHODS = ['estimate', 'document'] as const;
export type AgeMethod = (typeof AGE_METHODS)[number];

/**
 * Where Caime asks for a check before going on, when a provider is set (`AGE_CHECK_TRIGGERS`
 * picks which): starting an organization, selling (a priced item offered, an organization's
 * card payments), writing first to someone you're not connected with, and adding a child as their
 * parent or guardian (R122).
 */
export const AGE_TRIGGERS = ['org', 'paid', 'stranger', 'guardian'] as const;
export type AgeTrigger = (typeof AGE_TRIGGERS)[number];

/**
 * Where a check comes back to: the web app's Security settings, or the phone app at
 * `caime://age-checked`, each with `?age=` saying what happened (`AGE_RETURN_STATES`).
 */
export const AGE_WEB_RETURN_PATH = 'settings/security';
export const AGE_APP_RETURN_PATH = 'age-checked';
export const AGE_RETURN_STATES = ['adult', 'minor', 'failed', 'cancel', 'waiting'] as const;
export type AgeReturnState = (typeof AGE_RETURN_STATES)[number];

/** What a return address says happened (`?age=`), or null when it says nothing Caime wrote. */
export function ageReturnOf(value: string | null | undefined): AgeReturnState | null {
  return (AGE_RETURN_STATES as readonly string[]).includes(value ?? '')
    ? (value as AgeReturnState)
    : null;
}

/** How long a check that said under 18 holds, from when it was made. */
export const MINOR_HOLD_DAYS = 365;
/** Checks one person may start in a day. */
export const AGE_CHECKS_A_DAY = 3;

const DAY = 86_400_000;

export interface AgeStanding {
  outcome: AgeOutcome;
  method: AgeMethod;
  /** When the check was made. */
  at: Date;
}

/** Until when a standing makes someone under 18; null when it doesn't. */
export function minorUntil(standing: Pick<AgeStanding, 'outcome' | 'at'>): Date | null {
  return standing.outcome === 'minor'
    ? new Date(standing.at.getTime() + MINOR_HOLD_DAYS * DAY)
    : null;
}

/** Whether a standing still counts: an adult's always, a minor's for its hold. */
export function standingHolds(standing: AgeStanding, now: Date): boolean {
  const until = minorUntil(standing);
  return !until || until.getTime() > now.getTime();
}

/**
 * What a new result makes of someone's standing. A document wins; an estimate never replaces a
 * document that holds, and never lifts an under-18 that holds (retrying a face until it reads
 * older lifts nothing); otherwise the newer result stands.
 */
export function nextAgeStanding(
  current: AgeStanding | null,
  result: AgeStanding,
  now: Date,
): AgeStanding {
  if (result.method === 'document') return result;
  const holding = current && standingHolds(current, now) ? current : null;
  if (holding?.method === 'document') return holding;
  if (holding?.outcome === 'minor') return holding;
  return result;
}

/** Whether a standing lets someone past a trigger: checked 18 or over, and still so. */
export function checkedAdult(standing: AgeStanding | null, now: Date): boolean {
  return Boolean(standing && standing.outcome === 'adult' && standingHolds(standing, now));
}
