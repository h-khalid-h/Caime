/**
 * Connecting a Google or Microsoft account on the web (R90): the page leaves for the provider's
 * consent in the same tab (`leaveFor`) and comes back to Settings · Apps with a sealed claim in
 * the address's fragment, which only this person's session can redeem. The fragment is read once
 * a page load and taken out of the address at once (a reload or a copied link never carries it),
 * and kept here until the screen has redeemed it: the root remounts once the language has
 * loaded. The phones' is connect.native.ts.
 */
import {
  type AccountProvider,
  type AccountReturn,
  type AccountUse,
  accountReturnOf,
} from '@caime/core/accounts';
import { endpoints } from '@/api/endpoints';
import { leaveFor } from '@/lib/links';

let pending: AccountReturn | null | undefined;

export function accountReturned(): AccountReturn | null {
  if (pending !== undefined) return pending;
  pending = null;
  if (typeof window === 'undefined' || !window.location.hash) return null;
  pending = accountReturnOf(window.location.hash);
  if (pending)
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  return pending;
}

/** The screen has redeemed the return, or said why not: nothing waits any more. */
export function doneWithAccountReturn(): void {
  pending = null;
}

export async function connectAccount(
  provider: AccountProvider,
  uses: AccountUse[],
): Promise<AccountReturn | 'left'> {
  const { url } = await endpoints.startAccount(provider, { uses, back: 'web' });
  leaveFor(url);
  return 'left';
}
