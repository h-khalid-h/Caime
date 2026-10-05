import { ScrollView } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Pressable } from './Pressable';
import { lifted } from './shadow';
import { Text } from './Text';

export interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (v: T) => void;
  label: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: SegmentedProps<T>) {
  const t = useTheme();
  // Five segments don't fit a 390-px phone: rather than cut their words, the row scrolls, and
  // each segment keeps the width its words need.
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{ backgroundColor: t.c.surfaceMuted, borderRadius: 12 }}
      contentContainerStyle={{ flexDirection: 'row', flexGrow: 1, padding: 3, gap: 2 }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.count ? `${o.label}, ${o.count}` : o.label}
            onPress={() => onChange(o.value)}
            haptic
            focusRadius={10}
            style={({ hovered }) => ({
              flexGrow: 1,
              flexShrink: 0,
              minHeight: 34,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              paddingHorizontal: 8,
              backgroundColor: selected ? t.c.surface : hovered ? t.c.surfaceHover : 'transparent',
              ...(selected ? lifted(t.c.shadow, 1, 4) : {}),
            })}
          >
            <Text
              variant="captionStrong"
              color={selected ? 'text' : 'textSecondary'}
              numberOfLines={1}
            >
              {o.label}
            </Text>
            {o.count ? (
              <Text variant="caption" color={selected ? 'accentStrong' : 'textTertiary'}>
                {o.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
