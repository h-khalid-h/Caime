/**
 * Text as the database compares it (M17 I5): `caime_fold` (migration 0153), the twin of core's
 * `foldForFind`, and `caime_find_text`, the fold with each Arabic word that carries the article or
 * a joined "و" once more without it (`bareArabic` here is its twin, for the snippet's marks). The
 * folded vectors the expression indexes hold (0153 to 0155, a call's lines 0166) are written here
 * once, so a query names the very expression its index was built over: the planner matches them as
 * trees, so an alias changes nothing and a different spelling loses the index.
 * `retrieval-golden.test.ts` holds the folds equal, the words found to the hand-labelled lines of
 * every language, and the plan to the index.
 */
import { foldForFind } from '@caime/core/fold';
import { type RawBuilder, sql } from 'kysely';

/** A column (or an expression) folded as the database folds: compare it to `foldForFind`'s. */
export const foldSql = (expr: string | RawBuilder<unknown>): RawBuilder<string> =>
  sql<string>`caime_fold(${typeof expr === 'string' ? sql.ref(expr) : expr})`;

/** What a message says of itself, as `messages_search_fold` holds it. */
export const messageVectorSql = (alias: string): RawBuilder<string> =>
  sql<string>`to_tsvector('simple', caime_find_text(caime_search_text(${sql.ref(`${alias}.body`)}, ${sql.ref(`${alias}.payload`)})))`;

/** A message's text folded, for a match too short for the index (one or two letters). */
export const messageTextSql = (alias: string): RawBuilder<string> =>
  sql<string>`caime_fold(caime_search_text(${sql.ref(`${alias}.body`)}, ${sql.ref(`${alias}.payload`)}))`;

/** An action's or a decision's title and notes, as its `…_search_fold` index holds them. */
export const titleNotesVectorSql = (alias: string): RawBuilder<string> =>
  sql<string>`to_tsvector('simple', caime_find_text(coalesce(${sql.ref(`${alias}.title`)}, '') || ' ' || coalesce(${sql.ref(`${alias}.notes`)}, '')))`;

/** What was said in a call's line, as `call_note_lines_search_fold` holds it (M17 I12a). */
export const noteLineVectorSql = (alias: string): RawBuilder<string> =>
  sql<string>`to_tsvector('simple', caime_find_text(coalesce(${sql.ref(`${alias}.body`)}, '')))`;

/** At most this many words of what's typed are matched. */
const WORDS_MAX = 12;

/** The words typed, folded, cut where the index cuts them (a letter or a digit makes a word). */
export function foldedWords(text: string): string[] {
  return foldForFind(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, WORDS_MAX);
}

/**
 * The words typed as a prefix tsquery over a folded index (`'contr':* & 'invoic':*`), each word
 * quoted so nothing in it reads as an operator; empty when the text holds no word.
 */
export function foldedPrefixQuery(text: string): string {
  return foldedWords(text)
    .map((w) => `'${w.replace(/'/g, "''")}':*`)
    .join(' & ');
}

/** A word Arabic writes with the article or a joined "و", without it (`caime_find_text`'s rule). */
export function bareArabic(word: string): string | null {
  if (!/^[ء-ي]+$/.test(word)) return null;
  if (/^(وال|بال|كال|فال)../.test(word)) return word.slice(3);
  if (/^(ال|لل)../.test(word)) return word.slice(2);
  if (/^و.../.test(word)) return word.slice(1);
  return null;
}

/** The forms of a written word a typed one may start: as it's folded, and bare of an article. */
export function wordForms(written: string): string[] {
  const folded = foldForFind(written);
  const bare = bareArabic(folded);
  return bare ? [folded, bare] : [folded];
}
