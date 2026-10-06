import type { TypeStyle } from '@caime/brand/tokens';
import { Platform, type TextStyle } from 'react-native';

/** How a face is asked for: its family, and its weight where the family's name doesn't carry it. */
export interface FontFace {
  fontFamily: string;
  fontWeight?: TextStyle['fontWeight'];
}

/** The system's monospace; its weight is a style, not a file. */
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * On a phone each weight is its own file loaded through expo-font (`fontFiles.ts`), so the family
 * name carries the weight; the web asks for one family per typeface (`fonts.web.ts`).
 */
const FAMILIES = {
  heading: {
    400: 'Nunito_600SemiBold',
    500: 'Nunito_600SemiBold',
    600: 'Nunito_600SemiBold',
    700: 'Nunito_700Bold',
    800: 'Nunito_800ExtraBold',
    900: 'Nunito_900Black',
  },
  body: {
    400: 'Inter_400Regular',
    500: 'Inter_500Medium',
    600: 'Inter_600SemiBold',
    700: 'Inter_700Bold',
    800: 'Inter_700Bold',
    900: 'Inter_700Bold',
  },
} as const;

export function fontFace(family: TypeStyle['family'], weight: TypeStyle['weight']): FontFace {
  if (family === 'mono')
    return { fontFamily: MONO, fontWeight: String(weight) as TextStyle['fontWeight'] };
  return { fontFamily: FAMILIES[family][weight] };
}
