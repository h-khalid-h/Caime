/** Finding a country as it's typed, and showing its flag (pure, so tests and lists share it). */

/** A country's flag: its two regional indicator letters. */
export function flagOf(code: string): string {
  return /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)))
    : '';
}

/** Letters as they're typed to find something: no case, no accents. */
export const folded = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Whether a country is what's being looked for: a word of its name starts with it, it's the
 * name's initials (UK, UAE), or it's the code.
 */
export function countryMatches(c: { code: string; name: string }, term: string): boolean {
  const q = folded(term).replace(/\./g, '');
  if (!q) return true;
  const words = folded(c.name)
    .split(/[\s,()'’-]+/)
    .filter(Boolean);
  return (
    words.some((w) => w.startsWith(q)) ||
    folded(c.name).startsWith(q) ||
    (q.length > 1 && words.map((w) => w[0]).join('') === q) ||
    c.code.toLowerCase() === q
  );
}
