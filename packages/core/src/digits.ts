/**
 * Numbers as people write them, in any script's digits: Arabic ١٢, Persian ۱۲, Devanagari १२,
 * Bengali ১২, Thai ๑๒, full-width １２ from a Chinese or Japanese keyboard.
 */

const DECIMAL = /\p{Nd}/u;

/**
 * Every decimal digit as its ASCII one ("١٢٠٠" → "1200"), anything else as it is. Unicode keeps each
 * script's digits together and in order, 0 to 9, so a digit's value is how far it is into its
 * run of them.
 */
export function asciiDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if ((cp >= 48 && cp <= 57) || !DECIMAL.test(ch)) {
      out += ch;
      continue;
    }
    let start = cp;
    while (DECIMAL.test(String.fromCodePoint(start - 1))) start--;
    out += String((cp - start) % 10);
  }
  return out;
}
