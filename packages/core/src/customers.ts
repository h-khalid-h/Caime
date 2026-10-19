/**
 * What an organization's team keeps about a customer (M16 H3): a note, tags, and the fields the
 * organization defines for its customers (an insurance number, a file number, how they found
 * it), for its team alone. Light: the conversation's details and the setup screen read it.
 */
import { foldForFind } from './fold';

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
