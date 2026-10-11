/**
 * Switching between views of one thing (R77): the Actions tab's lists, a history's kinds.
 * A tablist, never a form's value (that's `ChoiceChips`): each segment a tab, the row one stop
 * for the keyboard (the arrows move between them and show the one moved to), and each segment
 * `${testID}-${value}`.
 */
import { ScrollView, View } from 'react-native';
import { useRtl } from '@/lib/direction';
import { useTheme } from '@/theme/theme';
import { arrowKeyMoves, rovingTabIndex } from './arrowKeys';
import { Pressable } from './Pressable';
import { lifted } from './shadow';
import { Text } from './Text';

export interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (v: T) => void;
  label: string;
  /** The row's id; each segment is `${testID}-${value}`. */
  testID?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  testID,
}: SegmentedProps<T>) {
  const t = useTheme();
  const rtl = useRtl();
  const anyChosen = options.some((o) => o.value === value);
  // Five segments don't fit a 390-px phone: rather than cut their words, the row scrolls, and
  // each segment keeps the width its words need.
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      testID={testID}
      style={{ backgroundColor: t.c.surfaceMuted, borderRadius: t.radii.md }}
      {...arrowKeyMoves({ rtl, choose: (i) => options[i] && onChange(options[i].value) })}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', flexGrow: 1, padding: 3, gap: 2 }}
      >
        {options.map((o, i) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={o.count ? `${o.label}, ${o.count}` : o.label}
              tabIndex={rovingTabIndex(selected, i === 0, anyChosen)}
              onPress={() => onChange(o.value)}
              haptic
              focusRadius={t.radii.sm}
              testID={testID ? `${testID}-${o.value}` : undefined}
              style={({ hovered }) => ({
                flexGrow: 1,
                flexShrink: 0,
                minHeight: 34,
                borderRadius: t.radii.sm,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
                paddingHorizontal: 8,
                backgroundColor: selected
                  ? t.c.surface
                  : hovered
                    ? t.c.surfaceHover
                    : 'transparent',
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
    </View>
  );
}
