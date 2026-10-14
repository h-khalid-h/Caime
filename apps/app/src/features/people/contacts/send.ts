/**
 * An invitation sent by the person, from their own browser (R89): WhatsApp in a tab of its own
 * (its app where it's installed), mail and a text through the device's own apps. Caime sends
 * nothing itself. The phones' is send.native.ts.
 */
import type { InviteWay } from '@caime/core/contact-invites';

const nav = typeof navigator !== 'undefined' ? navigator : undefined;
/** A phone's browser sends texts; a desktop's has nothing to send them with. */
export const textsHere =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
/** An iPhone's or iPad's browser writes a text's body after "&". */
export const iosTexts = /iPhone|iPad|iPod/.test(nav?.userAgent ?? '');

export async function sendInvite(way: InviteWay, _words: string): Promise<boolean> {
  if (way.kind === 'whatsapp') window.open(way.url, '_blank', 'noopener');
  else window.location.assign(way.url);
  return true;
}
