import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Character } from '@/brand/Character';
import { Wordmark } from '@/brand/Wordmark';
import { useTheme } from '@/theme/theme';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

/** The brand panel beside auth forms on large screens (BRAND.md: expressive intensity). */
export function BrandPanel() {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.scheme === 'dark' ? t.c.surfaceRaised : t.c.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        gap: 28,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
        <Character name="momo" size={104} expression="excited" />
        <Character name="caishy" size={176} expression="happy" />
        <Character name="niko" size={104} expression="wink" />
      </View>
      <View style={{ alignItems: 'center', gap: 12, maxWidth: 440 }}>
        <Wordmark height={46} />
        <Text variant="mono" color="textTertiary" align="center">
          messaging that understands your relationships
        </Text>
        <Text variant="title" align="center">
          Family, friends and work, each in its place.
        </Text>
        <Text variant="body" color="textSecondary" align="center">
          The right conversations find you, and the rest wait politely. How you label someone is
          only ever yours.
        </Text>
      </View>
    </View>
  );
}

export function AuthLayout({
  kicker,
  title,
  subtitle,
  children,
  back = true,
}: {
  /** What this screen is, in a word or two, as a spec sheet labels it (mono, above the title). */
  kicker?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  back?: boolean;
}) {
  const { desktop } = useLayout();
  const t = useTheme();
  const form = (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: desktop ? 'center' : 'flex-start',
          padding: 20,
          paddingTop: 8,
        }}
      >
        <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', gap: 20 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, marginStart: -8 }}
          >
            {back ? (
              <IconButton
                icon={ArrowLeft}
                label="Back"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
              />
            ) : null}
            {!desktop ? (
              <View style={{ flex: 1, alignItems: 'center', marginEnd: back ? 44 : 0 }}>
                <Wordmark height={24} />
              </View>
            ) : null}
          </View>
          <View style={{ gap: 6 }}>
            {kicker ? (
              <Text variant="mono" color="textTertiary" testID="auth-kicker">
                {kicker}
              </Text>
            ) : null}
            <Text variant="display" accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text variant="body" color="textSecondary">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
  if (!desktop) return <Screen edges={['top', 'bottom']}>{form}</Screen>;
  return (
    <Screen edges={['top', 'bottom']} surface>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <BrandPanel />
        <View style={{ flex: 1, backgroundColor: t.c.surface }}>{form}</View>
      </View>
    </Screen>
  );
}
