import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Back } from '@/ui/directional';
import { IconButton } from '@/ui/IconButton';
import { useLayout } from '@/ui/layout';
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

/** Until every screen is on ChoiceSheet (R77): the radio list, from ui. */
export { ChoiceList as Choice } from '@/ui/ChoiceList';
