/**
 * Caime in Arabic (R54). Keys are the English as written in the code; a value is the Arabic,
 * or the plural forms by CLDR category for a `trn` key. Written in Modern Standard Arabic with
 * the product's own voice (names, never pronouns; sentence case; no guilt), for an Egyptian
 * reader first; a native speaker's review is still owed (docs/REVIEW-2026-10.md).
 * `i18n-catalog.test.ts` fails when a string in the code has no entry here, or an entry has no
 * string. `node scripts/i18n-keys.mjs missing ar` lists what's missing.
 */
import type { Catalog } from '../i18n';

import { arA } from './ar-a';
import { arB } from './ar-b';

export const ar: Catalog = { ...arA, ...arB };
