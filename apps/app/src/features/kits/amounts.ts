/**
 * An amount as it's typed on a number keypad: the digits and separators of the person's language
 * ("1,200.50" in English, "1.200,50" in German, "١٬٢٠٠٫٥٠" in Arabic), or null when it isn't one.
 */
export function parseNumber(text: string, locale: string): number | null {
  let group = ',';
  let decimal = '.';
  try {
    for (const p of new Intl.NumberFormat(locale).formatToParts(12345.6)) {
      if (p.type === 'group') group = p.value;
      if (p.type === 'decimal') decimal = p.value;
    }
  } catch {
    // The default separators.
  }
  let t = text
    .trim()
    // Digits of any script Intl uses for these languages, as 0–9.
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    // Spaces are how some languages group digits (French writes 1 200).
    .replace(/[\s  ]/g, '');
  t = t.split(group).join('');
  if (decimal !== '.') t = t.split(decimal).join('.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
