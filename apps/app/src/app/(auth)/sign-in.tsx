import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { deviceInfo } from '@/features/auth/device';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

export default function SignIn() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (!identifier.trim() || !password) {
      setError('Enter your email or handle, and your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { client, deviceName } = deviceInfo();
      const res = await endpoints.login({
        identifier: identifier.trim(),
        password,
        client,
        deviceName,
      });
      await useSession.getState().signedIn(res);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'rate_limited'
          ? 'Too many tries. Wait a few minutes and try again.'
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      kicker={tr('sign in')}
      title={tr('Welcome back')}
      subtitle={tr('Sign in with your email or @handle.')}
    >
      <View style={{ gap: 14 }}>
        <TextField
          label={tr('Email or handle')}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          keyboardType="email-address"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          testID="signin-identifier"
        />
        <TextField
          ref={passwordRef}
          label={tr('Password')}
          secret
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
          testID="signin-password"
        />
      </View>
      {error ? (
        <Text
          variant="bodyStrong"
          color="danger"
          accessibilityLiveRegion="assertive"
          testID="signin-error"
        >
          {error}
        </Text>
      ) : null}
      <Button
        label={tr('Sign in')}
        size="lg"
        block
        loading={busy}
        onPress={submit}
        testID="signin-submit"
      />
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/forgot')}
          style={{ padding: 8 }}
          testID="signin-forgot"
        >
          <Text variant="bodyStrong" color="link">
            {tr('Forgot your password?')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.replace('/sign-up')}
          style={{ padding: 8 }}
        >
          <Text variant="body" color="textSecondary">
            {tr('New here?')}{' '}
            <Text variant="bodyStrong" color="link">
              {tr('Create an account')}
            </Text>
          </Text>
        </Pressable>
      </View>
    </AuthLayout>
  );
}
