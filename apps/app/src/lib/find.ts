/**
 * Finding what's typed in a list (a country, a currency, a time zone, a language, a collection,
 * an organization) and a country's flag: pure, so tests and lists share it.
 */

/** A country's flag: its two regional indicator letters. */
export function flagOf(code: string): string {
  return /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)))
    : '';
}

/**
 * Letters as they're typed: no case, and none of the marks people leave out (accents; Arabic's
 * hamza and madda, so المانيا finds ألمانيا; its tatweel), with the Arabic letters one keyboard
 * or another writes differently made one (ة ه, ى ي, Persian ی ک).
 */
function plain(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\p{M}ـ]/gu, '')
    .replace(/ة/g, 'ه')
    .replace(/[ىی]/g, 'ي')
    .replace(/ک/g, 'ك')
    .toLowerCase()
    .trim();
}

/** Dots and apostrophes, typed or not (St. Lucia, Côte d’Ivoire or Cote d'Ivoire). */
const UNTYPED = /[.'’ʼ`]/g;

/** Something as it's typed to find it: `plain`, without dots or apostrophes. */
export const folded = (s: string) => plain(s).replace(UNTYPED, '');

/**
 * Whether a country is what's being looked for: a word of its name starts with it (d’Ivoire
 * being both "d" "ivoire" and "divoire"), the whole name does, it's the name's initials (UK, UAE),
 * or it's the code.
 */
export function countryMatches(c: { code: string; name: string }, term: string): boolean {
  const q = folded(term);
  if (!q) return true;
  const name = plain(c.name);
  const split = (by: RegExp) =>
    name
      .split(by)
      .map((w) => w.replace(UNTYPED, ''))
      .filter((w) => /^[\p{L}\p{N}]/u.test(w));
  const words = split(/[\s,()'’ʼ-]+/);
  return (
    words.some((w) => w.startsWith(q)) ||
    split(/[\s,()-]+/).some((w) => w.startsWith(q)) ||
    folded(c.name).startsWith(q) ||
    (q.length > 1 && words.map((w) => w[0]).join('') === q) ||
    c.code.toLowerCase() === q
  );
}

/** Where words break in a name, a code or a time zone (America/New_York). */
const BREAKS = /[\s/·_,()'’ʼ-]+/;

/**
 * Whether what's typed finds something named by `texts` (a name, a code, a country): one of them
 * starts with all of it, or every word typed starts a word of them ("new y" finds New York,
 * "egyptian p" the Egyptian pound).
 */
export function wordsMatch(texts: Array<string | null | undefined>, term: string): boolean {
  const q = folded(term);
  if (!q) return true;
  const named = texts.filter((t): t is string => Boolean(t));
  if (named.some((t) => folded(t).startsWith(q))) return true;
  const words = named.flatMap((t) => plain(t).split(BREAKS)).map((w) => w.replace(UNTYPED, ''));
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => words.some((w) => w.startsWith(part)));
}
