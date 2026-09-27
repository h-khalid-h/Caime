/**
 * Automations (PRD §69): what Caishy does by itself with what arrives, only ever set up by the
 * person it does it for. One kind so far: keep what someone sends in a collection of one's own
 * ("When a customer sends a file with “invoice”, save it to Customer Files"). The other two the
 * PRD names are rules (policy.ts): a reminder when someone hasn't answered is a rule's follow-up,
 * and quiet after hours is a rule's schedule. The Automations page lists those too.
 *
 * What's saved stays only as long as the message does: deleted for everyone, disappeared, or
 * deleted for oneself, it's gone from what one saved as well. Nothing is saved from a private
 * conversation, whose words Caishy can't read, nor from a message request not yet accepted.
 */
import { findRole, SPHERE_DEFS, type Sphere } from './taxonomy';

/** What an automation keeps: the kinds of what's shared (the asset index's). */
export const SAVE_KINDS = ['document', 'photo', 'video', 'audio', 'link'] as const;
export type SaveKind = (typeof SAVE_KINDS)[number];

/** The most automations one person has. */
export const AUTOMATIONS_MAX = 50;
/** The most words one automation looks for, and the longest word. */
export const WORDS_MAX = 10;
export const WORD_MAX = 40;
/** The longest name of a collection. */
export const COLLECTION_MAX = 60;
/** Where a message is saved when no collection is chosen. */
export const SAVED_DEFAULT = 'Saved';
/** The most one person keeps saved; past it, nothing more is saved until some is removed. */
export const SAVED_MAX = 5000;

export interface AutomationWhen {
  /** Whose: someone known this way (and in this role), or, with neither, anyone. */
  sphere: Sphere | null;
  role: string | null;
  /** What they send. */
  kinds: SaveKind[];
  /** Any one of these in its name, or in the message with it; none, anything of those kinds. */
  words: string[];
}

/** Something shared, as an automation sees it. */
export interface Arrival {
  /** How the person it arrived for knows its sender. */
  sphere: Sphere | null;
  role: string | null;
  kind: string;
  /** A file's name, or a link's address and title. */
  name: string;
  /** The words of the message it came in. */
  text: string;
}

/**
 * Compared without case, nor the accents a Latin, Greek or Cyrillic letter can go without
 * ("facture" finds "Facturé"), as mentions are.
 */
const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLocaleLowerCase();

const WORDISH = /[\p{L}\p{N}]/u;
/** Scripts written without spaces between words: a word there can start anywhere. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

/**
 * Whether one of the words starts a word in the text: "invoice" finds "Invoice_0923.pdf",
 * "invoices" and "my-invoice", never "reinvoice". Several words ("purchase order") are found
 * together, as written.
 */
export function hasWord(text: string, words: string[]): boolean {
  if (!text) return false;
  const hay = fold(text);
  for (const raw of words) {
    const word = fold(raw.trim());
    if (!word) continue;
    let at = hay.indexOf(word);
    while (at !== -1) {
      const before = hay.charAt(at - 1);
      if (at === 0 || !WORDISH.test(before) || UNSPACED.test(word.charAt(0))) return true;
      at = hay.indexOf(word, at + 1);
    }
  }
  return false;
}

export function automationMatches(when: AutomationWhen, a: Arrival): boolean {
  if (when.sphere && when.sphere !== a.sphere) return false;
  if (when.role && when.role !== a.role) return false;
  if (!(when.kinds as string[]).includes(a.kind)) return false;
  if (!when.words.length) return true;
  return hasWord(a.name, when.words) || hasWord(a.text, when.words);
}

/** The words an automation looks for, as typed: "invoice, receipt" → ["invoice", "receipt"]. */
export function wordsFrom(typed: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of typed.split(/[,،、;\n]/)) {
    const word = w.trim().replace(/^["“”'‘’«»]+|["“”'‘’«»]+$/g, '');
    if (!word || seen.has(fold(word))) continue;
    seen.add(fold(word));
    out.push(word.slice(0, WORD_MAX));
  }
  return out.slice(0, WORDS_MAX);
}

const a = (noun: string) => (/^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);

/** Who an automation is for, as it reads after "When": "a customer", "a manager", "anyone". */
export function whoSends(when: Pick<AutomationWhen, 'sphere' | 'role'>): string {
  if (!when.sphere) return 'anyone';
  const role = findRole(when.sphere, when.role);
  if (role) return a(role.label.toLowerCase());
  if (when.role) return `${a(SPHERE_DEFS[when.sphere].label.toLowerCase())} (${when.role})`;
  switch (when.sphere) {
    case 'family':
      return 'family';
    case 'work':
      return 'someone from work';
    case 'community':
      return 'someone from your community';
    case 'public':
      return 'someone you don’t know';
    case 'other':
      return 'anyone else';
    default:
      return a(SPHERE_DEFS[when.sphere].label.toLowerCase());
  }
}

const KIND_NOUNS: Record<SaveKind, string> = {
  document: 'a file',
  photo: 'a photo',
  video: 'a video',
  audio: 'a voice note',
  link: 'a link',
};

const orList = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;

/** "When a customer sends a file with “invoice”, save it to Customer Files" */
export function describeAutomation(x: { when: AutomationWhen; collection: string }): string {
  const kinds = SAVE_KINDS.filter((k) => x.when.kinds.includes(k)).map((k) => KIND_NOUNS[k]);
  const words = x.when.words.length ? ` with ${orList(x.when.words.map((w) => `“${w}”`))}` : '';
  return `When ${whoSends(x.when)} sends ${orList(kinds)}${words}, save it to ${x.collection}`;
}

/** A collection's name as it's kept: its spaces tidied, never empty. */
export function collectionName(name: string | null | undefined): string {
  const n = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, COLLECTION_MAX);
  return n || SAVED_DEFAULT;
}
