import {
  type Character as CharacterName,
  characterSvg,
  type Expression,
} from '@caishy/brand/characters';
import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

export interface CharacterProps {
  name: CharacterName;
  expression?: Expression;
  size?: number;
  accents?: boolean;
  /** Decorative by default; pass a label when the character carries meaning. */
  label?: string;
}

/** A Caishy Friend (BRAND.md B3), drawn from the brand package's vector builders. */
export const Character = memo(function Character({
  name,
  expression = 'happy',
  size = 120,
  accents = true,
  label,
}: CharacterProps) {
  const xml = useMemo(
    () => characterSvg(name, { expression, accents, detail: size >= 48 }),
    [name, expression, accents, size],
  );
  return (
    <View
      accessible={Boolean(label)}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={{ width: size, height: size }}
    >
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
});
