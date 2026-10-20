/**
 * Caime in Turkish (R59): the fourth interface language, for Türkiye (whose clinics serve
 * Arabic-speaking patients by the hundred thousand a year) and Turkish speakers abroad. Written
 * for a reader of either gender in "siz", in sentence case; a native speaker's review is owed,
 * as for Arabic and French. Keys are the English the app and core write.
 */
import type { Catalog } from '../i18n';

import { turkishA } from './tr-a';
import { turkishB } from './tr-b';

export const turkish: Catalog = { ...turkishA, ...turkishB };
