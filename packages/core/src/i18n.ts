/**
 * The interface in more than one language (R54). English is the source: every string in the
 * app and in core is written in English where it's used, wrapped in `tr('…')`, and the English
 * text is the key into a catalog for the language chosen. Nothing here depends on a platform;
 * the app loads a catalog when the language asks for one (`@caime/core/locales/ar`), the
 * server keeps English until it translates per person.
 *
 * - `tr(text, vars)`: "{name} invited you" with `{name}` filled in; unknown keys fall back to
 *   the English, so a new string never breaks a screen (the catalog test fails instead).
 * - `trn(count, one, other, vars)`: a count with the right form for the language. The key is
 *   the English `other`; a catalog gives the forms by CLDR category (zero, one, two, few, many,
 *   other), which Arabic needs all of.
 * - `msg(text)`: marks a string written outside a component (a table of options) so the catalog
 *   test finds it; it's translated where it's shown, with `tr(item.label)`.
 * - Gender (R81): a catalog entry may hold forms, with `other` the one for anyone (what the
 *   catalog said before). Said *to* the reader (an imperative in Arabic): `ReaderForms`, which
 *   `tr` picks by the reader's own gender, carried by the translator once they said it
 *   (`forReader`). Said *of* someone (a relationship's label): `GenderForms`, which only
 *   `trFor(gender, text)` picks, by that person's gender as shown to the reader; `tr` reads
 *   such an entry for anyone, so a word used as a category never takes the reader's gender.
 *   Nobody's is ever guessed: null reads the form for anyone.
 * - Numbers (M16 D4): a number passed as a variable is written in the reader's language
 *   (`shownNumber`), never forced into English digits and separators where it's used.
 */
import { numberFormat } from './locale';

export const INTERFACE_LANGUAGES = ['en', 'ar', 'fr', 'tr'] as const;
export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];
/** What the setting holds: the device's language, or one chosen. */
export type LanguageChoice = 'auto' | InterfaceLanguage;

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
/** How someone said Caime should refer to them (R81): a word, or none (null). */
export type Gender = 'woman' | 'man' | 'other';
export const GENDERS: readonly Gender[] = ['woman', 'man', 'other'];
/** A word said of someone, by their gender: `other` is the one for anyone, what the catalog said before. */
export type GenderForms = Record<Gender, string>;
/** A sentence said to the reader, by theirs: `other` is the one for anyone, what the catalog said before. */
export interface ReaderForms {
  toWoman: string;
  toMan: string;
  other: string;
}
export type Catalog = Record<string, string | PluralForms | GenderForms | ReaderForms>;

export function isGenderForms(entry: Catalog[string] | undefined): entry is GenderForms {
  return typeof entry === 'object' && entry !== null && 'woman' in entry;
}

export function isReaderForms(entry: Catalog[string] | undefined): entry is ReaderForms {
  return typeof entry === 'object' && entry !== null && 'toWoman' in entry;
}

/** Every form a string has in the catalog, the one for anyone first: what a search may match. */
export function formsOf(entry: Catalog[string] | undefined, text: string): string[] {
  if (typeof entry === 'string') return [entry];
  if (isGenderForms(entry)) return [entry.other, entry.woman, entry.man];
  if (isReaderForms(entry)) return [entry.other, entry.toWoman, entry.toMan];
  return [text];
}

/** A null or undefined value reads as nothing, so a missing name never shows as "null". */
export type Vars = Record<string, string | number | null | undefined>;

export interface Translator {
  readonly language: InterfaceLanguage;
  readonly dir: 'ltr' | 'rtl';
  /** The reader's own, once said: the form `tr` picks where a string has forms. */
  readonly gender: Gender | null;
  readonly catalog: Catalog;
  tr(text: string, vars?: Vars): string;
  /** A string in the form for `gender`: someone else's, where the reader may know it. */
  trFor(gender: Gender | null, text: string, vars?: Vars): string;
  trn(count: number, one: string, other: string, vars?: Vars): string;
}

const RTL: ReadonlySet<string> = new Set(['ar']);

export function dirOf(language: InterfaceLanguage): 'ltr' | 'rtl' {
  return RTL.has(language) ? 'rtl' : 'ltr';
}

/** The interface language for a device's tag ("ar-EG" → ar; anything unknown → en). */
export function languageFor(tag: string | null | undefined): InterfaceLanguage {
  const code = (tag ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
  return (INTERFACE_LANGUAGES as readonly string[]).includes(code)
    ? (code as InterfaceLanguage)
    : 'en';
}

/**
 * A language asked for in a page's query (`?lang=ar`), or null: the public site's switch sets
 * it, the entry screens and the app honour it, so a reader who switched is Arabic all the way in.
 */
export function languageInSearch(search: string | null | undefined): InterfaceLanguage | null {
  if (!search) return null;
  const lang = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('lang');
  return lang && (INTERFACE_LANGUAGES as readonly string[]).includes(lang)
    ? (lang as InterfaceLanguage)
    : null;
}

/** The language a choice resolves to on this device. */
export function resolveLanguage(
  choice: LanguageChoice | null | undefined,
  deviceTag: string | null | undefined,
): InterfaceLanguage {
  return choice && choice !== 'auto' ? choice : languageFor(deviceTag);
}

export function fill(text: string, vars?: Vars, language?: string): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (!(key in vars)) return whole;
    const value = vars[key];
    if (value == null) return '';
    return typeof value === 'number' && language ? shownNumber(value, language) : String(value);
  });
}

/** The locale a number is written in for a language: Arabic's digits stay Latin, as they were. */
export const numberLocale = (language: string): string =>
  language === 'ar' ? 'ar-u-nu-latn' : language;

/**
 * A number as a sentence in the reader's language writes it (M16 D4): its own separators
 * ("1,000", "12 345", "12.345"). A year, a code or an id is passed as text, so it stays as it is.
 * Never throws.
 */
export function shownNumber(n: number, language: string = currentTranslator().language): string {
  try {
    return numberFormat(numberLocale(language)).format(n);
  } catch {
    return String(n);
  }
}

const rulesCache = new Map<string, Intl.PluralRules>();
function pluralRules(language: string): Intl.PluralRules {
  let r = rulesCache.get(language);
  if (!r) {
    try {
      r = new Intl.PluralRules(language);
    } catch {
      r = new Intl.PluralRules('en');
    }
    rulesCache.set(language, r);
  }
  return r;
}

export function makeTranslator(
  language: InterfaceLanguage,
  catalog: Catalog,
  gender: Gender | null = null,
): Translator {
  const toReader = (text: string): string => {
    const entry = catalog[text];
    if (typeof entry === 'string') return entry;
    if (isReaderForms(entry))
      return gender === 'woman' ? entry.toWoman : gender === 'man' ? entry.toMan : entry.other;
    if (isGenderForms(entry)) return entry.other;
    return text;
  };
  const ofSomeone = (text: string, g: Gender | null): string => {
    const entry = catalog[text];
    if (typeof entry === 'string') return entry;
    if (isGenderForms(entry)) return entry[g ?? 'other'];
    if (isReaderForms(entry)) return entry.other;
    return text;
  };
  return {
    language,
    dir: dirOf(language),
    gender,
    catalog,
    tr: (text, vars) => fill(toReader(text), vars, language),
    trFor: (g, text, vars) => fill(ofSomeone(text, g), vars, language),
    trn(count, one, other, vars) {
      const all = { n: count, ...vars };
      const entry = catalog[other];
      if (entry && typeof entry !== 'string' && !isGenderForms(entry) && !isReaderForms(entry)) {
        const category = pluralRules(language).select(count);
        return fill(entry[category] ?? entry.other, all, language);
      }
      return fill(count === 1 ? one : other, all, language);
    },
  };
}

/** The same language for a reader who said their gender: the one translator, or one more. */
export function forReader(translator: Translator, gender: Gender | null): Translator {
  return translator.gender === gender
    ? translator
    : makeTranslator(translator.language, translator.catalog, gender);
}

export const english: Translator = makeTranslator('en', {});

let current: Translator = english;
let provider: (() => Translator | undefined) | null = null;

/** The translator the app runs on; set once at boot, before the first screen. */
export function setTranslator(translator: Translator): void {
  current = translator;
}

/**
 * Where one process writes for many people (the server), the translator is whoever's the
 * current work is for: a provider answers it from the work's own context (the request's header,
 * the notification's reader), and nothing says `current` while one is set. Undefined from the
 * provider means nobody in particular: English.
 */
export function setTranslatorProvider(next: (() => Translator | undefined) | null): void {
  provider = next;
}

export function currentTranslator(): Translator {
  return provider?.() ?? current;
}

/**
 * A label as a heading reads (R69): its first letter a capital, in the reader's language
 * ("handle" → "Handle"; Turkish "işler" → "İşler"). A label's key may be lowercase; whatever
 * draws it, the app's `Spec` or a server's page, writes it through this.
 */
export function sentence(label: string): string {
  return label.charAt(0).toLocaleUpperCase(currentTranslator().language) + label.slice(1);
}

/**
 * A catalog's words in lower case, as they read inside a sentence ("All {kinds}"), by the
 * reader's language's rules: Turkish "İş" is "iş", never "i̇ş" (M16 D4). Someone's own words and
 * names keep their case: only what came from `tr` goes through this.
 */
export function lower(words: string): string {
  return words.toLocaleLowerCase(currentTranslator().language);
}

/** Its first letter only, as a label reads after another word ("Former manager"). */
export function lowerFirst(words: string): string {
  return words.charAt(0).toLocaleLowerCase(currentTranslator().language) + words.slice(1);
}

/**
 * Items one after another as the reader's language separates them (M16 D4): "Cash, Card", and
 * in Arabic with its own comma, "نقدًا، بطاقة". A list a person reads is joined here, or by
 * `joinNames` when its last item takes "and"; never by a comma of its own.
 */
export function listed(items: readonly (string | null | undefined | false)[]): string {
  return items.filter(Boolean).join(currentTranslator().language === 'ar' ? '، ' : ', ');
}

export function tr(text: string, vars?: Vars): string {
  return currentTranslator().tr(text, vars);
}

export function trn(count: number, one: string, other: string, vars?: Vars): string {
  return currentTranslator().trn(count, one, other, vars);
}

/** A word said of someone, in the form for their gender (R81): null, or one they didn't share, reads for anyone. */
export function trFor(gender: Gender | null | undefined, text: string, vars?: Vars): string {
  return currentTranslator().trFor(gender ?? null, text, vars);
}

/** Every form the current language has for a string, the one for anyone first. */
export function trForms(text: string): string[] {
  return formsOf(currentTranslator().catalog[text], text);
}

/** Marks English written outside a component; the catalog test collects it. Identity. */
export function msg(text: string): string {
  return text;
}

const TEXT_FIELDS = new Set([
  'label',
  'detail',
  'title',
  'subtitle',
  'body',
  'hint',
  'description',
  'does',
  'text',
]);

/** A table of options written with `msg()`, translated where it's shown: every text field through `tr`. */
export function trAll<T extends object>(items: readonly T[]): T[] {
  return items.map((item) => {
    const out: Record<string, unknown> = { ...(item as Record<string, unknown>) };
    for (const [k, v] of Object.entries(out))
      if (TEXT_FIELDS.has(k) && typeof v === 'string') out[k] = tr(v);
    return out as T;
  });
}
