/**
 * Passkeys in Settings · Security (R36): the account's passkeys, each with where it was made and
 * when it was last used, one added after the password, one removed after asking. Adding and
 * signing in happen in a browser for now (the WebAuthn code loads only when used).
 */
import type { PasskeyView } from '@caime/core/api';
import { formatWhen } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import KeyRound from 'lucide-react-native/icons/key-round';
import Plus from 'lucide-react-native/icons/plus';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Group } from '@/features/settings/SettingsPage';
import { isWeb } from '@/lib/config';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

export function Passkeys() {
  const t = useTheme();
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const list = useQuery({ queryKey: qk.passkeys, queryFn: endpoints.passkeys });
  const [adding, setAdding] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<PasskeyView | null>(null);
  // What the sheet names while it fades out after the passkey is gone.
  const [shown, setShown] = useState<PasskeyView | null>(null);

  const add = async () => {
    if (!password) return setError(tr('Enter your password.'));
    setBusy(true);
    setError(null);
    const { addPasskey, passkeyProblem } = await import('@/features/auth/passkeys');
    try {
      await addPasskey(password);
      setAdding(false);
      setPassword('');
      toast(tr('Passkey added. Next time, sign in with it.'));
      void qc.invalidateQueries({ queryKey: qk.passkeys });
    } catch (err) {
      setError(passkeyProblem(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: PasskeyView) => {
    setBusy(true);
    try {
      await endpoints.removePasskey(p.id);
      setRemoving(null);
      toast(tr('Passkey removed'));
      void qc.invalidateQueries({ queryKey: qk.passkeys });
    } catch (err) {
      toast((err as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const line = (p: PasskeyView) =>
    p.lastUsedAt
      ? tr('Added {added}, last used {used}', {
          added: formatWhen(p.createdAt, now, timeZone, locale),
          used: formatWhen(p.lastUsedAt, now, timeZone, locale),
        })
      : tr('Added {added}, not used yet', {
          added: formatWhen(p.createdAt, now, timeZone, locale),
        });

  return (
    <Group
      title={tr('Passkeys')}
      footer={tr(
        'A passkey signs you in with your face, your fingerprint or your device’s screen lock, with nothing to type. It stays on your devices; Caime keeps only its public half.',
      )}
    >
      {(list.data?.passkeys ?? []).map((p, i) => (
        <View
          key={p.id}
          style={i > 0 ? { borderTopWidth: 1, borderTopColor: t.c.border } : undefined}
        >
          <ListRow
            icon={KeyRound}
            title={p.name ?? tr('Passkey')}
            subtitle={line(p)}
            onPress={() => {
              setShown(p);
              setRemoving(p);
            }}
            testID={`passkey-${i}`}
          />
        </View>
      ))}
      <View
        style={
          list.data?.passkeys.length ? { borderTopWidth: 1, borderTopColor: t.c.border } : undefined
        }
      >
        <ListRow
          icon={Plus}
          title={tr('Add a passkey')}
          subtitle={isWeb ? null : tr('Open Caime on the web to add one')}
          onPress={
            isWeb
              ? () => {
                  setError(null);
                  setAdding(true);
                }
              : undefined
          }
          testID="passkey-add"
        />
      </View>
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title={tr('Add a passkey')}
        subtitle={tr('Your password first; then your browser asks where to keep the passkey.')}
        footer={
          <Button
            label={tr('Continue')}
            block
            loading={busy}
            onPress={() => void add()}
            testID="passkey-continue"
          />
        }
      >
        <TextField
          label={tr('Your password')}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setError(null);
          }}
          secret
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={() => void add()}
          error={error}
          testID="passkey-password"
        />
      </Sheet>
      <Sheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={tr('Remove this passkey?')}
        subtitle={
          shown
            ? tr('{name} stops signing you in. Your password and other passkeys still do.', {
                name: shown.name ?? tr('Passkey'),
              })
            : undefined
        }
        footer={
          <Button
            label={tr('Remove')}
            variant="danger"
            block
            loading={busy}
            onPress={() => (removing ? void remove(removing) : undefined)}
            testID="passkey-remove"
          />
        }
      >
        <View />
      </Sheet>
    </Group>
  );
}
