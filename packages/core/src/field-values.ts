/**
 * A customer field's value as kept (M16 H3), read the same on the device and on the server: what
 * the team types into a record and what a form's answer keeps (H5). Apart from `customers.ts`,
 * which the first download carries, so only the screens that check a value load it.
 */
import { type CustomerField, FIELD_VALUE_CHARS, sameTag } from './customers';
import { asciiDigits } from './digits';
import { tr } from './i18n';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^-?\d+(?:[.,]\d+)?$/;

/**
 * A field's value as kept, or why it can't be: a number is a number (in any script's digits,
 * kept in Latin ones), a date a real day (YYYY-MM-DD), a choice one of its choices. Empty is
 * nothing kept.
 */
export function fieldValue(
  field: CustomerField,
  raw: string,
): { value: string | null } | { error: string } {
  const text = raw.trim();
  if (!text) return { value: null };
  if (text.length > FIELD_VALUE_CHARS) return { error: tr('That’s too long for a field.') };
  if (field.kind === 'number') {
    const n = asciiDigits(text).replace('٫', '.');
    return NUMBER.test(n) ? { value: n.replace(',', '.') } : { error: tr('That isn’t a number.') };
  }
  if (field.kind === 'date') {
    const d = asciiDigits(text);
    const at = DAY.test(d) ? new Date(`${d}T00:00:00Z`) : null;
    return at && !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === d
      ? { value: d }
      : { error: tr('Choose a day.') };
  }
  if (field.kind === 'choice') {
    const choice = (field.choices ?? []).find((c) => sameTag(c, text));
    return choice ? { value: choice } : { error: tr('Choose one of its choices.') };
  }
  return { value: text };
}
