/**
 * What an ask to Cai or a friend is once what only makes it polite is off (M16 G13, G14): the
 * words as people type them (no Arabic marks, plain quotes, single spaces), without the lead
 * ("Cai, could you…", "ممكن", "tu peux", "lütfen"), the close ("please", "شكرا", "merci") or the
 * end's punctuation. `chatSave` and `chatAct` read an ask from its first word in what's left, so a
 * sentence that only tells of something ("I added it to my tasks", "I called Sami") is never one.
 * Pure, no zod; the server's alone (the app never loads it).
 */

/** No letter or digit before (`B`) or after (`E`): a rule's word is a whole word. */
export const B = '(?<![\\p{L}\\p{N}])';
export const E = '(?![\\p{L}\\p{N}])';

/**
 * A rule's pattern, written as a raw template (`\s` is a space, as in a regular expression's
 * own literal) so its words read as the rules' own data; what's put in it is put as it is.
 */
export const rx = (parts: TemplateStringsArray, ...values: string[]) =>
  new RegExp(String.raw({ raw: parts.raw }, ...values), 'iu');

/** What only makes an ask polite or says whom it's for, before it: taken off first. */
const LEAD = [
  'hey',
  'hi',
  'ok',
  'okay',
  'so',
  'and',
  'also',
  'then',
  'oh',
  'cai',
  'caime',
  'please',
  'pls',
  'plz',
  'kindly',
  'can you',
  'could you',
  'would you',
  'will you',
  'can u',
  "i'd like you to",
  'i need you to',
  'i want you to',
  'go ahead and',
  'just',
  'لو سمحت',
  'لو سمحتي',
  'من فضلك',
  'رجاء',
  'ارجوك',
  'أرجوك',
  'بليز',
  'ممكن',
  'يا كاي',
  'كاي',
  'طيب',
  'تمام',
  'خلاص',
  "s'il te pla[iî]t",
  "s'il vous pla[iî]t",
  'stp',
  'svp',
  'tu peux',
  'peux-tu',
  'pourrais-tu',
  'tu pourrais',
  'est-ce que tu peux',
  'merci de',
  'bon',
  'alors',
  'et',
  'lütfen',
  'rica etsem',
  'tamam',
  'peki',
];
const LEADING = rx`^(?:(?:${LEAD.join('|')})${E}[\s,،:!.-]*)+`;

/** What only closes one: thanks, please, a name. */
const TRAILING = rx`(?:[\s,،]+(?:please|pls|thanks|thank you|thx|ty|cai|for me|لو سمحت|من فضلك|شكرا|يا كاي|s'il te pla[iî]t|stp|svp|merci|lütfen|teşekkürler|sağ ?ol))+[.!?؟]*$`;

/** As people type it, no longer: no Arabic marks, plain quotes, single spaces. */
export function typed(text: string): string {
  return text.replace(/[ً-ْٰـ]/g, '').replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * Words found back as they were written in `text` (their quotes and Arabic marks as typed), from
 * the form `typed` gave them: the last place they're found, or the words as they are when not.
 */
export function asWritten(text: string, words: string): string {
  const parts = [...words].map((ch) => {
    if (/\s/u.test(ch)) return '\\s+';
    if (ch === "'") return "['’‘`]";
    return `${ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ً-ْٰـ]*`;
  });
  let last: string | null = null;
  for (const m of text.matchAll(new RegExp(parts.join(''), 'gu'))) last = m[0];
  return last ?? words;
}

/** An ask's own words: as typed, its lead, close and end's punctuation off; '' past `max`. */
export function askedWords(text: string, max: number): string {
  const t = typed(text);
  if (!t || t.length > max) return '';
  return t
    .replace(LEADING, '')
    .replace(TRAILING, '')
    .replace(/[\s.!?؟]+$/u, '')
    .trim();
}
