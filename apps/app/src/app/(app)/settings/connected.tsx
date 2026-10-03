import { PERSONAL_SCOPE_LABELS, type PersonalScope } from '@caime/core/access';
import type { ConnectedAppView } from '@caime/core/api';
import { formatWhen } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { CalendarFeed } from '@/features/settings/CalendarFeed';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { useNow, useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { Divider } from '@/ui/Card';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

function AppRow({ app }: { app: ConnectedAppView }) {
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const when = (iso: string) => formatWhen(iso, now, timeZone, locale);
  const remove = async () => {
    setAsking(false);
    setBusy(true);
    try {
      await endpoints.removeConnectedApp(app.grantId);
      void qc.invalidateQueries({ queryKey: qk.connectedApps });
      toast(tr('{name} can’t act for you any more', { name: app.name }));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
      setBusy(false);
    }
  };
  return (
    <View style={{ padding: 16, gap: 8 }} testID={`connected-${app.name}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
              text: app.lastUsedAt ? `last used ${when(app.lastUsedAt)}` : tr('not used yet'),
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
        {app.scopes.map((s) => PERSONAL_SCOPE_LABELS[s as PersonalScope] ?? s).join(' · ')}
      </Text>
    </View>
  );
}

/**
 * Connected apps (PRD §72, §74): the calendar that reads what's due, every app someone let act
 * for them, what it may do and when it last did, and the one tap that ends it: its tokens stop
 * at once.
 */
export default function ConnectedApps() {
  const minor = useSession((s) => s.user?.minor ?? false);
  const q = useQuery({
    queryKey: qk.connectedApps,
    queryFn: endpoints.connectedApps,
    enabled: !minor,
  });
  const apps = q.data?.apps ?? [];
  return (
    <SettingsPage title={tr('Connected apps')}>
      <Group
        title={tr('Your calendar')}
        footer={tr(
          'Anyone with the address sees what’s in it: your actions’ titles and dates, and your meetings. Get a new address and the old one stops at once.',
        )}
      >
        <CalendarFeed />
      </Group>
      <Group
        title={tr('Apps that act for you')}
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
          <Text
            variant="body"
            color="textSecondary"
            style={{ padding: 16 }}
            testID="connected-none"
          >
            {tr(
              'No apps act for you. When one asks, you’ll see who made it and what it wants before you choose.',
            )}
          </Text>
        ) : (
          apps.map((a, i) => (
            <View key={a.grantId}>
              {i > 0 ? <Divider /> : null}
              <AppRow app={a} />
            </View>
          ))
        )}
      </Group>
    </SettingsPage>
  );
}
