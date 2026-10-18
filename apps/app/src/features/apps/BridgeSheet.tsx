/**
 * A bridge (R79): Zapier, Make, n8n, Pipedream or IFTTT, each the door to the apps on it. It
 * connects here, never on the platform's page: what the platform can do with Caime, what the
 * person lets it do (reading by default, writing when ticked), one tap for a token named after
 * the platform, shown this once with where to paste it. On, the sheet says since when and when
 * it was last used, and stops it; a new token ends the old one. Opened from Discover's sheet and
 * from the Connected row alike, so it reads what's connected itself.
 */
import { PERSONAL_SCOPE_LABELS, PERSONAL_SCOPES, type PersonalScope } from '@caime/core/access';
import { BRIDGE_DEFAULT_SCOPES, BRIDGE_USES, bridgeOf } from '@caime/core/bridges';
import { formatWhen } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { openLink } from '@/lib/links';
import { useNow, useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { CopyRow } from '@/ui/CopyRow';
import { ListRow } from '@/ui/ListRow';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const toggled = <T,>(list: T[], item: T) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

export function BridgeSheet({ appId }: { appId: string }) {
  const bridge = bridgeOf(appId);
  const qc = useQueryClient();
  const minor = useSession((s) => s.user?.minor ?? false);
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const connected = useQuery({
    queryKey: qk.connectedApps,
    queryFn: endpoints.connectedApps,
    enabled: !minor,
  });
  const on = connected.data?.apps.find((a) => a.kind === 'bridge' && a.appId === appId) ?? null;
  const [scopes, setScopes] = useState<PersonalScope[]>([...BRIDGE_DEFAULT_SCOPES]);
  const [made, setMade] = useState<string | null>(null);
  const [busy, setBusy] = useState<'connect' | 'stop' | null>(null);
  const [confirming, setConfirming] = useState<'replace' | 'stop' | null>(null);
  if (!bridge) return null;
  const name = bridge.name;
  const changed = () => {
    void qc.invalidateQueries({ queryKey: qk.connectedApps });
    void qc.invalidateQueries({ queryKey: qk.allDirectory });
  };

  const connect = async () => {
    setBusy('connect');
    try {
      const { token } = await endpoints.connectBridge(appId, { scopes });
      setMade(token);
      setConfirming(null);
      changed();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  const stop = async () => {
    setBusy('stop');
    try {
      await endpoints.disconnectBridge(appId);
      setMade(null);
      setConfirming(null);
      changed();
      toast(tr('{name} can’t act for you any more', { name }));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  if (minor)
    return (
      <Text variant="caption" color="textTertiary" testID="discover-adults">
        {tr('Apps act for people over 18.')}
      </Text>
    );
  if (connected.isPending) return <SkeletonRows count={2} />;
  const labels = (list: readonly string[]) =>
    list
      .map((s) => {
        const l = PERSONAL_SCOPE_LABELS[s as PersonalScope];
        return l ? tr(l) : s;
      })
      .join(' · ');
  return (
    <View style={{ gap: 12 }} testID="bridge-sheet">
      <View style={{ gap: 4 }}>
        <Text variant="captionStrong" color="textSecondary">
          {tr('What {name} can do with Caime', { name })}
        </Text>
        <Text variant="body" color="textSecondary">
          {tr(BRIDGE_USES.triggers)}
        </Text>
        <Text variant="body" color="textSecondary">
          {tr(BRIDGE_USES.actions)}
        </Text>
      </View>
      {made ? (
        <View style={{ gap: 8 }}>
          <CopyRow label={tr('Token for {name}', { name })} value={made} testID="bridge-token" />
          <Text variant="caption" color="textTertiary">
            {tr('Shown this once: paste it on {name} now. {how}', { name, how: tr(bridge.how) })}
          </Text>
          <Button
            label={tr('Open {name}', { name })}
            variant="secondary"
            size="sm"
            onPress={() => openLink(bridge.page)}
            testID="bridge-open"
          />
        </View>
      ) : on ? (
        <View style={{ gap: 4 }}>
          <Text variant="caption" color="textSecondary" testID="bridge-on">
            {tr('On since {when} · {text}', {
              when: formatWhen(on.createdAt, now, timeZone, locale),
              text: on.lastUsedAt
                ? tr('last used {when}', { when: formatWhen(on.lastUsedAt, now, timeZone, locale) })
                : tr('not used yet'),
            })}
          </Text>
          <Text variant="caption" color="textTertiary" testID="bridge-scopes">
            {labels(on.scopes)}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <Text variant="captionStrong" color="textSecondary">
            {tr('What it may do')}
          </Text>
          <Text variant="caption" color="textTertiary">
            {tr('Reading by default. Tick what your recipe does.')}
          </Text>
          <View style={{ marginHorizontal: -20 }}>
            {PERSONAL_SCOPES.map((s) => (
              <ListRow
                key={s}
                title={tr(PERSONAL_SCOPE_LABELS[s])}
                checked={scopes.includes(s)}
                onPress={() => setScopes((x) => toggled(x, s))}
                testID={`bridge-scope-${s}`}
              />
            ))}
          </View>
        </View>
      )}
      {confirming ? (
        <View style={{ gap: 8 }}>
          <Text variant="caption" color="textSecondary">
            {confirming === 'replace'
              ? tr('The token {name} has stops working, and you paste the new one there.', { name })
              : tr('Every recipe on {name} that uses the token stops.', { name })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              label={confirming === 'replace' ? tr('Get a new token') : tr('Stop it')}
              variant={confirming === 'stop' ? 'danger' : 'primary'}
              size="sm"
              loading={busy !== null}
              onPress={() => void (confirming === 'replace' ? connect() : stop())}
              testID="bridge-confirm"
              style={{ flex: 1 }}
            />
            <Button
              label={tr('Keep it')}
              variant="secondary"
              size="sm"
              onPress={() => setConfirming(null)}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : made ? null : on ? (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Button
            label={tr('Get a new token')}
            variant="secondary"
            size="sm"
            onPress={() => {
              setScopes([...on.scopes] as PersonalScope[]);
              setConfirming('replace');
            }}
            testID="bridge-replace"
          />
          <Button
            label={tr('Stop')}
            variant="ghost"
            size="sm"
            onPress={() => setConfirming('stop')}
            testID="bridge-stop"
          />
        </View>
      ) : (
        <Button
          label={tr('Connect {name}', { name })}
          size="sm"
          loading={busy === 'connect'}
          disabled={scopes.length === 0}
          onPress={() => void connect()}
          testID="bridge-connect"
        />
      )}
    </View>
  );
}
