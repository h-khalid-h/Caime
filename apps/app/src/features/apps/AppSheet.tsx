/**
 * One app from Discover (R74): what it says of itself, who published it, how many connected
 * it, and the one way in. A developer's app connects through its own sign-in (`connectUrl`),
 * which asks Caime for what it needs; a built-in of Caime's connects right here (the calendar
 * address). The sheet keeps its last app while it fades.
 */
import type { DirectoryAppView } from '@caime/core/api';
import { tr, trn } from '@caime/core/i18n';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import { useRef } from 'react';
import { View } from 'react-native';
import { CalendarFeed } from '@/features/settings/CalendarFeed';
import { openLink } from '@/lib/links';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { AppIcon } from './AppIcon';

export function AppSheet({ app, onClose }: { app: DirectoryAppView | null; onClose: () => void }) {
  const t = useTheme();
  const last = useRef(app);
  if (app) last.current = app;
  const shown = app ?? last.current;
  const builtin = shown?.kind === 'builtin';
  return (
    <Sheet
      open={app !== null}
      onClose={onClose}
      title={shown?.name}
      subtitle={shown?.tagline ?? undefined}
      footer={
        shown && !builtin && shown.connectUrl ? (
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
            <AppIcon url={shown.iconUrl} appId={shown.id} name={shown.name} size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {tr('By {name}', { name: shown.publisher.name })}
                </Text>
                {shown.publisher.verified ? (
                  <View
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={tr('Verified')}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                  >
                    <BadgeCheck size={14} color={t.c.accentStrong} />
                    <Text variant="caption" color="accentStrong">
                      {tr('Verified')}
                    </Text>
                  </View>
                ) : null}
              </View>
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
          {builtin ? (
            <View style={{ marginHorizontal: -16 }}>
              <CalendarFeed />
            </View>
          ) : (
            <Text variant="caption" color="textTertiary">
              {tr(
                'Connect opens the app’s own sign-in, which asks Caime for what it needs: you see who made it and what it wants before you choose, and can end it any time under Connected.',
              )}
            </Text>
          )}
          {shown.website ? (
            <Button
              label={tr('Website')}
              variant="ghost"
              size="sm"
              onPress={() => openLink(shown.website ?? '')}
              style={{ alignSelf: 'flex-start' }}
            />
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}
