/**
 * An account's contacts on the web (R89): the page leaves for the provider's consent in the same
 * tab (`leaveFor`), and comes back to /connect with the access sealed for a key this tab made and
 * kept in its session storage alone; the return is read once and taken out of the address. The
 * phones' is accounts.native.ts.
 */

import type { ContactAccount, ContactReturn } from '@caime/core/contact-return';
import { newContactKey } from '@caime/core/contact-seal';
import { endpoints } from '@/api/endpoints';
import { leaveFor } from '@/lib/links';
import { type AccountOutcome, openedReturn } from './opened';

export type { AccountOutcome };

const keyName = (account: ContactAccount) => `caime.contacts.${account}`;

export async function startAccount(account: ContactAccount): Promise<AccountOutcome | 'left'> {
  const key = newContactKey();
  try {
    window.sessionStorage.setItem(keyName(account), key);
  } catch {
    // Without somewhere to keep the key for the return, the access couldn't be opened.
    return { account, error: 'failed' };
  }
  const { url } = await endpoints.startContactAccount(account, { key, back: 'web' });
  leaveFor(url);
  return 'left';
}

let opened: { from: ContactReturn; outcome: AccountOutcome } | null = null;

/**
 * The return the page was opened with (`contactsReturned`), opened with this tab's key, which is
 * forgotten as it's used; asked again for the same return (a screen mounted again), the same.
 */
export function openAccountReturn(r: ContactReturn): AccountOutcome {
  if (opened?.from === r) return opened.outcome;
  let key: string | null = null;
  try {
    key = window.sessionStorage.getItem(keyName(r.account));
    window.sessionStorage.removeItem(keyName(r.account));
  } catch {
    key = null;
  }
  opened = { from: r, outcome: openedReturn(r, key) };
  return opened.outcome;
}
