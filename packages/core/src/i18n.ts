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
 */

export const INTERFACE_LANGUAGES = ['en', 'ar', 'fr', 'tr'] as const;
export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];
/** What the setting holds: the device's language, or one chosen. */
export type LanguageChoice = 'auto' | InterfaceLanguage;

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Catalog = Record<string, string | PluralForms>;

/** A null or undefined value reads as nothing, so a missing name never shows as "null". */
export type Vars = Record<string, string | number | null | undefined>;

export interface Translator {
  readonly language: InterfaceLanguage;
  readonly dir: 'ltr' | 'rtl';
  tr(text: string, vars?: Vars): string;
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

export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? (vars[key] == null ? '' : String(vars[key])) : whole,
  );
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

export function makeTranslator(language: InterfaceLanguage, catalog: Catalog): Translator {
  const tr = (text: string, vars?: Vars): string => {
    const entry = catalog[text];
    return fill(typeof entry === 'string' ? entry : text, vars);
  };
  return {
    language,
    dir: dirOf(language),
    tr,
    trn(count, one, other, vars) {
      const all = { n: count, ...vars };
      const entry = catalog[other];
      if (entry && typeof entry !== 'string') {
        const category = pluralRules(language).select(count);
        return fill(entry[category] ?? entry.other, all);
      }
      return fill(count === 1 ? one : other, all);
    },
  };
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

export function tr(text: string, vars?: Vars): string {
  return currentTranslator().tr(text, vars);
}

export function trn(count: number, one: string, other: string, vars?: Vars): string {
  return currentTranslator().trn(count, one, other, vars);
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
