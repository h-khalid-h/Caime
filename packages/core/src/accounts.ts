/**
 * A person's Google or Microsoft account, connected to Caime for the uses they turn on (R90). One
 * connection per account, its permissions the narrowest each use needs, and nothing kept beyond
 * what a use needs. Phase 1 is the calendar: when the person is busy, never what or with whom, so
 * their bookable slots are never offered over a meeting in another calendar. Files (a picked
 * file from Drive or OneDrive) and mail come later, each a use of the same connection. Pure: the
 * app and the server read it.
 */
import { msg } from './i18n';

export const ACCOUNT_PROVIDERS = ['google', 'microsoft'] as const;
export type AccountProvider = (typeof ACCOUNT_PROVIDERS)[number];

export function isAccountProvider(v: unknown): v is AccountProvider {
  return typeof v === 'string' && (ACCOUNT_PROVIDERS as readonly string[]).includes(v);
}

/** What a connection is used for. Only these are offered; a later use joins the list. */
export const ACCOUNT_USES = ['calendar', 'files'] as const;
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

/** Each use's permissions, the narrowest that do the job. */
const USE_SCOPES: Record<AccountUse, Record<AccountProvider, string[]>> = {
  calendar: {
    // When the person is busy and nothing else: no titles, no attendees.
    google: ['https://www.googleapis.com/auth/calendar.freebusy'],
    // Microsoft has no busy-only permission; the basic read gives times and no bodies, and
    // Caime keeps only the times.
    microsoft: ['Calendars.ReadBasic'],
  },
  files: {
    // Only the files the person picks in Google's own picker: never the drive.
    google: ['https://www.googleapis.com/auth/drive.file'],
    // The person's own OneDrive, read when they browse it in Caime to pick one.
    microsoft: ['Files.Read'],
  },
};

/** Everything a connection with these uses asks for. */
export function accountScopes(provider: AccountProvider, uses: readonly AccountUse[]): string[] {
  return [...new Set([...IDENTITY[provider], ...uses.flatMap((u) => USE_SCOPES[u][provider])])];
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
      'When you’re busy there, your bookable times aren’t offered. Caime keeps only when, never what or with whom.',
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

/** Where a connection's consent returns in the app: Settings · Apps, with what happened. */
export const ACCOUNT_RETURN_PATH = 'settings/apps';
export const ACCOUNT_RETURN_ERRORS = ['denied', 'failed', 'expired', 'adults'] as const;
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
