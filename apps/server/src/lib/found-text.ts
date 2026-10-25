/**
 * What a message search found, as the searcher reads it (M17 I5): the snippet, the words as they
 * were written with the ones the query matched marked (core's `MATCH_START` and `MATCH_END`, which
 * `snippetParts` reads), a window of `SNIPPET_WORDS` from a few before the first match; and the
 * order, by how well each message answers the words and how recent it is. Matching reads a word
 * as the index does (`wordForms`: "احمد" marks "أحمد", "عرض" marks "العرض", "cafe" marks "Café"),
 * which `ts_headline` never did; a typed word matches the start of a written one, never its end.
 */
import { MATCH_END, MATCH_START } from '@caime/core';
import { foldedWords, wordForms } from './fold-sql';

export const SNIPPET_WORDS = 18;
/** Words shown before the first match. */
const BEFORE = 4;
/** Characters of a text with no word at all (a card with only signs on it). */
const NO_WORDS_CHARS = 140;
const MARKS = new RegExp(`[${MATCH_START}${MATCH_END}]`, 'g');

interface Token {
  start: number;
  end: number;
  forms: string[];
}

function tokensOf(text: string): Token[] {
  const tokens: Token[] = [];
  // A mark belongs to its word: Arabic written with its vowels ("مُحَمَّد") is one word.
  for (const m of text.matchAll(/[\p{L}\p{N}\p{M}]+/gu))
    tokens.push({ start: m.index, end: m.index + m[0].length, forms: wordForms(m[0]) });
  return tokens;
}

/** How a written word answers a typed one: 1 whole, 0.6 by its start, 0 not at all. */
function answers(token: Token, word: string): number {
  if (token.forms.includes(word)) return 1;
  return token.forms.some((f) => f.startsWith(word)) ? 0.6 : 0;
}

/** The snippet of `text` for what was typed, its matches marked. */
export function markSnippet(text: string, typed: string): string {
  // Nothing a person wrote can be mistaken for a marker.
  const clean = text.replace(MARKS, '');
  const words = foldedWords(typed);
  const tokens = tokensOf(clean);
  if (tokens.length === 0) return clean.slice(0, NO_WORDS_CHARS);
  const hit = tokens.map((t) => words.some((w) => answers(t, w) > 0));
  const first = hit.indexOf(true);
  const from = first < 0 ? 0 : Math.max(0, first - BEFORE);
  const to = Math.min(tokens.length, from + SNIPPET_WORDS);
  let out = '';
  let at = tokens[from]!.start;
  for (let i = from; i < to; i++) {
    const token = tokens[i]!;
    out += clean.slice(at, token.start);
    const word = clean.slice(token.start, token.end);
    out += hit[i] ? MATCH_START + word + MATCH_END : word;
    at = token.end;
  }
  if (from > 0) out = `…${out}`;
  if (to < tokens.length) out = `${out}…`;
  return out;
}

/** Days after which a match counts half as much as one written today. */
export const RECENCY_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * How well `text` answers what was typed, recency weighed in: each word typed scores its best
 * written word (whole beats a start), the words found side by side in the order typed add half,
 * and age divides it: a match `RECENCY_DAYS` old counts half, twice that a third. Rules, so it's
 * the same for everyone and every language, and testable.
 */
export function relevance(text: string, typed: string, ageMs: number): number {
  const words = foldedWords(typed);
  if (words.length === 0) return 0;
  const tokens = tokensOf(text.replace(MARKS, ''));
  const best = words.map((w) => Math.max(0, ...tokens.map((t) => answers(t, w))));
  let score = best.reduce((a, b) => a + b, 0) / words.length;
  if (words.length > 1) {
    const side = tokens.some((_, i) =>
      words.every((w, k) => answers(tokens[i + k] ?? NONE, w) > 0),
    );
    if (side) score += 0.5;
  }
  return score / (1 + Math.max(0, ageMs) / DAY_MS / RECENCY_DAYS);
}

const NONE: Token = { start: 0, end: 0, forms: [] };
