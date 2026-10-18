import { tr } from '@caime/core/i18n';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import Check from 'lucide-react-native/icons/check';
import { useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Wordmark } from '@/brand/Wordmark';
import { AppIcon } from '@/features/apps/AppIcon';
import { PublisherLine } from '@/features/apps/PublisherLine';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

const PARAMS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
] as const;

/** Where "back" is, as someone would recognise it: a site's name, or the app itself. */
function backName(uri: string): string | null {
  try {
    const u = new URL(uri);
    return /^https?:$/.test(u.protocol) ? u.host : null;
  } catch {
    return null;
  }
}

/** Back to the app, wherever it lives: a web address, or its own scheme on a phone. */
function goBackTo(url: string) {
  if (Platform.OS === 'web') window.location.assign(url);
  else void Linking.openURL(url);
}

/**
 * An app asks to act for you (PRD §74): who made it, what it wants to do, where you'll go back
 * to. You let it in or not; either way you go back to it, and nothing happens until you choose.
 */
export default function Authorize() {
  const t = useTheme();
  const minor = useSession((s) => s.user?.minor ?? false);
  const raw = useLocalSearchParams<Record<(typeof PARAMS)[number], string>>();
  const params = Object.fromEntries(
    PARAMS.filter((k) => typeof raw[k] === 'string').map((k) => [k, raw[k] as string]),
  );
  const q = useQuery({
    queryKey: qk.oauthConsent(params),
    queryFn: () => endpoints.oauthConsent(params),
    retry: false,
  });
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: 'allow' | 'deny') => {
    setBusy(decision);
    setError(null);
    try {
      goBackTo((await endpoints.oauthDecide(params, decision)).redirect);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };
  const c = q.data;
  const back = c ? backName(c.redirectUri) : null;
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 16,
          maxWidth: 520,
          width: '100%',
          alignSelf: 'center',
          flexGrow: 1,
          justifyContent: 'center',
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <Wordmark height={28} />
        </View>
        <Card>
          {q.isPending ? (
            <SkeletonRows />
          ) : q.isError || !c ? (
            <View style={{ gap: 12 }} testID="oauth-bad-request">
              <Text variant="headline">{tr('This link from an app isn’t right')}</Text>
              <Text variant="body" color="textSecondary">
                {(q.error as Error | null)?.message ?? tr('Go back to the app and try again.')}
              </Text>
              <Button
                label={tr('Go to Caime')}
                variant="secondary"
                onPress={() => router.replace('/')}
              />
            </View>
          ) : (
            <View style={{ gap: 16 }} testID="oauth-consent">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {/* The same icon and publisher Discover and Connected show (M8). */}
                <AppIcon url={c.app.iconUrl} appId={c.app.id} name={c.app.name} size={48} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="headline">
                    {tr('{name} wants to act for you', { name: c.app.name })}
                  </Text>
                  <PublisherLine publisher={c.app.publisher} testID="oauth-publisher" />
                  {c.app.website ? (
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      {c.app.website}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <Text variant="captionStrong" color="textSecondary">
                  {tr('It will be able to')}
                </Text>
                {c.scopes.map((s) => (
                  <View
                    key={s.scope}
                    style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
                  >
                    <Check size={16} color={t.c.success} />
                    <Text variant="body" style={{ flex: 1 }}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
              <Text variant="caption" color="textSecondary">
                {c.allowedBefore
                  ? tr(
                      'Never your password, privacy or account. What it sends says “via {name}”. End it any time in You → Apps. You let it in before.',
                      { name: c.app.name },
                    )
                  : tr(
                      'Never your password, privacy or account. What it sends says “via {name}”. End it any time in You → Apps.',
                      { name: c.app.name },
                    )}
              </Text>
              {minor ? (
                <Text variant="body" testID="oauth-minor">
                  {tr('Apps act for people over 18, so this one can’t act for you.')}
                </Text>
              ) : null}
              {error ? (
                <Text variant="caption" color="danger">
                  {error}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {minor ? null : (
                  <Button
                    label={tr('Allow')}
                    onPress={() => void decide('allow')}
                    loading={busy === 'allow'}
                    testID="oauth-allow"
                  />
                )}
                <Button
                  label={
                    minor
                      ? back
                        ? tr('Go back to {back}', { back })
                        : tr('Go back to the app')
                      : tr('Cancel')
                  }
                  variant={minor ? 'primary' : 'secondary'}
                  onPress={() => void decide('deny')}
                  loading={busy === 'deny'}
                  testID="oauth-deny"
                />
              </View>
              {minor ? null : (
                <Text variant="caption" color="textTertiary">
                  {back
                    ? tr('Then you’ll go back to {back}.', { back })
                    : tr('Then you’ll go back to the app.')}
                </Text>
              )}
            </View>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
