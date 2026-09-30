import { passwordError } from '@caime/core/rules';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { deviceInfo } from '@/features/auth/device';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/** The link from the email (R48): a new password, signed in here, signed out everywhere else. */
export default function Reset() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const pw = passwordError(password);
    if (pw) {
      setError(pw);
      return;
    }
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await endpoints.confirmReset({
        token,
        newPassword: password,
        client: deviceInfo().client,
      });
      await useSession.getState().signedIn(res);
      toast('Password changed. Every other device was signed out.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!token)
    return (
      <AuthLayout
        title="This link isn\u2019t whole"
        subtitle="Open the one in the email, or ask for a new one."
      >
        <Button label="Ask for a new link" onPress={() => router.replace('/forgot')} />
      </AuthLayout>
    );
  return (
    <AuthLayout
      kicker="new password"
      title="Set a new password"
      subtitle="You\u2019ll be signed in here, and out everywhere else."
    >
      <View style={{ gap: 14 }}>
        <TextField
          label="New password"
          secret
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          hint="At least 10 characters."
          onSubmitEditing={submit}
          autoFocus
          testID="reset-password"
        />
        {error ? (
          <Text variant="bodyStrong" color="danger" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
        <Button
          label="Set new password"
          size="lg"
          block
          loading={busy}
          onPress={submit}
          testID="reset-submit"
        />
      </View>
    </AuthLayout>
  );
}
