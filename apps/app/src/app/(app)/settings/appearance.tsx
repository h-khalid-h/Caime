import { type BubbleTheme, bubbleThemes } from '@caime/brand/tokens';
import { Platform, Switch, View } from 'react-native';
import { Character } from '@/brand/Character';
import { Choice, Group, SettingsPage } from '@/features/settings/SettingsPage';
import { savePrefs } from '@/features/settings/savePrefs';
import { usePrefs } from '@/theme/prefs';
import { useTheme } from '@/theme/theme';
import { Check } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

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
          Are we still on for Saturday?
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
          Yes! I’ll bring the cake 🎂
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
  const prefs = usePrefs();
  const enterDefault = Platform.OS === 'web';
  return (
    <SettingsPage title="Appearance">
      <Group>
        <Preview />
      </Group>
      <Group
        title="Your bubble colour"
        footer="Only changes how your own messages look to you. Everyone keeps their own choice."
      >
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 }}
          accessibilityRole="radiogroup"
          accessibilityLabel="Bubble colour"
        >
          {(Object.keys(bubbleThemes) as BubbleTheme[]).map((key) => {
            const b = bubbleThemes[key][t.scheme];
            const selected = prefs.bubbleTheme === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={bubbleThemes[key].label}
                onPress={() => savePrefs({ bubbleTheme: key })}
                haptic
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
                  {bubbleThemes[key].label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Group>
      <Group title="Theme">
        <Choice
          label="Theme"
          value={prefs.theme}
          onChange={(theme) => savePrefs({ theme })}
          options={[
            {
              value: 'system',
              label: 'Match this device',
              detail: 'Light by day, dark by night, if your device does that',
            },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Group>
      <Group
        title="Style"
        footer="The same Caime either way. Minimal keeps the characters for special moments."
      >
        <View style={{ flexDirection: 'row', gap: 12, padding: 16 }}>
          {(
            [
              {
                value: 'playful',
                label: 'Playful',
                detail: 'Characters, stickers, softer shapes',
                character: 'momo',
              },
              {
                value: 'minimal',
                label: 'Minimal',
                detail: 'Quieter, crisper, fewer flourishes',
                character: 'panda',
              },
            ] as const
          ).map((o) => {
            const selected = prefs.personality === o.value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${o.label}, ${o.detail}`}
                onPress={() => savePrefs({ personality: o.value })}
                haptic
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 6,
                  padding: 12,
                  borderRadius: 16,
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
                <Text variant="label">{o.label}</Text>
                <Text variant="caption" color="textSecondary" align="center">
                  {o.detail}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Group>
      <Group title="Behaviour">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Enter sends the message</Text>
            <Text variant="caption" color="textSecondary">
              Shift + Enter for a new line
            </Text>
          </View>
          <Switch
            value={prefs.enterToSend ?? enterDefault}
            onValueChange={(v) => savePrefs({ enterToSend: v })}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            accessibilityLabel="Enter sends the message"
          />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: t.c.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Reduce motion</Text>
            <Text variant="caption" color="textSecondary">
              Fewer animations and no shimmer
            </Text>
          </View>
          <Switch
            value={prefs.reduceMotion}
            onValueChange={(v) => savePrefs({ reduceMotion: v })}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            accessibilityLabel="Reduce motion"
          />
        </View>
      </Group>
    </SettingsPage>
  );
}
