import type { ContactReturn } from '@caime/core/contact-return';

/** A phone's consent returns to the sheet that asked (accounts.native.ts): nothing waits here. */
export function contactsReturned(): ContactReturn | null {
  return null;
}

export function doneWithReturn(): void {}
