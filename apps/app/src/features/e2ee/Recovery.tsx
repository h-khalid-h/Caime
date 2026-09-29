/**
 * The recovery key for private conversations (R41): made in Settings on a device that reads them,
 * shown once to write down or keep in a password manager; typed on a new device to read what
 * was sent before it and to be approved without another device. Caime keeps the key nowhere.
 */
import { formatListTime } from '@caime/core/format';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Group } from '@/features/settings/SettingsPage';
import { copyText } from '@/lib/clipboard';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { KeyRound } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { useMyDevices } from './codes';
import { loadPrivate, usePrivate } from './hooks';
import { privateSupported } from './support';

/** Whether the recovery device's keys are on this device (typed here). */
function useRecoveryHere(on: boolean) {
  const load = useCallback((p: typeof import('./private')) => p.hasRecoveryKeysHere(), []);
  return usePrivate(on ? load : null);
}

/** The recovery key in Settings: make one, make a new one, or use it here. */
export function RecoveryKey() {
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const devices = useMyDevices(privateSupported);
  const here = useRecoveryHere(privateSupported);
  const [shown, setShown] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!privateSupported || !devices) return null;
  const me = devices.find((d) => d.current);
  const recovery = devices.find((d) => d.recovery);
  const make = () => {
    setBusy(true);
    void loadPrivate()
      .then((p) => p.makeRecoveryKey())
      .then(setShown)
      .catch((e) => toast((e as Error).message, { tone: 'danger' }))
      .finally(() => setBusy(false));
  };
  return (
    <Group
      title="Recovery key"
      footer={
        recovery
          ? 'If every device of yours is lost, a new one reads your private conversations with this key, and your security code stays the same. Keep it where you keep passwords: Caime can’t show it again, or read anything without it.'
          : 'Without one, losing every device you’re signed in on loses your private conversations for good. The key is shown once: keep it where you keep passwords.'
      }
    >
      <View style={{ padding: 16, gap: 12 }} testID="private-recovery">
        <Text variant="body">
          {recovery
            ? `On, since ${formatListTime(recovery.createdAt, now, timeZone, locale)}.${here ? ' This device has it.' : ''}`
            : 'Off.'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {me?.approved ? (
            <Button
              label={recovery ? 'Make a new key' : 'Make a recovery key'}
              onPress={make}
              loading={busy}
              testID="private-recovery-make"
            />
          ) : null}
          {recovery && (!me?.approved || !here) ? (
            <Button
              label="Use your recovery key"
              variant="secondary"
              onPress={() => setRestoring(true)}
              testID="private-recovery-use"
            />
          ) : null}
        </View>
      </View>
      <ShownKeySheet keyText={shown} onClose={() => setShown(null)} />
      <RestoreSheet open={restoring} onClose={() => setRestoring(false)} />
    </Group>
  );
}

/** The key, shown once, with Copy: closed only by saying it's kept. */
function ShownKeySheet({ keyText, onClose }: { keyText: string | null; onClose: () => void }) {
  const t = useTheme();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!keyText) setCopied(false);
  }, [keyText]);
  return (
    <Sheet open={keyText !== null} onClose={onClose} title="Your recovery key">
      <View style={{ gap: 12, paddingBottom: 8 }}>
        <Text variant="body">
          Write it down, or keep it where you keep passwords. Caime can’t show it again: it keeps
          nothing of it.
        </Text>
        <Card>
          <View style={{ padding: 4, gap: 8, alignItems: 'center' }}>
            <KeyRound size={20} color={t.c.textSecondary} />
            <Text
              variant="title"
              style={{ letterSpacing: 1, textAlign: 'center' }}
              selectable
              testID="private-recovery-key"
            >
              {keyText ?? ''}
            </Text>
          </View>
        </Card>
        <Text variant="caption" color="textSecondary">
          A new device with this key reads everything sent to you privately from now on, and is
          yours without another device to approve it. Anyone with the key and your password could
          too, so keep them apart. A key you made before stops working.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            label={copied ? 'Copied' : 'Copy'}
            variant="secondary"
            onPress={() =>
              void copyText(keyText ?? '').then((ok) => {
                setCopied(ok);
                if (!ok) toast('Caime couldn’t copy it here: write it down.', { tone: 'danger' });
              })
            }
            testID="private-recovery-copy"
          />
          <Button label="I’ve kept it" onPress={onClose} testID="private-recovery-kept" />
        </View>
      </View>
    </Sheet>
  );
}

/** Where the recovery key is typed, from Settings. */
export function RestoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Use your recovery key">
      <View style={{ gap: 12, paddingBottom: 8 }}>
        <Text variant="body">
          Type the key you kept when you made it. This device then reads your private conversations,
          and is yours without another device to approve it.
        </Text>
        {open ? <RestoreForm onDone={onClose} /> : null}
      </View>
    </Sheet>
  );
}

/** The key field and its Restore button, as one piece: in a sheet of its own, or inline. */
function RestoreForm({ onDone }: { onDone: () => void }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const restore = () => {
    setBusy(true);
    setError(null);
    void loadPrivate()
      .then((p) => p.restoreFromRecoveryKey(typed))
      .then(() => {
        toast('Your private conversations open here now.');
        onDone();
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <TextField
        label="Recovery key"
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
        error={error}
        testID="private-recovery-input"
      />
      <Button
        label="Restore"
        onPress={restore}
        loading={busy}
        disabled={!typed.trim()}
        testID="private-recovery-restore"
      />
    </>
  );
}

/**
 * In a private conversation's details: where this device waits to be approved and a recovery key
 * exists, the way in with it (or, approved without the history, the way to it).
 */
export function RestoreFromKey({ on }: { on: boolean }) {
  const devices = useMyDevices(on);
  const here = useRecoveryHere(on);
  const [typing, setTyping] = useState(false);
  const me = devices?.find((d) => d.current);
  const recovery = devices?.find((d) => d.recovery);
  if (!recovery || !me || (me.approved && here)) return null;
  return (
    <Card>
      <View style={{ gap: 8 }} testID="private-restore-offer">
        <Text variant="label">
          {me.approved ? 'Read what was sent before this device' : 'Or use your recovery key'}
        </Text>
        <Text variant="caption" color="textSecondary">
          {me.approved
            ? 'With your recovery key, this device reads what was sent to you privately before it was yours.'
            : 'With your recovery key, this device is yours without another device to approve it, and reads what was sent before.'}
        </Text>
        {typing ? (
          <RestoreForm onDone={() => setTyping(false)} />
        ) : (
          <Button
            label="Use your recovery key"
            size="sm"
            variant="secondary"
            onPress={() => setTyping(true)}
            testID="private-recovery-use"
          />
        )}
      </View>
    </Card>
  );
}
