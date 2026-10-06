import type { MeView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import Check from 'lucide-react-native/icons/check';
import KeyRound from 'lucide-react-native/icons/key-round';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { copyText } from '@/lib/clipboard';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/**
 * The recovery codes to keep (R56): the fresh ones this device holds, or new ones made with the
 * password when those are gone. Done tells the account they're saved, so no device asks again.
 */
export function RecoveryCodesSheet({
  open,
  onClose,
  fresh,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  fresh: string[] | null;
  onDone: (user: MeView) => void;
}) {
  const t = useTheme();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = codes ?? fresh;

  const make = async () => {
    if (!password) return setError(tr('Enter your password.'));
    setBusy(true);
    setError(null);
    try {
      const res = await endpoints.newRecoveryCodes(password);
      setCodes(res.recoveryCodes);
      setPassword('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const done = async () => {
    setBusy(true);
    try {
      const res = await endpoints.updateMe({ recoveryCodesSeen: true });
      onDone(res.user);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('Recovery codes')}
      subtitle={
        shown
          ? tr('Each works once. Paste them into your password manager or notes.')
          : tr('The ones made at sign-up are gone from this device: make new ones.')
      }
      footer={
        shown ? (
          <Button
            label={tr('Done')}
            block
            size="lg"
            disabled={!saved}
            loading={busy}
            onPress={() => void done()}
            testID="codes-done"
          />
        ) : (
          <Button
            label={tr('Make the codes')}
            block
            size="lg"
            loading={busy}
            onPress={() => void make()}
            testID="codes-make"
          />
        )
      }
    >
      {shown ? (
        <View style={{ gap: 14 }}>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}
            accessibilityLabel={tr('Recovery codes: {join}', { join: shown.join(', ') })}
          >
            {shown.map((c) => (
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
            label={tr('Copy the codes')}
            icon={KeyRound}
            variant="secondary"
            block
            onPress={async () => {
              await copyText(shown.join('\n'));
              toast(tr('Copied. Paste them into your password manager or notes.'));
              setSaved(true);
            }}
            testID="codes-copy"
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: saved }}
            onPress={() => setSaved((s) => !s)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            testID="codes-saved"
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                borderWidth: 2,
                borderColor: saved ? t.c.primary : t.c.borderStrong,
                backgroundColor: saved ? t.c.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {saved ? <Check size={15} color={t.c.onPrimary} strokeWidth={3} /> : null}
            </View>
            <Text variant="bodyStrong">{tr('I’ve saved them somewhere safe')}</Text>
          </Pressable>
        </View>
      ) : (
        <TextField
          label={tr('Your password')}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setError(null);
          }}
          secret
          autoComplete="current-password"
          error={error}
          testID="codes-password"
        />
      )}
    </Sheet>
  );
}
