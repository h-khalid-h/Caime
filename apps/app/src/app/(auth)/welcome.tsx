import { router } from 'expo-router';
import { View } from 'react-native';
import { Character } from '@/brand/Character';
import { Wordmark } from '@/brand/Wordmark';
import { BrandPanel } from '@/features/auth/AuthLayout';
import { handleIn, inviteIn, isAuthorizeLink } from '@/lib/paths';
import { usePendingLink } from '@/state/pendingLink';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { useLayout } from '@/ui/layout';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';

export default function Welcome() {
  const { desktop } = useLayout();
  const t = useTheme();
  // Someone's link brought them here: say whose, so the next step is obvious.
  const link = usePendingLink((s) => s.link);
  const linkHandle = handleIn(link);
  const linkLine = linkHandle
    ? `Create an account or sign in to see @${linkHandle}`
    : inviteIn(link)
      ? 'You were invited. Create an account or sign in and you’re connected'
      : isAuthorizeLink(link)
        ? 'An app asked to act for you. Sign in to answer it'
        : null;
  const actions = (
    <View style={{ gap: 12, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
      {linkLine ? (
        <View
          style={{
            alignSelf: 'center',
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: t.c.surfaceMuted,
          }}
          testID="welcome-link"
        >
          <Text variant="captionStrong" align="center">
            {linkLine}
          </Text>
        </View>
      ) : null}
      <Button
        label="Create your account"
        size="lg"
        block
        onPress={() => router.push('/sign-up')}
        testID="welcome-sign-up"
      />
      <Button
        label="I already have an account"
        variant="secondary"
        size="lg"
        block
        onPress={() => router.push('/sign-in')}
        testID="welcome-sign-in"
      />
      <Text variant="caption" color="textTertiary" align="center" style={{ marginTop: 4 }}>
        Free for people. Private by design: how you label someone is only ever yours.
      </Text>
    </View>
  );
  if (desktop) {
    return (
      <Screen edges={['top', 'bottom']} surface>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <BrandPanel />
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              padding: 48,
              gap: 28,
              backgroundColor: t.c.surface,
            }}
          >
            <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center', gap: 8 }}>
              <Text variant="mono" color="textTertiary">
                messaging that understands your relationships
              </Text>
              <Text variant="display" accessibilityRole="header">
                Welcome to Caime
              </Text>
              <Text variant="body" color="textSecondary">
                One place for everyone you talk to, and it knows the difference between your mum,
                your manager and your plumber.
              </Text>
              <SpecLines />
            </View>
            {actions}
          </View>
        </View>
      </Screen>
    );
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 16 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <Character name="caishy" size={176} expression="happy" />
          <Wordmark height={44} />
          <View style={{ gap: 8, maxWidth: 360 }}>
            <Text variant="title" align="center" accessibilityRole="header">
              Messaging that understands your relationships.
            </Text>
            <Text variant="body" color="textSecondary" align="center">
              Family, friends and work, each in its place. The right conversations find you.
            </Text>
          </View>
        </View>
        {actions}
      </View>
    </Screen>
  );
}

/** Caime in three lines, as a spec sheet reads: a mono label, then what it means. */
function SpecLines() {
  const t = useTheme();
  const lines: Array<[string, string]> = [
    ['connection', 'Say who someone is to you, once. Everything fits from then on.'],
    ['attention', '“3 need you”, never “47 unread”. It says why.'],
    ['privacy', 'Each side of your life sees what you chose. Only you see your labels.'],
  ];
  return (
    <View
      style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: t.c.border }}
      testID="welcome-spec"
    >
      {lines.map(([label, value]) => (
        <View
          key={label}
          style={{
            flexDirection: 'row',
            gap: 12,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: t.c.border,
          }}
        >
          <Text variant="mono" color="textTertiary" style={{ width: 96, paddingTop: 2 }}>
            {label}
          </Text>
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}
