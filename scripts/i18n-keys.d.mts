export interface Key {
  text: string;
  plural: boolean;
  files: Set<string>;
}
export const SITE_FILES: Set<string>;
export function isSiteKey(key: Key): boolean;
export function keysFor(keys: Map<string, Key>, site: boolean): Map<string, Key>;
export function collectKeys(): Map<string, Key>;
/** English shown outside `tr`, `trn` or `msg`: where, and what kind of literal. */
export interface BareLiteral {
  file: string;
  line: number;
  kind: string;
  text: string;
}
export function bareLiterals(): BareLiteral[];
/** Every `tr`, `trn` or `trFor` call whose result is cased by hand, as "file:line" (M16 D4). */
export function casedWords(): string[];
/** Fragments, placeholders named by the code and placeholders left out, as "file:line what" (M16 D4). */
export function placeholderIssues(): string[];
/** Lists joined by a comma of their own in the app and core, as "file:line" (M16 D4). */
export function commaJoins(): string[];
