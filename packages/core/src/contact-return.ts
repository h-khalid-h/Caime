/**
 * Where an account's consent goes and comes back (R89): the accounts contacts may be read from,
 * and the fragment of the address the server returns to with the access sealed for the device
 * (`contact-seal.ts`), or why there's none. Apart from the readers (`contact-sources.ts`), so the
 * Connect screen reads a return without them.
 */

/** Where a list of contacts came from. */
export type ContactSource = 'device' | 'picker' | 'google' | 'microsoft' | 'file';
/** The accounts a person may read their contacts from, once, through the provider's consent. */
export const CONTACT_ACCOUNTS = ['google', 'microsoft'] as const;
export type ContactAccount = (typeof CONTACT_ACCOUNTS)[number];

export function isContactAccount(v: unknown): v is ContactAccount {
  return typeof v === 'string' && (CONTACT_ACCOUNTS as readonly string[]).includes(v);
}

/** What an account's sealed access is bound to (`contact-seal.ts`, and the server's sealing). */
export function contactSealLabel(account: ContactAccount): string {
  return `caime contacts v1 ${account}`;
}

/** Why an account came back without its contacts. */
export const CONTACT_ACCOUNT_ERRORS = ['denied', 'failed', 'expired'] as const;
export type ContactAccountError = (typeof CONTACT_ACCOUNT_ERRORS)[number];

/** What came back from an account's consent, in the fragment of the address it returned to. */
export type ContactReturn =
  | { account: ContactAccount; sealed: string }
  | { account: ContactAccount; error: ContactAccountError };

/** Where an account's consent returns: the web app's Connect screen, or the phone app's. */
export const CONTACT_RETURN_PATH = 'connect';

/** The fragment the server returns with (`contacts=google&sealed=…`). */
export function contactReturnFragment(r: ContactReturn): string {
  const q = new URLSearchParams({ contacts: r.account });
  if ('sealed' in r) q.set('sealed', r.sealed);
  else q.set('error', r.error);
  return q.toString();
}

/** A return read back from an address's fragment, or null when it isn't one. */
export function contactReturnOf(fragment: string): ContactReturn | null {
  const q = new URLSearchParams(fragment.replace(/^#/, ''));
  const account = q.get('contacts');
  if (!isContactAccount(account)) return null;
  const sealed = q.get('sealed');
  if (sealed && /^[A-Za-z0-9_-]+$/.test(sealed)) return { account, sealed };
  const error = q.get('error');
  return {
    account,
    error: (CONTACT_ACCOUNT_ERRORS as readonly string[]).includes(error ?? '')
      ? (error as ContactAccountError)
      : 'failed',
  };
}
