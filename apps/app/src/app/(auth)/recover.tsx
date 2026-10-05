import { tr } from '@caime/core/i18n';
import { passwordError } from '@caime/core/rules';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { deviceInfo } from '@/features/auth/device';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { KeyRound } from '@/ui/icons';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

export default function Recover() {
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const pw = passwordError(password);
    if (!identifier.trim() || code.trim().length < 8 || pw) {
      setError(pw ?? tr('Enter your email or handle and one of your recovery codes.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await endpoints.recover({
        identifier: identifier.trim(),
        code: code.trim(),
        newPassword: password,
        client: deviceInfo().client,
      });
      await useSession.getState().signedIn(res);
      toast(tr('Password changed. Every other device was signed out.'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      kicker="recovery"
      title={tr('Use a recovery code')}
      subtitle={tr('You saved ten codes when you created your account. Each one works once.')}
    >
      <View style={{ gap: 14 }}>
        <TextField
          label={tr('Email or handle')}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
        />
        <TextField
          label={tr('Recovery code')}
          icon={KeyRound}
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="xxxx-xxxx-xx"
        />
        <TextField
          label={tr('New password')}
          secret
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          hint={tr('At least 10 characters.')}
          onSubmitEditing={submit}
        />
      </View>
      {error ? (
        <Text variant="bodyStrong" color="danger" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
      <Button label={tr('Set new password')} size="lg" block loading={busy} onPress={submit} />
      <Text variant="caption" color="textTertiary">
        {tr(
          'No codes left? For your safety Caime can’t reset an account without one. If you signed in on another device, you can make new codes there under You → Security.',
        )}
      </Text>
    </AuthLayout>
  );
}
