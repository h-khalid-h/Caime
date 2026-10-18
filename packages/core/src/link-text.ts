/**
 * Where a link is in someone's words, read one way by the server (a message's entities, its
 * preview's address) and by the composer (the card it shows before sending, M16 E4c): an http(s)
 * address or one starting `www.`, without the punctuation that ends a sentence after it. Light,
 * with nothing else of the intelligence, so the composer can read it.
 */

/** A link as written: an http(s) address, or one that starts `www.`. */
export const LINK_IN_TEXT = /\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[^\s<>"'`]+/gi;

/** A link as matched, without the punctuation after it that ends the sentence. */
export const linkEnd = (raw: string): string => raw.replace(/[.,;:!?)\]}'"]+$/, '');

/** The first link in `text`, as it's previewed (M16 E4c), or null. */
export function firstLinkIn(text: string): string | null {
  for (const m of text.matchAll(LINK_IN_TEXT)) {
    const url = linkEnd(m[0]);
    if (url) return url;
  }
  return null;
}
