/**
 * What an organization's team keeps about a customer (M16 H3): a note, tags, and the fields the
 * organization defines for its customers (an insurance number, a file number, how they found
 * it), for its team alone. Light: the conversation's details and the setup screen read it.
 */
import { asciiDigits } from './digits';
import { foldForFind } from './fold';
import { tr } from './i18n';

export const CUSTOMER_FIELD_KINDS = ['text', 'number', 'date', 'choice'] as const;
export type CustomerFieldKind = (typeof CUSTOMER_FIELD_KINDS)[number];

/** A field an organization keeps for each customer; a choice names its choices. */
export interface CustomerField {
  id: string;
  label: string;
  kind: CustomerFieldKind;
  choices?: string[];
}

/** The most fields an organization defines, and a field's limits. */
export const CUSTOMER_FIELDS_MAX = 20;
export const FIELD_LABEL_CHARS = 40;
export const FIELD_VALUE_CHARS = 200;
export const FIELD_CHOICES_MAX = 12;
export const FIELD_CHOICE_CHARS = 40;
/** The most tags on one customer, and a tag's length. */
export const CUSTOMER_TAGS_MAX = 10;
export const TAG_CHARS = 30;
/** The most a note says. */
export const CUSTOMER_NOTE_CHARS = 4000;

/** Tags as kept: trimmed, one of each however it's cased or accented, in the order given. */
export function cleanTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    const key = foldForFind(tag);
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** Whether two tags are one (no case, no accents, Arabic folded). */
export function sameTag(a: string, b: string): boolean {
  return foldForFind(a.trim()) === foldForFind(b.trim());
}

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
