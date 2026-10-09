/**
 * Connected (R74): everything that acts for someone or reads their data, each a row of the
 * same kind: an app they let in through OAuth (what it may do, when it last did, and the one
 * tap that ends it: its tokens stop at once), and Caime's own built-ins that are on (the
 * calendar address, managed in its sheet).
 */
import { PERSONAL_SCOPE_LABELS, type PersonalScope } from '@caime/core/access';
import type { ConnectedAppView } from '@caime/core/api';
import { formatWhen } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { CalendarFeed } from '@/features/settings/CalendarFeed';
import { Group } from '@/features/settings/SettingsPage';
import { useNow, useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { Divider } from '@/ui/Card';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';
import { AppIcon } from './AppIcon';

function AppRow({ app }: { app: ConnectedAppView }) {
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const when = (iso: string) => formatWhen(iso, now, timeZone, locale);
  const remove = async () => {
    if (!app.grantId) return;
    setAsking(false);
    setBusy(true);
    try {
      await endpoints.removeConnectedApp(app.grantId);
      void qc.invalidateQueries({ queryKey: qk.connectedApps });
      void qc.invalidateQueries({ queryKey: qk.allDirectory });
      toast(tr('{name} can’t act for you any more', { name: app.name }));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
      setBusy(false);
    }
  };
  return (
    <View style={{ padding: 16, gap: 8 }} testID={`connected-${app.name}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AppIcon url={app.iconUrl} appId={app.appId} name={app.name} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" numberOfLines={1}>
            {app.name}
          </Text>
          <Text variant="caption" color="textSecondary">
            {tr('Made by {owner}', { owner: app.owner })}
          </Text>
          <Text variant="caption" color="textSecondary">
            {tr('Let in {when} · {text}', {
              when: when(app.createdAt),
              text: app.lastUsedAt
                ? tr('last used {when}', { when: when(app.lastUsedAt) })
                : tr('not used yet'),
            })}
          </Text>
        </View>
        <Button
          label={tr('Remove')}
          size="sm"
          variant="secondary"
          loading={busy}
          onPress={() => setAsking(true)}
          testID={`connected-remove-${app.name}`}
        />
      </View>
      <Sheet
        open={asking}
        onClose={() => setAsking(false)}
        title={tr('Remove {name}?', { name: app.name })}
        subtitle={tr(
          'It stops acting for you at once. To use it again, you’d let it in again from the app itself.',
        )}
        footer={
          <Button
            label={tr('Remove')}
            variant="danger"
            block
            size="lg"
            onPress={() => void remove()}
            testID="connected-remove-confirm"
          />
        }
      >
        <Text variant="body" color="textSecondary">
          {tr('What it already did stays as it is, marked as sent through it.')}
        </Text>
      </Sheet>
      <Text variant="caption" color="textTertiary">
        {app.scopes
          .map((s) => {
            const l = PERSONAL_SCOPE_LABELS[s as PersonalScope];
            return l ? tr(l) : s;
          })
          .join(' · ')}
      </Text>
    </View>
  );
}

/** A built-in that's on: the calendar address, managed in the sheet its row opens. */
function BuiltinRow({ app, onPress }: { app: ConnectedAppView; onPress: () => void }) {
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  return (
    <ListRow
      left={<AppIcon url={app.iconUrl} appId={app.appId} name={app.name} />}
      title={app.name}
      subtitle={tr('On since {formatWhen} · {text}', {
        formatWhen: formatWhen(app.createdAt, now, timeZone, locale),
        text: app.lastUsedAt
          ? tr('last read {when}', { when: formatWhen(app.lastUsedAt, now, timeZone, locale) })
          : tr('not read yet'),
      })}
      chevron
      onPress={onPress}
      testID={`connected-${app.name}`}
    />
  );
}

/** What a built-in manages in its sheet. A new built-in adds its case. */
function BuiltinSheet({ appId }: { appId: string }) {
  return (
    <View style={{ marginHorizontal: -16 }}>{appId === 'calendar' ? <CalendarFeed /> : null}</View>
  );
}

export function Connected({ onDiscover }: { onDiscover: () => void }) {
  const minor = useSession((s) => s.user?.minor ?? false);
  const q = useQuery({
    queryKey: qk.connectedApps,
    queryFn: endpoints.connectedApps,
    enabled: !minor,
  });
  const apps = q.data?.apps ?? [];
  // The sheet outlives its row (turned off, the built-in leaves the list while the sheet fades).
  const [open, setOpen] = useState<ConnectedAppView | null>(null);
  const last = useRef(open);
  if (open) last.current = open;
  const shown = open ?? last.current;
  return (
    <Group
      footer={tr(
        'An app you let in reaches only what you allowed, never your password, privacy or account, and what it sends says it came through it. Remove one and it stops at once.',
      )}
    >
      {minor ? (
        <Text variant="body" color="textSecondary" style={{ padding: 16 }}>
          {tr('Apps act for people over 18.')}
        </Text>
      ) : q.isPending ? (
        <SkeletonRows />
      ) : apps.length === 0 ? (
        <View style={{ padding: 16, gap: 12, alignItems: 'flex-start' }}>
          <Text variant="body" color="textSecondary" testID="connected-none">
            {tr(
              'Nothing is connected yet. Discover your calendar and the apps that work with Caime; when one asks to act for you, you see who made it and what it wants before you choose.',
            )}
          </Text>
          <Button
            label={tr('Discover apps')}
            size="sm"
            variant="secondary"
            onPress={onDiscover}
            testID="connected-discover"
          />
        </View>
      ) : (
        apps.map((a, i) => (
          <View key={a.grantId ?? a.appId}>
            {i > 0 ? <Divider /> : null}
            {a.kind === 'builtin' ? (
              <BuiltinRow app={a} onPress={() => setOpen(a)} />
            ) : (
              <AppRow app={a} />
            )}
          </View>
        ))
      )}
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={shown?.name}>
        {shown ? <BuiltinSheet appId={shown.appId} /> : null}
      </Sheet>
    </Group>
  );
}
