/**
 * Text as a finder compares it (R88), light enough for the startup chunk: every place's own
 * search (Chats, People, Spaces, Actions) filters what it shows with `finds`, on the device.
 */

/** Arabic as one compares it: one alef, "ي" for "ى", "ه" for "ة", no marks or tatweel. */
export function foldArabic(text: string): string {
  return text
    .replace(/[\u064b-\u0670\u065f\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

/** The Latin letters that never come apart from a mark, as their plain letters. */
const PLAIN: Record<string, string> = { ı: 'i', ø: 'o', ł: 'l', œ: 'oe', æ: 'ae' };

/**
 * Without case, accents (a search for "jose" finds José, "gul" finds Gül, "isik" Işık) or
 * Arabic's marks and letter forms ("احمد" finds "أحمد"). The database's `caime_fold` (migration
 * 0153) is its twin, step for step, so a search on the server folds as a list on the device does
 * (M17 I5, `retrieval-golden.test.ts`); the lower case is any locale's, since a Turkish "ı" is an
 * "i" here either way.
 */
export function foldForFind(text: string): string {
  return foldArabic(
    text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .normalize('NFC'),
  )
    .toLocaleLowerCase()
    .replace(/[ıøłœæ]/g, (c) => PLAIN[c] ?? c);
}

/** Whether what was typed is in any of these (a name, a handle, a title, a line); "@" aside. */
export function finds(typed: string, ...values: Array<string | null | undefined>): boolean {
  const needle = foldForFind(typed.trim().replace(/^@/, ''));
  if (!needle) return true;
  return values.some((v) => Boolean(v) && foldForFind(v as string).includes(needle));
}
