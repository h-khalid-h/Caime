/**
 * An amount as it's typed on a number keypad, in the person's language or the keypad's own
 * ("1,200.50" in English, "1.200,50" in German, "١٬٢٠٠٫٥٠" in Arabic, "12.50" on an American
 * keypad for someone who reads German), in any script's digits, or null when it isn't one.
 *
 * Grouping is only what groups: a separator with exactly three digits after it (India's lakhs
 * group in twos, 1,00,000), before any decimal. So a lone separator with one, two or four digits
 * after it is the decimal, whichever it is, and one with exactly three is as the language reads
 * it (1,200 is 1200 in English and 1.2 in German).
 */
import { asciiDigits } from '@caime/core/digits';

/** The language's decimal separator, as "." or ",". */
function decimalOf(locale: string): string {
  try {
    for (const p of new Intl.NumberFormat(locale).formatToParts(12345.6))
      if (p.type === 'decimal') return p.value === '٫' ? '.' : p.value;
  } catch {
    // The default separator.
  }
  return '.';
}

/** Whether digits separated by `by` are grouped as thousands (1,234,567) or lakhs (12,34,567). */
function grouped(part: string, by: string): boolean {
  const [first, ...rest] = part.split(by);
  if (!first || !rest.length || ![first, ...rest].every((g) => /^\d+$/.test(g))) return false;
  const thousands = first.length <= 3 && rest.every((g) => g.length === 3);
  const lakhs =
    first.length <= 2 &&
    rest.at(-1)?.length === 3 &&
    rest.slice(0, -1).every((g) => g.length === 2);
  return thousands || lakhs;
}

export function parseNumber(text: string, locale: string): number | null {
  const t = asciiDigits(text.trim())
    // Spaces (French writes 1 200) and apostrophes (Swiss 1'200) only ever group.
    .replace(/[\s  '’]/g, '')
    // Arabic's own separators.
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const marks = [...t].filter((c) => c === '.' || c === ',');
  let whole = t;
  let fraction = '';
  const last = marks.at(-1);
  if (last) {
    const at = t.lastIndexOf(last);
    const before = t.slice(0, at);
    const after = t.slice(at + 1);
    if (new Set(marks).size === 2) {
      // Both: the last is the decimal, and the other groups what's before it.
      const group = last === '.' ? ',' : '.';
      if (!grouped(before, group)) return null;
      whole = before.split(group).join('');
      fraction = after;
    } else if (marks.length > 1) {
      // One kind, more than once: it can only group.
      if (!grouped(t, last)) return null;
      whole = t.split(last).join('');
    } else if (after.length === 3 && before.length >= 1 && before.length <= 3) {
      // Once, with three digits after it: as the language reads it.
      const isDecimal = last === decimalOf(locale);
      whole = isDecimal ? before : before + after;
      fraction = isDecimal ? after : '';
    } else {
      whole = before;
      fraction = after;
    }
  }
  const n = Number(`${whole || '0'}${fraction ? `.${fraction}` : ''}`);
  return Number.isFinite(n) ? n : null;
}

/** An amount as an example, written as the person's language writes it: 1,200 · 1.200 · ١٬٢٠٠. */
export function exampleAmount(locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(1200);
  } catch {
    return '1,200';
  }
}
