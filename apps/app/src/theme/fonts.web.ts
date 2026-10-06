import { fonts, type TypeStyle } from '@caime/brand/tokens';
import type { TextStyle } from 'react-native';
import type { FontFace } from './fonts';

/** The system's monospace on every desktop and phone browser. */
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/**
 * On the web a typeface is one family (the brand's `fonts`), its weights declared once in
 * index.html from public/fonts, so the browser picks the face, here and on the server's own pages.
 */
export function fontFace(family: TypeStyle['family'], weight: TypeStyle['weight']): FontFace {
  return {
    fontFamily: family === 'mono' ? MONO : fonts[family],
    fontWeight: String(weight) as TextStyle['fontWeight'],
  };
}
