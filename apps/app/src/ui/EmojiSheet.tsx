/**
 * Choosing one emoji (a status's): the ones people reach for, a tap each, in a grid that reads as
 * one choice, with the one chosen marked. Never typed, so it's always a whole emoji.
 */
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Button } from './Button';
import { MORE_REACTIONS, QUICK_REACTIONS } from './emoji';
import { Pressable } from './Pressable';
import { Sheet } from './Sheet';
import { Text } from './Text';

const ALL = [...QUICK_REACTIONS, ...MORE_REACTIONS];

export function EmojiSheet({
  open,
  onClose,
  title,
  value,
  onPick,
  testID,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  value: string | null;
  /** The emoji chosen, or null for none. */
  onPick: (emoji: string | null) => void;
  testID?: string;
}) {
  const t = useTheme();
  const pick = (emoji: string | null) => {
    onPick(emoji);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        value ? (
          <Button
            label="No emoji"
            variant="ghost"
            block
            onPress={() => pick(null)}
            testID={testID ? `${testID}-none` : undefined}
          />
        ) : undefined
      }
    >
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={title}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}
      >
        {ALL.map((emoji) => {
          const on = emoji === value;
          return (
            <Pressable
              key={emoji}
              accessibilityRole="radio"
              accessibilityLabel={emoji}
              accessibilityState={{ checked: on }}
              onPress={() => pick(emoji)}
              haptic
              testID={testID ? `${testID}-${emoji}` : undefined}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? t.c.accentSoft : t.c.surfaceMuted,
                borderWidth: on ? 2 : 0,
                borderColor: t.c.accent,
              }}
            >
              <Text style={{ fontSize: 24, lineHeight: 30 }} maxFontSizeMultiplier={1}>
                {emoji}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
