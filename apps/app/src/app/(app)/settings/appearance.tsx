import { type BubbleTheme, bubbleThemes } from '@caime/brand/tokens';
import { msg, tr } from '@caime/core/i18n';
import Check from 'lucide-react-native/icons/check';
import { Platform, View } from 'react-native';
import { Character } from '@/brand/Character';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { savePrefs } from '@/features/settings/savePrefs';
import { useRtl } from '@/lib/direction';
import { usePrefs } from '@/theme/prefs';
import { useTheme } from '@/theme/theme';
import { arrowKeyMoves, rovingTabIndex } from '@/ui/arrowKeys';
import { ChoiceSheet } from '@/ui/ChoiceSheet';
import { Pressable } from '@/ui/Pressable';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';

const BUBBLES = Object.keys(bubbleThemes) as BubbleTheme[];
const STYLES = [
  {
    value: 'playful',
    label: msg('Playful'),
    detail: msg('Characters, stickers, softer shapes'),
    character: 'momo',
  },
  {
    value: 'minimal',
    label: msg('Minimal'),
    detail: msg('Quieter, crisper, fewer flourishes'),
    character: 'panda',
  },
] as const;

/** The bubble themes' names (brand tokens), here so the catalog knows them. */
const BUBBLE_NAME: Record<string, string> = {
  Plum: msg('Plum'),
  'Caime Pink': msg('Caime Pink'),
  Lavender: msg('Lavender'),
  Sky: msg('Sky'),
  Mint: msg('Mint'),
  Sunshine: msg('Sunshine'),
};
const bubbleName = (label: string) => tr(BUBBLE_NAME[label] ?? label);

function Preview() {
  const t = useTheme();
  return (
    <View style={{ padding: 16, gap: 6, backgroundColor: t.c.canvas }}>
      <View
        style={{
          alignSelf: 'flex-start',
          maxWidth: '75%',
          backgroundColor: t.c.bubbleOther,
          borderRadius: t.radii.bubble,
          borderBottomStartRadius: t.radii.bubbleTail,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Text variant="message" color={t.c.onBubbleOther}>
          {tr('Are we still on for Saturday?')}
        </Text>
      </View>
      <View
        style={{
          alignSelf: 'flex-end',
          maxWidth: '75%',
          backgroundColor: t.bubble.bg,
          borderRadius: t.radii.bubble,
          borderBottomEndRadius: t.radii.bubbleTail,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Text variant="message" color={t.bubble.fg}>
          {tr('Yes! I’ll bring the cake 🎂')}
        </Text>
        <Text
          variant="caption"
          color={t.bubble.meta}
          style={{ alignSelf: 'flex-end', fontSize: 11 }}
        >
          9:41
        </Text>
      </View>
    </View>
  );
}

export default function Appearance() {
  const t = useTheme();
  const rtl = useRtl();
  const prefs = usePrefs();
  const enterDefault = Platform.OS === 'web';
  return (
    <SettingsPage title={tr('Appearance')}>
      <Group>
        <Preview />
      </Group>
      <Group
        title={tr('Your bubble colour')}
        footer={tr(
          'Only changes how your own messages look to you. Everyone keeps their own choice.',
        )}
      >
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 }}
          accessibilityRole="radiogroup"
          accessibilityLabel={tr('Bubble colour')}
          // A colour is its own kind of choice (a swatch, not a chip): still one group, one stop
          // for the keyboard, the arrows walking the swatches (R77).
          {...arrowKeyMoves({
            rtl,
            choose: (i) => BUBBLES[i] && savePrefs({ bubbleTheme: BUBBLES[i] }),
          })}
        >
          {BUBBLES.map((key, i) => {
            const b = bubbleThemes[key][t.scheme];
            const selected = prefs.bubbleTheme === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={bubbleName(bubbleThemes[key].label)}
                tabIndex={rovingTabIndex(selected, i === 0, true)}
                onPress={() => savePrefs({ bubbleTheme: key })}
                haptic
                testID={`bubble-${key}`}
                style={{ alignItems: 'center', gap: 6, width: 72 }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: b.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 3,
                    borderColor: selected ? t.c.text : 'transparent',
                  }}
                >
                  {selected ? <Check size={22} color={b.fg} strokeWidth={3} /> : null}
                </View>
                <Text
                  variant="caption"
                  color={selected ? 'text' : 'textSecondary'}
                  numberOfLines={1}
                >
                  {bubbleName(bubbleThemes[key].label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Group>
      <Group>
        <ChoiceSheet
          label={tr('Theme')}
          value={prefs.theme}
          onChange={(theme) => savePrefs({ theme })}
          options={[
            {
              value: 'system',
              label: tr('Match this device'),
              detail: tr('Light by day, dark by night, if your device does that'),
            },
            { value: 'light', label: tr('Light') },
            { value: 'dark', label: tr('Dark') },
          ]}
          testID="theme"
        />
      </Group>
      <Group
        title={tr('Style')}
        footer={tr('The same Caime either way. Minimal keeps the characters for special moments.')}
      >
        <View
          style={{ flexDirection: 'row', gap: 12, padding: 16 }}
          accessibilityRole="radiogroup"
          accessibilityLabel={tr('Style')}
          {...arrowKeyMoves({
            rtl,
            choose: (i) => STYLES[i] && savePrefs({ personality: STYLES[i].value }),
          })}
        >
          {STYLES.map((o, i) => {
            const selected = prefs.personality === o.value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${tr(o.label)}, ${tr(o.detail)}`}
                tabIndex={rovingTabIndex(selected, i === 0, true)}
                onPress={() => savePrefs({ personality: o.value })}
                haptic
                testID={`style-${o.value}`}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 6,
                  padding: 12,
                  borderRadius: t.radii.lg,
                  borderWidth: 2,
                  borderColor: selected ? t.c.primary : t.c.border,
                  backgroundColor: selected ? t.c.surfaceMuted : t.c.surface,
                }}
              >
                <Character
                  name={o.character}
                  expression={o.value === 'playful' ? 'excited' : 'happy'}
                  size={64}
                />
                <Text variant="label">{tr(o.label)}</Text>
                <Text variant="caption" color="textSecondary" align="center">
                  {tr(o.detail)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Group>
      <Group title={tr('Behaviour')}>
        <SwitchRow
          inset
          label={tr('Enter sends the message')}
          detail={tr('Shift + Enter for a new line')}
          value={prefs.enterToSend ?? enterDefault}
          onChange={(v) => savePrefs({ enterToSend: v })}
          testID="enter-sends"
        />
        <SwitchRow
          inset
          divider
          label={tr('Reduce motion')}
          detail={tr('Fewer animations and no shimmer')}
          value={prefs.reduceMotion}
          onChange={(v) => savePrefs({ reduceMotion: v })}
          testID="reduce-motion"
        />
      </Group>
    </SettingsPage>
  );
}
