import type { TypeStyle } from '@caime/brand/tokens';
import { Platform, type TextStyle } from 'react-native';

/** How a face is asked for: its family, and its weight where the family's name doesn't carry it. */
export interface FontFace {
  fontFamily: string;
  fontWeight?: TextStyle['fontWeight'];
}

/** The letters a face is for: the brand's Latin faces, or the Arabic ones paired with them (R73). */
export type Script = 'latin' | 'arabic';

/** The system's monospace; its weight is a style, not a file. */
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * On a phone each weight is its own file loaded through expo-font (`fontFiles.ts`), so the family
 * name carries the weight; the web asks for one family per typeface (`fonts.web.ts`). Arabic
 * text takes the face paired with each family at the nearest weight it has (Baloo Bhaijaan 2's
 * heaviest is 800), since a phone can't pick a face by the letters drawn as a browser does.
 */
const FAMILIES: Record<Script, Record<'heading' | 'body', Record<TypeStyle['weight'], string>>> = {
  latin: {
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
  },
  arabic: {
    heading: {
      400: 'BalooBhaijaan2_600SemiBold',
      500: 'BalooBhaijaan2_600SemiBold',
      600: 'BalooBhaijaan2_600SemiBold',
      700: 'BalooBhaijaan2_700Bold',
      800: 'BalooBhaijaan2_800ExtraBold',
      900: 'BalooBhaijaan2_800ExtraBold',
    },
    body: {
      400: 'NotoSansArabic_400Regular',
      500: 'NotoSansArabic_500Medium',
      600: 'NotoSansArabic_600SemiBold',
      700: 'NotoSansArabic_700Bold',
      800: 'NotoSansArabic_700Bold',
      900: 'NotoSansArabic_700Bold',
    },
  },
};

export function fontFace(
  family: TypeStyle['family'],
  weight: TypeStyle['weight'],
  script: Script = 'latin',
): FontFace {
  if (family === 'mono')
    return { fontFamily: MONO, fontWeight: String(weight) as TextStyle['fontWeight'] };
  return { fontFamily: FAMILIES[script][family][weight] };
}
