/**
 * Caime in French (R55): the third language, for the Maghreb, Lebanon and francophone readers
 * where the first customers are. Keys are the English as written in the code; a value is the
 * French, or the plural forms by CLDR category for a `trn` key. Written for a reader of either
 * gender ("vous"; no participle about the reader where a noun phrase works), in sentence case,
 * with French punctuation (a space before « : », « ; », « ? » and « ! », guillemets for quotes).
 * `i18n-catalog.test.ts` fails when a string in the code has no entry here, or an entry has no
 * string. `node scripts/i18n-keys.mjs missing fr` lists what's missing.
 */
import type { Catalog } from '../i18n';

import { frA } from './fr-a';
import { frB } from './fr-b';

export const fr: Catalog = { ...frA, ...frB };
