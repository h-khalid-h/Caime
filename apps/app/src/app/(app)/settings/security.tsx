import type { DeviceSessionView } from '@caishy/core/api';
import { formatListTime } from '@caishy/core/format';
import { passwordError } from '@caishy/core/rules';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { PrivateDevices } from '@/features/e2ee/parts';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { copyText } from '@/lib/clipboard';
import { API_URL, isWeb } from '@/lib/config';
import { useNow, useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { FileText, Laptop, Monitor, Smartphone, Trash } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
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
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const deleteAccount = async () => {
    if (!confirm) {
      setDeleteError('Enter your password.');
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await endpoints.deleteAccount(confirm);
      setDeleting(false);
      await useSession.getState().signOut({ remote: false });
      toast('Your account is deleted. Thank you for trying Caishy.');
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  };

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
      <PrivateDevices />
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
                  await copyText(codes.join('\n'));
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
      <Group
        title="Your data"
        footer="The download has what Caishy keeps about you, as the app shows it to you: your profile, how you label people, the messages you sent, your actions, files, calls, devices and more. Never other people’s words, reports others made about you, or secrets."
      >
        <ListRow
          icon={FileText}
          title="Download your data"
          subtitle={isWeb ? 'A JSON file, ready at once' : 'Open Caishy on the web to download it'}
          onPress={
            isWeb
              ? () => {
                  window.location.href = `${API_URL}/v1/me/export`;
                }
              : undefined
          }
        />
        <View style={{ borderTopWidth: 1, borderTopColor: t.c.border }}>
          <ListRow
            icon={Trash}
            title="Delete your account"
            destructive
            onPress={() => setDeleting(true)}
            testID="delete-account"
          />
        </View>
      </Group>
      <Sheet
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete your account?"
        footer={
          <Button
            label="Delete my account"
            variant="danger"
            block
            size="lg"
            loading={deleteBusy}
            onPress={deleteAccount}
            testID="delete-confirm"
          />
        }
      >
        <Text variant="body">This can’t be undone. Deleting your account:</Text>
        <Text variant="body" color="textSecondary">
          • removes your profile, how you label people, your rules, suggestions, actions and
          devices, and the files only you can see{'\n'}• ends your connections, and Pro if you have
          it{'\n'}• leaves the messages you sent in other people’s conversations, shown as from a
          deleted account. Delete any you’d rather not leave first.
        </Text>
        <Text variant="body" color="textSecondary">
          An organization’s Business plan goes on for its team. If you pay for one, cancel it first.
        </Text>
        <TextField
          label="Your password"
          secret
          value={confirm}
          onChangeText={setConfirm}
          error={deleteError}
          autoComplete="current-password"
        />
      </Sheet>
    </SettingsPage>
  );
}
