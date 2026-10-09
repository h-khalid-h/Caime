import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import Check from 'lucide-react-native/icons/check';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Back } from '@/ui/directional';
import { IconButton } from '@/ui/IconButton';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Screen, TopBar } from '@/ui/Screen';
import { Text } from '@/ui/Text';

export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  const { desktop } = useLayout();
  return (
    <Screen edges={desktop ? [] : ['top']}>
      <TopBar
        left={
          !desktop ? (
            <IconButton
              icon={Back}
              label={tr('Back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
            />
          ) : null
        }
        title={title}
      />
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 24,
          paddingBottom: 56,
          maxWidth: 680,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        {children}
      </ScrollView>
    </Screen>
  );
}

export function Group({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {title ? (
        <Text
          variant="overline"
          color="textSecondary"
          style={{ paddingHorizontal: 6 }}
          accessibilityRole="header"
        >
          {title}
        </Text>
      ) : null}
      <View
        style={{
          // On the canvas, a group is its own surface: no outline (R69).
          backgroundColor: t.c.surface,
          borderRadius: t.radii.lg,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
      {footer ? (
        <Text variant="caption" color="textTertiary" style={{ paddingHorizontal: 4 }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** A radio list: one choice among a few, each with an optional explanation. */
export function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; detail?: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={o.detail ? `${o.label}, ${o.detail}` : o.label}
            onPress={() => onChange(o.value)}
            haptic
            style={({ hovered }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
              minHeight: 52,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: t.c.border,
              backgroundColor: hovered ? t.c.surfaceHover : 'transparent',
            })}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{o.label}</Text>
              {o.detail ? (
                <Text variant="caption" color="textSecondary">
                  {o.detail}
                </Text>
              ) : null}
            </View>
            {selected ? (
              <Check
                size={20}
                color={t.scheme === 'dark' ? t.c.accent : t.c.ink}
                strokeWidth={2.6}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
