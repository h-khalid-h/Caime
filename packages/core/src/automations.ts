/**
 * Automations (PRD §69): what Caime does by itself with what arrives, only ever set up by the
 * person it does it for. One kind so far: keep what someone sends in a collection of one's own
 * ("When a customer sends a file with “invoice”, save it to Customer Files"). The other two the
 * PRD names are rules (policy.ts): a reminder when someone hasn't answered is a rule's follow-up,
 * and quiet after hours is a rule's schedule. The Automations page lists those too.
 *
 * What's saved stays only as long as the message does: deleted for everyone, disappeared, or
 * deleted for oneself, it's gone from what one saved as well. Nothing is saved from a private
 * conversation, whose words Caime can't read, nor from a message request not yet accepted.
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
 * ("facture" finds "Facturé"), as mentions are. The same on every device whatever its language
 * (never a Turkish dotless i), and a Greek word's last sigma is its sigma.
 */
const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\u03c2/g, '\u03c3');

const WORDISH = /[\p{L}\p{N}]/u;
const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;
/** Scripts written without spaces between words: a word there can start anywhere. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
/** Arabic's article, and the one-letter words written onto it (and, so, with, as, for). */
const ARTICLE = '\u0627\u0644';
const ARTICLE_LAM = '\u0644\u0644';
const CLITICS = '\u0648\u0641\u0628\u0643\u0644';

interface Folded {
  hay: string;
  /** For each character of `hay`, whether the one it came from was a capital (camelCase). */
  upper: boolean[];
}

/**
 * The text folded as words are compared, keeping where its capitals were: folding can change a
 * text's length, so it's done a character at a time, of the text composed first (a name written
 * decomposed, as macOS keeps them, folds as it reads). Most names are plain ASCII, folded
 * without decomposing anything.
 */
function foldKeepingCase(text: string): Folded {
  let hay = '';
  const upper: boolean[] = [];
  for (const ch of text.normalize('NFC')) {
    const code = ch.charCodeAt(0);
    if (code < 128) {
      const capital = code >= 65 && code <= 90;
      hay += capital ? String.fromCharCode(code + 32) : ch;
      upper.push(capital);
      continue;
    }
    const f = fold(ch);
    const capital = ch !== ch.toLowerCase() && LETTER.test(ch);
    hay += f;
    for (let i = 0; i < f.length; i++) upper.push(capital);
  }
  return { hay, upper };
}

/**
 * The same texts are looked in again and again (a message's words, for each automation of each
 * person it arrives for, and each of its files): each is folded once.
 */
const FOLDED = new Map<string, Folded>();
function folded(text: string): Folded {
  let f = FOLDED.get(text);
  if (!f) {
    if (FOLDED.size >= 64) FOLDED.clear();
    f = foldKeepingCase(text);
    FOLDED.set(text, f);
  }
  return f;
}

/** Whether a word found at `at` starts one: "Invoice" in "CustomerInvoice", "0923invoice". */
function startsWord(hay: string, upper: boolean[], at: number, word: string): boolean {
  if (at === 0) return true;
  const before = hay.charAt(at - 1);
  const first = word.charAt(0);
  if (!WORDISH.test(before) || UNSPACED.test(first)) return true;
  // Another script, or a number, just before: "請求書invoice", "0923invoice".
  if (UNSPACED.test(before) && !UNSPACED.test(first)) return true;
  if (DIGIT.test(before) && LETTER.test(first)) return true;
  // camelCase: a capital after a small letter.
  if (upper[at] && !upper[at - 1] && LETTER.test(before)) return true;
  // Arabic: "الفاتورة" and "بالفاتورة" are the word "فاتورة".
  const two = hay.slice(Math.max(0, at - 2), at);
  if (two === ARTICLE || two === ARTICLE_LAM) {
    // At most two letter-words before it ("and with the"), and a word starts before those.
    let p = at - 2;
    for (let i = 0; i < 2 && two === ARTICLE && p > 0 && CLITICS.includes(hay.charAt(p - 1)); i++)
      if (p - 1 === 0 || !WORDISH.test(hay.charAt(p - 2))) return true;
      else p--;
    return at - 2 === 0 || !WORDISH.test(hay.charAt(at - 3));
  }
  return false;
}

/**
 * Whether one of the words starts a word in the text: "invoice" finds "Invoice_0923.pdf",
 * "invoices", "my-invoice", "CustomerInvoice.pdf" and "0923invoice.pdf", never "reinvoice".
 * Several words ("purchase order") are found together, as written.
 */
export function hasWord(text: string, words: string[]): boolean {
  if (!text) return false;
  const { hay, upper } = folded(text);
  for (const raw of words) {
    const word = fold(raw.trim());
    if (!word) continue;
    let at = hay.indexOf(word);
    while (at !== -1) {
      if (startsWord(hay, upper, at, word)) return true;
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

/**
 * The words an automation looks for, as typed: "invoice, receipt" → ["invoice", "receipt"], with
 * the commas and semicolons of Arabic, Chinese and Japanese too ("发票，收据").
 */
/** What separates words as they're typed: commas and semicolons of every script, new lines. */
const BETWEEN_WORDS = /[,;\n\u060c\u061b\u3001\uff0c\uff1b\uff64]/;
const unquoted = (w: string) => w.trim().replace(/^["“”'‘’«»]+|["“”'‘’«»]+$/g, '');

export function wordsFrom(typed: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of typed.split(BETWEEN_WORDS)) {
    const word = unquoted(w);
    if (!word || seen.has(fold(word))) continue;
    seen.add(fold(word));
    out.push(word.slice(0, WORD_MAX));
  }
  return out.slice(0, WORDS_MAX);
}

/** What was typed without one of its words (as `wordsFrom` shows it), the rest as typed. */
export function withoutWord(typed: string, word: string): string {
  const gone = fold(word);
  return typed
    .split(BETWEEN_WORDS)
    .map((w) => w.trim())
    .filter((w) => w && fold(unquoted(w).slice(0, WORD_MAX)) !== gone)
    .join(', ');
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
    // Someone you said is a public figure, a creator or a public service: never a stranger,
    // who has no relationship to match.
    case 'public':
      return 'someone public';
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
