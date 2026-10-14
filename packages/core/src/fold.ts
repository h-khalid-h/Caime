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

/**
 * Without case, accents (a search for "jose" finds José, "gul" finds Gül) or Arabic's marks and
 * letter forms ("احمد" finds "أحمد").
 */
export function foldForFind(text: string): string {
  return foldArabic(
    text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .normalize('NFC'),
  ).toLocaleLowerCase();
}

/** Whether what was typed is in any of these (a name, a handle, a title, a line); "@" aside. */
export function finds(typed: string, ...values: Array<string | null | undefined>): boolean {
  const needle = foldForFind(typed.trim().replace(/^@/, ''));
  if (!needle) return true;
  return values.some((v) => Boolean(v) && foldForFind(v as string).includes(needle));
}
