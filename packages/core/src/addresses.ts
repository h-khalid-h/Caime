/**
 * What is someone (R91): beside their sign-in email and their Caime address, more email addresses
 * and phone numbers they say are theirs, each proven by a code sent to it (an email by mail, a
 * phone by WhatsApp, SMS as the fallback) before it counts for anything. A proven one is that
 * person's alone. Pure: the app and the server read it.
 */
import { msg } from './i18n';

export const ADDRESS_KINDS = ['email', 'phone'] as const;
export type AddressKind = (typeof ADDRESS_KINDS)[number];

/** How an identity was proven: a code by mail, by WhatsApp or by SMS. */
export const ADDRESS_METHODS = ['email', 'whatsapp', 'sms'] as const;
export type AddressMethod = (typeof ADDRESS_METHODS)[number];

/** How many of each kind one person may add. */
export const ADDRESSES_MAX = 5;

/** A code's life and its tries: ten minutes, five. */
export const ADDRESS_CODE_MINUTES = 10;
export const ADDRESS_CODE_TRIES = 5;

/** A phone number as WhatsApp and SMS take it: E.164, a plus and 8 to 15 digits. */
export const E164 = /^\+[1-9]\d{7,14}$/;

/** An email address, lower-cased as it's kept; a phone number with its spaces and dashes gone. */
export function addressValue(kind: AddressKind, raw: string): string | null {
  const v = raw.trim();
  if (kind === 'email') {
    const e = v.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
  }
  const p = v.replace(/[\s\-().]/g, '').replace(/^00/, '+');
  return E164.test(p) ? p : null;
}

/** How a proven row says it was proven. */
export const ADDRESS_METHOD_LABELS: Record<AddressMethod, string> = {
  email: msg('Proven by a code by email'),
  whatsapp: msg('Proven by a code on WhatsApp'),
  sms: msg('Proven by a code by text message'),
};
