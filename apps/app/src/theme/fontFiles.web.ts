/**
 * On the web the faces come from public/fonts as subsetted WOFF2, declared in index.html under
 * the same names (`fonts.ts`), so expo-font has nothing to load: 1.5 MB of TTF stays off the
 * wire, and a page takes only the weights and ranges it draws.
 */
export const LATIN_FONT_FILES: Record<string, number> = {};
export const ARABIC_FONT_FILES: Record<string, number> = {};
export const FONT_FILES: Record<string, number> = {};
