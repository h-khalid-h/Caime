import { afterEach, describe, expect, it } from 'vitest';
import { SEARCH_GOLDEN, type SearchLine } from './fixtures/search-golden';
import { english, makeTranslator, setTranslator, type Translator } from './i18n';
import { ar } from './locales/ar';
import { fr } from './locales/fr';
import { turkish } from './locales/tr';
import { parseSearchQuery } from './search';

/**
 * How Search's rules read what people type, per language, each query in its own reader's
 * language (a relationship word matches its label there): a query is read right when where it
 * looks, who, what kind of file, who asked whom and which days all are, and the words left to
 * match are the query's own (M16 G10). When first measured (2026-10-19) Arabic and Turkish read
 * a little over half: Turkish names a time before what it's of ("geçen haftaki bağlantılar"),
 * Cairo says "قال إيه عمر عن العقد", and nobody's "coworkers" or "أهلي" was a relationship. The
 * floors are what was measured once that was fixed, and only ever move up.
 */
const LANGUAGES = ['en', 'ar', 'fr', 'tr'] as const;
const FLOORS: Record<SearchLine['lang'], number> = { en: 1, ar: 1, fr: 1, tr: 1 };
const READERS: Record<SearchLine['lang'], Translator> = {
  en: english,
  ar: makeTranslator('ar', ar),
  fr: makeTranslator('fr', fr),
  tr: makeTranslator('tr', turkish),
};
/** Words a query may leave in what's matched without changing what it finds. */
const ARTICLES: Record<SearchLine['lang'], string[]> = {
  en: ['the', 'a', 'an'],
  fr: ['le', 'la', 'les', 'l', 'un', 'une'],
  ar: [],
  tr: [],
};
const NOW = new Date('2026-10-05T14:00:00Z');
const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

function misses(line: SearchLine): string[] {
  const p = parseSearchQuery(line.query, { now: NOW });
  const e = line.expect;
  const out: string[] = [];
  if (p.scope !== e.scope) out.push(`scope ${p.scope}`);
  if (e.person !== undefined && p.person !== e.person) out.push(`person ${p.person}`);
  if (e.fileKind !== undefined && p.fileKind !== e.fileKind) out.push(`file ${p.fileKind}`);
  if (e.direction !== undefined && p.direction !== e.direction)
    out.push(`direction ${p.direction}`);
  if (e.sphere !== undefined && (p.relationship?.sphere ?? null) !== e.sphere)
    out.push(`sphere ${p.relationship?.sphere}`);
  if (e.role !== undefined && p.relationship?.role !== e.role)
    out.push(`role ${p.relationship?.role}`);
  if (
    e.period !== undefined &&
    (p.period?.since !== e.period?.since || p.period?.until !== e.period?.until)
  )
    out.push(`period ${p.period?.since}..${p.period?.until}`);
  if (e.words) {
    const got = tokens(p.text);
    const want = e.words.map((w) => w.toLowerCase());
    const extra = got.filter((w) => !want.includes(w) && !ARTICLES[line.lang].includes(w));
    if (!want.every((w) => got.includes(w)) || extra.length) out.push(`text "${p.text}"`);
  }
  return out;
}

afterEach(() => setTranslator(english));

describe('the search golden set', () => {
  for (const lang of LANGUAGES) {
    it(`${lang}: queries read right at or above the floor`, () => {
      setTranslator(READERS[lang]);
      const lines = SEARCH_GOLDEN.filter((l) => l.lang === lang);
      const wrong = lines
        .map((l) => ({ l, m: misses(l) }))
        .filter(({ m }) => m.length)
        .map(({ l, m }) => `  ${l.query} → ${m.join(', ')}`);
      const share = 1 - wrong.length / lines.length;
      expect(share, `${lang}: ${share.toFixed(2)}\n${wrong.join('\n')}`).toBeGreaterThanOrEqual(
        FLOORS[lang],
      );
    });
  }

  it('holds each language to the same sixteen shapes', () => {
    for (const lang of LANGUAGES)
      expect(SEARCH_GOLDEN.filter((l) => l.lang === lang).length, lang).toBe(16);
  });
});
