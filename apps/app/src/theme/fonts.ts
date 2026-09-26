import type { TypeStyle } from '@caishy/brand/tokens';

/** Each weight is its own font file, so the family name carries the weight. */
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

export function fontFamily(family: TypeStyle['family'], weight: TypeStyle['weight']): string {
  return FAMILIES[family][weight];
}
