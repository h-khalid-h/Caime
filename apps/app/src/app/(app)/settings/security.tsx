import type { DeviceSessionView } from '@caishy/core/api';
import { formatListTime } from '@caishy/core/format';
import { passwordError } from '@caishy/core/rules';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Laptop, Monitor, Smartphone } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

function deviceIcon(s: DeviceSessionView) {
  if (s.kind === 'native') return Smartphone;
  return s.platform?.toLowerCase().includes('mac') || s.platform?.toLowerCase().includes('windows')
    ? Laptop
    : Monitor;
}

export default function Security() {
  const t = useTheme();
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const sessions = useQuery({ queryKey: qk.sessions, queryFn: endpoints.sessions });
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  const changePassword = async () => {
    const err = passwordError(next);
    if (!current || err) {
      setPwError(err ?? 'Enter your current password.');
      return;
    }
    setBusy(true);
    setPwError(null);
    try {
      await endpoints.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast('Password changed. Other devices were signed out.');
      void qc.invalidateQueries({ queryKey: qk.sessions });
    } catch (e) {
      setPwError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPage title="Security">
      <Group
        title="Signed in on"
        footer="Sign out anywhere you don’t recognise. It happens at once."
      >
        {(sessions.data?.sessions ?? []).map((s, i) => (
          <View key={s.id} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t.c.border }}>
            <ListRow
              icon={deviceIcon(s)}
              title={s.deviceName ?? s.platform ?? (s.kind === 'native' ? 'Phone' : 'Browser')}
              subtitle={
                s.current
                  ? 'This device'
                  : `Active ${formatListTime(s.lastSeenAt, now, timeZone, locale)}`
              }
              right={
                s.current ? null : (
                  <Button
                    label="Sign out"
                    size="sm"
                    variant="danger"
                    onPress={async () => {
                      await endpoints
                        .revokeSession(s.id)
                        .catch((e) => toast((e as Error).message, { tone: 'danger' }));
                      void qc.invalidateQueries({ queryKey: qk.sessions });
                    }}
                  />
                )
              }
            />
          </View>
        ))}
      </Group>
      <Group title="Password">
        <View style={{ padding: 16, gap: 12 }}>
          <TextField
            label="Current password"
            secret
            value={current}
            onChangeText={setCurrent}
            autoComplete="current-password"
          />
          <TextField
            label="New password"
            secret
            value={next}
            onChangeText={setNext}
            autoComplete="new-password"
            hint="At least 10 characters."
            error={pwError}
          />
          <Button label="Change password" onPress={changePassword} loading={busy} />
        </View>
      </Group>
      <Group
        title="Recovery codes"
        footer="Caishy never asks for your phone number. These codes are how you get back in if you forget your password."
      >
        <View style={{ padding: 16, gap: 12 }}>
          {codes ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {codes.map((c) => (
                  <View
                    key={c}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: t.c.surfaceMuted,
                    }}
                  >
                    <Text variant="bodyStrong" selectable style={{ fontVariant: ['tabular-nums'] }}>
                      {c}
                    </Text>
                  </View>
                ))}
              </View>
              <Button
                label="Copy all"
                variant="secondary"
                onPress={async () => {
                  await Clipboard.setStringAsync(codes.join('\n'));
                  toast('Copied. Keep them somewhere safe.');
                }}
              />
            </>
          ) : (
            <Button
              label="Make new codes"
              variant="secondary"
              onPress={async () => {
                try {
                  const res = await endpoints.newRecoveryCodes();
                  setCodes(res.recoveryCodes);
                } catch (e) {
                  toast((e as Error).message, { tone: 'danger' });
                }
              }}
            />
          )}
          <Text variant="caption" color="textTertiary">
            Making new codes cancels the old ones.
          </Text>
        </View>
      </Group>
    </SettingsPage>
  );
}
