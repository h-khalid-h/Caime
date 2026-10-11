/**
 * One app from Discover (R74): what it says of itself, who published it, how many connected
 * it, and the one way in. A developer's app connects through its own sign-in (`connectUrl`),
 * which asks Caime for what it needs; a built-in of Caime's connects right here (the calendar
 * address), and so does a bridge (R79: a token for the platform). The sheet keeps its last app
 * while it fades.
 */
import type { DirectoryAppView } from '@caime/core/api';
import { tr, trn } from '@caime/core/i18n';
import Workflow from 'lucide-react-native/icons/workflow';
import { useRef } from 'react';
import { View } from 'react-native';
import { CalendarFeed } from '@/features/settings/CalendarFeed';
import { openLink } from '@/lib/links';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { AppIcon } from './AppIcon';
import { BridgeSheet } from './BridgeSheet';
import { PublisherLine } from './PublisherLine';

export function AppSheet({ app, onClose }: { app: DirectoryAppView | null; onClose: () => void }) {
  // Under 18, nothing connects (R29): the server sends no address, and the sheet says why.
  const minor = useSession((s) => s.user?.minor ?? false);
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
