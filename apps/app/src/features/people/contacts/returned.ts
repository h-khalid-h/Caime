/**
 * What the Connect screen was opened with after an account's consent, on the web (R89): the
 * fragment the server returned with, read once per page load and taken out of the address at
 * once, so a reload or a copied link never carries it. It's kept here, not in a screen, until
 * the sheet is done with it (`doneWithReturn`): the root remounts once the language has loaded,
 * and a screen that read it first may be gone before it's used. Phones return to the sheet
 * itself (returned.native.ts).
 */
import { type ContactReturn, contactReturnOf } from '@caime/core/contact-return';

let pending: ContactReturn | null | undefined;

export function contactsReturned(): ContactReturn | null {
  if (pending !== undefined) return pending;
  pending = null;
  if (typeof window === 'undefined' || !window.location.hash) return null;
  pending = contactReturnOf(window.location.hash);
  if (pending)
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  return pending;
}

/** The sheet has read the account, or said why not: nothing waits any more. */
export function doneWithReturn(): void {
  pending = null;
}
