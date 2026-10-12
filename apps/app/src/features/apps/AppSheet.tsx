/**
 * One app from Discover (R74): what it says of itself, who published it, how many connected
 * it, and the one way in. A developer's app connects through its own sign-in (`connectUrl`),
 * which asks Caime for what it needs; a built-in of Caime's connects right here (the calendar
 * address), and so does a bridge (R79: a token for the platform). The sheet keeps its last app
 * while it fades.
 */
import type { DirectoryAppView } from '@caime/core/api';
import { APP_PROVIDES_LABELS } from '@caime/core/app-directory';
import { joinNames } from '@caime/core/format';
import { type InterfaceLanguage, tr, trn } from '@caime/core/i18n';
import { APP_PRICING_LABELS, marketplacePath } from '@caime/core/marketplace';
import { Image } from 'expo-image';
import Workflow from 'lucide-react-native/icons/workflow';
import { useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { CalendarFeed } from '@/features/settings/CalendarFeed';
import { WEB_URL } from '@/lib/config';
import { LANGUAGE_NAMES } from '@/lib/i18n';
import { openLink } from '@/lib/links';
import { useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Spec } from '@/ui/Spec';
import { Text } from '@/ui/Text';
import { AppIcon } from './AppIcon';
import { BridgeSheet } from './BridgeSheet';
import { PublisherLine } from './PublisherLine';

export function AppSheet({ app, onClose }: { app: DirectoryAppView | null; onClose: () => void }) {
  // Under 18, nothing connects (R29): the server sends no address, and the sheet says why.
  const minor = useSession((s) => s.user?.minor ?? false);
  const { locale } = useUserClock();
  const t = useTheme();
  const last = useRef(app);
  if (app) last.current = app;
  const shown = app ?? last.current;
  const builtin = shown?.kind === 'builtin';
  const bridge = shown?.kind === 'bridge';
  return (
    <Sheet
      open={app !== null}
      onClose={onClose}
      title={shown?.name}
      subtitle={shown?.tagline ?? undefined}
      footer={
        shown && !builtin && !bridge && shown.connectUrl ? (
          <Button
            label={shown.connected ? tr('Open {name}', { name: shown.name }) : tr('Connect')}
            variant={shown.connected ? 'secondary' : 'primary'}
            block
            size="lg"
            onPress={() => openLink(shown.connectUrl ?? '')}
            testID="discover-connect"
          />
        ) : undefined
      }
    >
      {shown ? (
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <AppIcon
              url={shown.iconUrl}
              appId={shown.id}
              name={shown.name}
              size={56}
              mark={bridge ? Workflow : undefined}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <PublisherLine publisher={shown.publisher} testID="discover-publisher" />
              <Text variant="caption" color="textTertiary" testID="discover-connected-count">
                {trn(shown.connectedCount, '{n} person connected it', '{n} people connected it')}
              </Text>
              {shown.connected ? (
                <Text variant="captionStrong" color="success" testID="discover-connected">
                  {tr('Connected')}
                </Text>
              ) : null}
            </View>
          </View>
          {shown.description ? (
            <Text variant="body" color="textSecondary">
              {shown.description}
            </Text>
          ) : null}
          {shown.provides.length ? (
            <Text variant="caption" color="textTertiary" testID="discover-provides">
              {tr('Gives Caime: {what}', {
                what: joinNames(
                  shown.provides.map((p) => tr(APP_PROVIDES_LABELS[p])),
                  shown.provides.length,
                  locale,
                ),
              })}
            </Text>
          ) : null}
          {shown.screenshots.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -16 }}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
              testID="discover-shots"
            >
              {shown.screenshots.map((s, n) => (
                <Image
                  key={s}
                  source={{ uri: mediaUrl(s) ?? undefined, headers: mediaHeaders() }}
                  accessibilityLabel={tr('{name}, screenshot {n}', { name: shown.name, n: n + 1 })}
                  accessible
                  contentFit="cover"
                  style={{
                    width: 256,
                    height: 160,
                    borderRadius: t.radii.md,
                    backgroundColor: t.c.surfaceMuted,
                  }}
                />
              ))}
            </ScrollView>
          ) : null}
          <Spec
            rows={[
              shown.pricing
                ? {
                    label: tr('price'),
                    value: tr(APP_PRICING_LABELS[shown.pricing]),
                    testID: 'discover-price',
                  }
                : null,
              shown.languages.length
                ? {
                    label: tr('languages'),
                    value: joinNames(
                      shown.languages.map((l) => LANGUAGE_NAMES[l as InterfaceLanguage] ?? l),
                      shown.languages.length,
                      locale,
                    ),
                  }
                : null,
              shown.kind === 'oauth'
                ? {
                    label: tr('AI'),
                    value: shown.aiUse
                      ? tr(
                          'Puts people’s words through {model}. Keeps {keeps}, for {days}, in {where}.',
                          {
                            model: shown.aiUse.model,
                            keeps: shown.aiUse.keeps,
                            days:
                              shown.aiUse.days === 0
                                ? tr('no longer than the answer')
                                : trn(shown.aiUse.days, '{n} day', '{n} days'),
                            where: shown.aiUse.where,
                          },
                        )
                      : tr('It says it puts nobody’s words through a model.'),
                    testID: 'discover-ai',
                  }
                : null,
            ]}
          />
          {builtin ? (
            <View style={{ marginHorizontal: -16 }}>
              <CalendarFeed />
            </View>
          ) : bridge ? (
            <BridgeSheet appId={shown.id} />
          ) : minor ? (
            <Text variant="caption" color="textTertiary" testID="discover-adults">
              {tr('Apps act for people over 18.')}
            </Text>
          ) : (
            <Text variant="caption" color="textTertiary">
              {tr(
                'Connect opens the app’s own sign-in, which asks Caime for what it needs: you see who made it and what it wants before you choose, and can end it any time under Connected.',
              )}
            </Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {shown.slug ? (
              <Button
                label={tr('Its page')}
                variant="ghost"
                size="sm"
                onPress={() => openLink(`${WEB_URL}${marketplacePath(shown.slug ?? '')}`)}
                testID="discover-page"
              />
            ) : null}
            {shown.website ? (
              <Button
                label={tr('Website')}
                variant="ghost"
                size="sm"
                onPress={() => openLink(shown.website ?? '')}
              />
            ) : null}
            {shown.supportUrl ? (
              <Button
                label={tr('Help')}
                variant="ghost"
                size="sm"
                onPress={() => openLink(shown.supportUrl ?? '')}
                testID="discover-help"
              />
            ) : null}
            {shown.privacyUrl ? (
              <Button
                label={tr('Privacy policy')}
                variant="ghost"
                size="sm"
                onPress={() => openLink(shown.privacyUrl ?? '')}
                testID="discover-privacy"
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
