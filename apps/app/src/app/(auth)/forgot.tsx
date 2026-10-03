import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Button } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

/** A forgotten password (R48): a link to the address. The answer is the same for any address. */
export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!email.trim()) {
      setError('Enter the email you signed up with.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await endpoints.requestReset(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout
      kicker="password"
      title={tr('Forgot your password?')}
      subtitle={tr('Caime sends a link to your email. Open it within the hour to set a new one.')}
      back
    >
      {sent ? (
        <View style={{ gap: 12 }} testID="forgot-sent">
          <Text variant="bodyStrong">
            {tr('If that address is an account\\u2019s, a link is on its way.')}
          </Text>
          <Text variant="body" color="textSecondary">
            {tr(
              'Nothing came? Check the address and your spam folder, or use one of your recovery codes instead.',
            )}
          </Text>
          <Button
            label={tr('Use a recovery code')}
            variant="secondary"
            onPress={() => router.push('/recover')}
          />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <TextField
            label={tr('Email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            onSubmitEditing={submit}
            testID="forgot-email"
          />
          {error ? (
            <Text variant="bodyStrong" color="danger" accessibilityLiveRegion="assertive">
              {error}
            </Text>
          ) : null}
          <Button
            label={tr('Send the link')}
            size="lg"
            block
            loading={busy}
            onPress={submit}
            testID="forgot-send"
          />
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/recover')}
            style={{ padding: 8, alignSelf: 'center' }}
          >
            <Text variant="bodyStrong" color="link">
              {tr('Use a recovery code instead')}
            </Text>
          </Pressable>
        </View>
      )}
    </AuthLayout>
  );
}
