import type { SuspendedDetails } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { deviceInfo } from '@/features/auth/device';
import { isWeb } from '@/lib/config';
import { useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { lazyPart } from '@/ui/Lazy';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

// A suspended account's reason, appeal and data (M16 B6): loaded only when a sign-in says so.
const Suspended = lazyPart(() => import('@/features/auth/Suspended').then((m) => m.Suspended));

/** The refusal's reason and claim, when a sign-in was refused as suspended. */
function suspendedOf(err: unknown): SuspendedDetails | null {
  if (!(err instanceof ApiError) || err.code !== 'suspended') return null;
  const d = (err.details ?? {}) as Partial<SuspendedDetails>;
  return {
    reason: typeof d.reason === 'string' ? d.reason : null,
    claim: typeof d.claim === 'string' ? d.claim : null,
  };
}

export default function SignIn() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [suspended, setSuspended] = useState<SuspendedDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (!identifier.trim() || !password) {
      setError('Enter your email or handle, and your password.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuspended(null);
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
      const stopped = suspendedOf(err);
      if (stopped) return setSuspended(stopped);
      setError(
        err instanceof ApiError && err.code === 'rate_limited'
          ? tr('Too many tries. Wait a few minutes and try again.')
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };

  // A passkey (R36), on the web: nothing typed, the browser asks which one. Its code loads on press.
  const withPasskey = async () => {
    setBusy(true);
    setError(null);
    try {
      const { signInWithPasskey } = await import('@/features/auth/passkeys');
      const res = await signInWithPasskey(deviceInfo());
      await useSession.getState().signedIn(res);
    } catch (err) {
      const stopped = suspendedOf(err);
      if (stopped) return setSuspended(stopped);
      const { passkeyProblem } = await import('@/features/auth/passkeys');
      setError(passkeyProblem(err));
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
      {suspended ? <Suspended reason={suspended.reason} claim={suspended.claim} /> : null}
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
      {isWeb ? (
        <Button
          label={tr('Sign in with a passkey')}
          variant="secondary"
          size="lg"
          block
          disabled={busy}
          onPress={withPasskey}
          testID="signin-passkey"
        />
      ) : null}
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
