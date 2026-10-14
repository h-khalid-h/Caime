import type {
  ContactAccount,
  ContactAccountError,
  ContactReturn,
} from '@caime/core/contact-return';
import { openContactAccess } from '@caime/core/contact-seal';

/** What an account's consent came to on this device. */
export type AccountOutcome =
  | { account: ContactAccount; access: string }
  | { account: ContactAccount; error: ContactAccountError }
  | { account: ContactAccount; cancelled: true };

/** A return opened with the key this device made for it: the access, or why there's none. */
export function openedReturn(r: ContactReturn, key: string | null): AccountOutcome {
  if ('error' in r) return { account: r.account, error: r.error };
  // No key here: the consent was started on another device, or this one forgot it.
  if (!key) return { account: r.account, error: 'expired' };
  const access = openContactAccess(key, r.account, r.sealed);
  return access ? { account: r.account, access } : { account: r.account, error: 'expired' };
}
