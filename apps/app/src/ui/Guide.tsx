import type { Character as CharacterName, Expression } from '@caishy/brand/characters';
import { View } from 'react-native';
import { Character } from '@/brand/Character';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from './Button';

/**
 * A guide for a quiet moment (an empty list, a search not yet typed): a Caishy Friend in the
 * Playful style, a simple icon in Minimal (BRAND.md B7).
 */
export function Guide({
  character,
  expression,
  icon: Icon,
  size = 120,
}: {
  character: CharacterName;
  expression?: Expression;
  icon: IconComponent;
  size?: number;
}) {
  const t = useTheme();
  if (t.playful)
    return (
      <View testID="guide-character">
        <Character name={character} expression={expression} size={size} />
      </View>
    );
  return (
    <View
      testID="guide-icon"
      style={{
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: t.c.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={28} color={t.c.textSecondary} />
    </View>
  );
}
