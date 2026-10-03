import { tr } from '@caime/core/i18n';
import { View } from 'react-native';
import { Character } from '@/brand/Character';
import { useTheme } from '@/theme/theme';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { STICKERS, type StickerDef } from './pack';

export function StickerPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (s: StickerDef) => void;
}) {
  const t = useTheme();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('Caishy Friends')}
      subtitle={tr('Stickers for when words aren’t enough')}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
        {STICKERS.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityLabel={tr('Send sticker: {label}', { label: tr(s.label) })}
            onPress={() => {
              onPick(s);
              onClose();
            }}
            haptic
            focusRadius={16}
            style={({ hovered, pressed }) => ({
              padding: 6,
              borderRadius: 16,
              backgroundColor: hovered || pressed ? t.c.surfaceHover : 'transparent',
            })}
          >
            <Character name={s.character} expression={s.expression} size={84} />
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
