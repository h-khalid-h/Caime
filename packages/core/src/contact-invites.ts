/**
 * Inviting someone from one's contacts yourself (R89): their number as it's dialled from abroad,
 * and the ways to send them the words, WhatsApp, a text or mail, each opened on the person's own
 * device with the words written for them. Caime sends nothing itself.
 *
 * Pure: the app takes it by subpath, with the calling codes it needs.
 */
import { CALLING_CODES } from './calling-codes';
import type { Contact } from './contacts';

/**
 * Where trunk prefixes differ from the usual "0": the US and Canada dial a "1" or nothing,
 * Russia and Kazakhstan an "8", and Italy keeps its "0" in the international number.
 */
const TRUNK: Readonly<Record<string, string | null>> = {
  US: '1',
  CA: '1',
  RU: '8',
  KZ: '8',
  IT: null,
  SM: null,
  VA: null,
};

/**
 * A number as it's dialled from abroad ("+201001234567"), so WhatsApp and messages reach it
 * from anywhere: one with a "+" or "00" is already; a national one takes the country of the
 * person inviting (whose book it is), less its trunk prefix. Null when that can't be told.
 */
export function toInternational(phone: string, country: string | null): string | null {
  const raw = phone.trim();
  if (raw.startsWith('+')) return `+${raw.replace(/\D/g, '')}`;
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  const cc = country ? CALLING_CODES[country.toUpperCase()] : undefined;
  if (!cc || digits.length < 6) return null;
  const trunk = country ? TRUNK[country.toUpperCase()] : undefined;
  if (trunk === null) return `+${cc}${digits}`;
  const prefix = trunk ?? '0';
  if (digits.startsWith(cc) && digits.length > cc.length + 6) return `+${digits}`;
  return `+${cc}${digits.startsWith(prefix) ? digits.slice(prefix.length) : digits}`;
}

export type InviteWayKind = 'whatsapp' | 'sms' | 'email';
export interface InviteWay {
  kind: InviteWayKind;
  /** The number or address it goes to, as shown. */
  to: string;
  url: string;
}

/**
 * The ways to invite someone yourself, with the words written for you: WhatsApp and a message
 * to their first number, mail to their first address. `ios` is whether the device's messages
 * app reads "&body" (an iPhone) or "?body".
 */
export function inviteWays(
  contact: Contact,
  invite: { text: string; subject: string },
  where: { country: string | null; ios: boolean },
): InviteWay[] {
  const ways: InviteWay[] = [];
  const phone = contact.phones[0];
  const number = phone ? toInternational(phone, where.country) : null;
  if (number) {
    const body = encodeURIComponent(invite.text);
    ways.push({
      kind: 'whatsapp',
      to: number,
      url: `https://wa.me/${number.slice(1)}?text=${body}`,
    });
    ways.push({
      kind: 'sms',
      to: number,
      url: `sms:${number}${where.ios ? '&' : '?'}body=${body}`,
    });
  }
  const email = contact.emails[0];
  if (email)
    ways.push({
      kind: 'email',
      to: email,
      url: `mailto:${email}?subject=${encodeURIComponent(invite.subject)}&body=${encodeURIComponent(invite.text)}`,
    });
  return ways;
}

/**
 * The ways to send one's own link to anyone, where nothing on the device can say who (a
 * desktop's browser, an iPhone's: no contact picker), so the people already written to are
 * asked first (review 2026-10-17 §1 C): WhatsApp, which asks whom, and, on a device with a
 * messages app (`texts`), a message with nobody in it yet.
 */
export function openInviteWays(
  invite: { text: string },
  where: { ios: boolean; texts: boolean },
): InviteWay[] {
  const body = encodeURIComponent(invite.text);
  const ways: InviteWay[] = [{ kind: 'whatsapp', to: '', url: `https://wa.me/?text=${body}` }];
  if (where.texts)
    ways.push({ kind: 'sms', to: '', url: `sms:${where.ios ? '&' : '?'}body=${body}` });
  return ways;
}
