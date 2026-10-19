/**
 * A person's Google or Microsoft account, connected to Caime for the uses they turn on (R90). One
 * connection per account, its permissions the narrowest each use needs, and nothing kept beyond
 * what a use needs. The calendar: when the person is busy in any calendar of their own, never
 * what or with whom, so their bookable slots are never offered over a meeting kept there. Plans
 * (R96): their meetings and appointments in Caime written into that calendar and kept in step.
 * Files: a picked file from Drive or OneDrive. Each is a use of the same connection. Pure: the
 * app and the server read it.
 */
import { msg } from './i18n';

export const ACCOUNT_PROVIDERS = ['google', 'microsoft'] as const;
export type AccountProvider = (typeof ACCOUNT_PROVIDERS)[number];

export function isAccountProvider(v: unknown): v is AccountProvider {
  return typeof v === 'string' && (ACCOUNT_PROVIDERS as readonly string[]).includes(v);
}

/** What a connection is used for. Only these are offered; a later use joins the list. */
export const ACCOUNT_USES = ['calendar', 'plans', 'files'] as const;
export type AccountUse = (typeof ACCOUNT_USES)[number];

/** The provider's own name for itself: never translated. */
export const ACCOUNT_PROVIDER_NAMES: Record<AccountProvider, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
};

/** Each provider's drive, by its own name: never translated. */
export const ACCOUNT_DRIVE_NAMES: Record<AccountProvider, string> = {
  google: 'Google Drive',
  microsoft: 'OneDrive',
};

/** Where Google's picker hands a phone back the file picked: `caime://picked#file=…`. */
export const ACCOUNT_PICKED_PATH = 'picked';

/** Who the account is, asked of every connection: its address, nothing else. */
const IDENTITY: Record<AccountProvider, string[]> = {
  google: ['openid', 'email'],
  // `offline_access` is what lets the connection renew itself; Google's is `access_type`.
  microsoft: ['openid', 'email', 'offline_access', 'User.Read'],
};

/** Google's list of a person's calendars: which of them are their own (no events, no times). */
export const GOOGLE_CALENDAR_LIST_SCOPE =
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly';

/**
 * Google's files the person picks in its picker, and nothing else of the drive: the files use,
 * and all the picker page's access may reach (M16 G1).
 */
export const GOOGLE_PICKED_FILES_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Each use's permissions, the narrowest that do the job. */
const USE_SCOPES: Record<AccountUse, Record<AccountProvider, string[]>> = {
  calendar: {
    // When the person is busy and nothing else: no titles, no attendees.
    google: ['https://www.googleapis.com/auth/calendar.freebusy'],
    // Microsoft has no busy-only permission; the basic read gives times and no bodies, and
    // Caime keeps only the times.
    microsoft: ['Calendars.ReadBasic'],
  },
  plans: {
    // Events on the calendars the person owns, never one shared with them: Caime writes its own.
    google: ['https://www.googleapis.com/auth/calendar.events.owned'],
    // Microsoft has no narrower permission that writes an event.
    microsoft: ['Calendars.ReadWrite'],
  },
  files: {
    // Only the files the person picks in Google's own picker: never the drive.
    google: [GOOGLE_PICKED_FILES_SCOPE],
    // The person's own OneDrive, read when they browse it in Caime to pick one.
    microsoft: ['Files.Read'],
  },
};

/**
 * Asked with a use, never needed for it: unticked on Google's screen, the use still works, less
 * well. The calendar's list lets every calendar of the person's own be read, not only the main.
 */
const USE_EXTRAS: Partial<Record<AccountUse, Partial<Record<AccountProvider, string[]>>>> = {
  calendar: { google: [GOOGLE_CALENDAR_LIST_SCOPE] },
};

/** Everything a connection with these uses asks for. */
export function accountScopes(provider: AccountProvider, uses: readonly AccountUse[]): string[] {
  return [
    ...new Set([
      ...IDENTITY[provider],
      ...uses.flatMap((u) => [...USE_SCOPES[u][provider], ...(USE_EXTRAS[u]?.[provider] ?? [])]),
    ]),
  ];
}

/**
 * Whether a connection reads every calendar of the person's own, or the main one alone (Google's
 * list unticked, or a connection made before it was asked for). Microsoft's read lists them all.
 */
export function readsEveryCalendar(provider: AccountProvider, scopes: readonly string[]): boolean {
  return provider === 'microsoft' || scopes.includes(GOOGLE_CALENDAR_LIST_SCOPE);
}

/** The uses a granted set of permissions covers (Google lets each one be unticked). */
export function usesGranted(
  provider: AccountProvider,
  asked: readonly AccountUse[],
  granted: readonly string[],
): AccountUse[] {
  const have = new Set(granted);
  return asked.filter((u) => USE_SCOPES[u][provider].every((s) => have.has(s)));
}

/** How each use is named and explained in Settings (keys, shown through `tr`). */
export const ACCOUNT_USE_LABELS: Record<AccountUse, { label: string; detail: string }> = {
  calendar: {
    label: msg('Calendar'),
    detail: msg(
      'When you’re busy in any of your calendars there, your bookable times aren’t offered. Caime keeps only when, never what or with whom.',
    ),
  },
  plans: {
    label: msg('Plans'),
    detail: msg(
      'Your meetings and appointments in Caime are added to its calendar and kept up to date as they’re asked, agreed, moved or cancelled. Nobody else is invited.',
    ),
  },
  files: {
    label: msg('Files'),
    detail: msg(
      'Attach a file from it in a conversation. Caime copies only the file you pick, as your own upload.',
    ),
  },
};

/** The most a picked file may be: the same as an upload. */
export const ACCOUNT_FILE_MAX_BYTES = 100 * 1024 * 1024;

/** Why a connection isn't working: it needs connecting again, or the provider didn't answer. */
export type AccountState = 'connected' | 'reconnect' | 'failing';

/** How long a calendar is looked ahead, and how often it's read again. */
export const ACCOUNT_BUSY_DAYS = 90;
export const ACCOUNT_SYNC_MINUTES = 15;
/**
 * Before a slot is offered or taken, a calendar last read longer ago than this is read again
 * (R96): a meeting put there a minute ago holds the time.
 */
export const ACCOUNT_FRESH_SECONDS = 60;

/** Where a connection's consent returns in the app: Settings · Apps, with what happened. */
export const ACCOUNT_RETURN_PATH = 'settings/apps';
export const ACCOUNT_RETURN_ERRORS = ['denied', 'failed', 'expired'] as const;
export type AccountReturnError = (typeof ACCOUNT_RETURN_ERRORS)[number];

/** What the consent's return says: a claim to redeem signed in, or why there's none. */
export type AccountReturn =
  | { provider: AccountProvider; claim: string }
  | { provider: AccountProvider | null; error: AccountReturnError }
  | { provider: AccountProvider; cancelled: true };

/** Reads a return's fragment (`account=…&claim=…` or `account=…&error=…`); null when it isn't one. */
export function accountReturnOf(fragment: string): AccountReturn | null {
  const q = new URLSearchParams(fragment.replace(/^#/, ''));
  const account = q.get('account');
  const provider = isAccountProvider(account) ? account : null;
  const claim = q.get('claim');
  if (provider && claim && /^[A-Za-z0-9_-]{40,8000}$/.test(claim)) return { provider, claim };
  const error = q.get('error');
  if (account && error)
    return {
      provider,
      error: (ACCOUNT_RETURN_ERRORS as readonly string[]).includes(error)
        ? (error as AccountReturnError)
        : 'failed',
    };
  return null;
}
