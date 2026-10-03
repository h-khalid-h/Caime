import { formatListTime } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { View } from 'react-native';
import { Group } from '@/features/settings/SettingsPage';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { KeyRound, Lock } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { toast } from '@/ui/Toast';
import { useMyDevices } from './codes';
import { loadPrivate } from './hooks';
import { privateSupported } from './support';

/**
 * The devices that read my private conversations (R18), in Settings: which is this one, which
 * wait for me to say they're mine, and any Caime lists that none of mine approved. Removing one
 * signs it out.
 */
export function PrivateDevices() {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const devices = useMyDevices(privateSupported);
  if (!privateSupported || !devices?.length) return null;
  const act = (f: (p: typeof import('./private')) => Promise<void>, done: string) =>
    void loadPrivate()
      .then(f)
      .then(() => toast(done))
      .catch((e) => toast((e as Error).message, { tone: 'danger' }));
  return (
    <Group
      title={tr('Reading private conversations')}
      footer={tr(
        'A device you sign in on waits until you approve it from one of these. Removing one signs it out.',
      )}
    >
      {devices.map((d, i) => (
        <View
          key={d.id}
          style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.c.border }}
          testID="private-device"
        >
          <ListRow
            icon={d.recovery ? KeyRound : Lock}
            title={d.recovery ? tr('Your recovery key') : (d.name ?? tr('A device'))}
            subtitle={
              d.recovery
                ? tr('Made {formatListTime} · every private message is sealed for it too', {
                    formatListTime: formatListTime(d.createdAt, now, timeZone, locale),
                  })
                : d.current
                  ? d.approved
                    ? tr('This device')
                    : tr('This device · waiting for you to approve it on another')
                  : !d.approved
                    ? tr('Waiting for you to approve it')
                    : d.unconfirmed
                      ? tr('None of your devices approved it: nothing is sealed for it')
                      : tr('Added {formatListTime}', {
                          formatListTime: formatListTime(d.createdAt, now, timeZone, locale),
                        })
            }
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {!d.approved && !d.current ? (
                  <Button
                    label={tr('Approve')}
                    size="sm"
                    onPress={() => act((p) => p.approveDevice(d.id), 'Approved.')}
                    testID="private-device-approve"
                  />
                ) : null}
                {d.current ? null : (
                  <Button
                    label={d.recovery ? tr('Turn off') : tr('Remove')}
                    size="sm"
                    variant="danger"
                    onPress={() =>
                      act(
                        (p) => p.removeDevice(d.id),
                        d.recovery
                          ? 'Your recovery key no longer works.'
                          : 'Removed, and signed out.',
                      )
                    }
                    testID={d.recovery ? 'private-recovery-off' : 'private-device-remove'}
                  />
                )}
              </View>
            }
          />
        </View>
      ))}
    </Group>
  );
}
