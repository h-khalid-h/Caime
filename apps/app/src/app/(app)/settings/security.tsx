import type { DeviceSessionView } from '@caime/core/api';
import { formatListTime } from '@caime/core/format';
import { passwordError } from '@caime/core/rules';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { PrivateDevices, RecoveryKey } from '@/features/e2ee/parts';
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
  // New codes are made once the password says it's them, as a stolen session can't.
  const [making, setMaking] = useState(false);
  const [codesPassword, setCodesPassword] = useState('');
  const [codesError, setCodesError] = useState<string | null>(null);
  const [codesBusy, setCodesBusy] = useState(false);
  const makeCodes = async () => {
    if (!codesPassword) return setCodesError('Enter your password.');
    setCodesBusy(true);
    setCodesError(null);
    try {
      const res = await endpoints.newRecoveryCodes(codesPassword);
      setCodes(res.recoveryCodes);
      setMaking(false);
      setCodesPassword('');
    } catch (e) {
      setCodesError((e as Error).message);
    } finally {
      setCodesBusy(false);
    }
  };
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
      toast('Your account is deleted. Thank you for trying Caime.');
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
      <RecoveryKey />
      <EmailStatus />
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
        footer="Caime never asks for your phone number. These codes are how you get back in if you forget your password."
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
              onPress={() => {
                setCodesError(null);
                setMaking(true);
              }}
              testID="codes-new"
            />
          )}
          <Text variant="caption" color="textTertiary">
            Making new codes cancels the old ones.
          </Text>
        </View>
      </Group>
      <Group
        title="Your data"
        footer="The download has what Caime keeps about you, as the app shows it to you: your profile, how you label people, the messages you sent, your actions, files, calls, devices and more. Never other people’s words, reports others made about you, or secrets."
      >
        <ListRow
          icon={FileText}
          title="Download your data"
          subtitle={isWeb ? 'A JSON file, ready at once' : 'Open Caime on the web to download it'}
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
        open={making}
        onClose={() => setMaking(false)}
        title="Make new recovery codes"
        subtitle="The ones you have now stop working."
        footer={
          <Button
            label="Make new codes"
            block
            loading={codesBusy}
            onPress={() => void makeCodes()}
            testID="codes-make"
          />
        }
      >
        <TextField
          label="Your password"
          value={codesPassword}
          onChangeText={(v) => {
            setCodesPassword(v);
            setCodesError(null);
          }}
          secret
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={() => void makeCodes()}
          error={codesError}
          testID="codes-password"
        />
      </Sheet>
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
          deleted account. Delete any you’d rather not leave first{'\n'}• keeps your handle from
          everyone for a year, you included, so a link to you can’t open someone else.
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
          testID="delete-password"
        />
      </Sheet>
    </SettingsPage>
  );
}

/** The address on the account (R48): confirmed, or the six digits from the email to confirm it. */
function EmailStatus() {
  const user = useSession((s) => s.user);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const { user: next } = await endpoints.verifyEmail(code);
      useSession.getState().setUser(next);
      toast('Email confirmed');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    try {
      await endpoints.resendEmailCode();
      toast(`A new code is on its way to ${user.email}`);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  return (
    <Group
      title="Email"
      footer={
        user.emailVerified
          ? undefined
          : 'Confirming it means a forgotten password can be reset by email, and that it\u2019s yours.'
      }
    >
      <View style={{ padding: 16, gap: 12 }}>
        <Text variant="label" testID="email-status">
          {user.email}
          {user.emailVerified ? ' \u00b7 confirmed' : ' \u00b7 not confirmed yet'}
        </Text>
        {user.emailVerified ? null : (
          <>
            <TextField
              label="Code from the email"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              error={error ?? undefined}
              testID="email-code"
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                label="Confirm"
                onPress={confirm}
                loading={busy}
                disabled={code.trim().length < 6}
                testID="email-confirm"
              />
              <Button
                label="Send a new code"
                variant="ghost"
                onPress={() => void resend()}
                testID="email-resend"
              />
            </View>
          </>
        )}
      </View>
    </Group>
  );
}
