import {
  displayNameError,
  emailError,
  handleError,
  handleFromName,
  normalizeHandle,
  passwordError,
} from '@caishy/core/rules';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { deviceInfo } from '@/features/auth/device';
import { handleIn } from '@/lib/paths';
import { peekLink } from '@/state/pendingLink';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { AtSign, Check } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

type Field = 'displayName' | 'handle' | 'email' | 'password' | 'birthYear';

export default function SignUp() {
  const t = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleTouched, setHandleTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field | 'form', string>>>({});
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState<{
    handle: string;
    available: boolean;
    reason: string | null;
    suggestion: string | null;
  } | null>(null);
  const refs = {
    handle: useRef<TextInput>(null),
    email: useRef<TextInput>(null),
    password: useRef<TextInput>(null),
    birthYear: useRef<TextInput>(null),
  };

  // Suggest a handle from the name until the person edits it themselves.
  useEffect(() => {
    if (!handleTouched) setHandle(handleFromName(displayName));
  }, [displayName, handleTouched]);

  // Check availability as they type (debounced).
  useEffect(() => {
    const h = normalizeHandle(handle);
    if (!h || handleError(h)) {
      setAvailability(null);
      return;
    }
    const timer = setTimeout(() => {
      endpoints
        .handleAvailable(h)
        .then((r) => setAvailability({ handle: h, ...r }))
        .catch(() => setAvailability(null));
    }, 350);
    return () => clearTimeout(timer);
  }, [handle]);

  const currentYear = new Date().getFullYear();

  const validate = (): boolean => {
    const next: typeof errors = {};
    next.displayName = displayNameError(displayName) ?? undefined;
    next.handle =
      handleError(handle) ??
      (availability && availability.handle === normalizeHandle(handle) && !availability.available
        ? (availability.reason ?? 'That handle is taken.')
        : undefined);
    next.email = emailError(email) ?? undefined;
    next.password = passwordError(password) ?? undefined;
    const year = Number(birthYear);
    next.birthYear =
      !/^\d{4}$/.test(birthYear) || year < currentYear - 120 || year > currentYear
        ? 'Enter the year you were born.'
        : undefined;
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    setErrors({});
    try {
      const res = await endpoints.signup({
        displayName: displayName.trim(),
        handle: normalizeHandle(handle),
        email: email.trim(),
        password,
        birthYear: Number(birthYear),
        ...deviceInfo(),
        // Whose @handle link brought them, counted for the operator and told to nobody.
        ...(handleIn(peekLink()) ? { invite: handleIn(peekLink()) ?? undefined } : {}),
      });
      await useSession.getState().signedIn(res);
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fieldErrors();
        const mapped: typeof errors = {};
        for (const key of ['displayName', 'handle', 'email', 'password', 'birthYear'] as const)
          if (fields[key]) mapped[key] = fields[key];
        if (err.code === 'email_taken') mapped.email = err.message;
        else if (err.code === 'handle_taken') mapped.handle = err.message;
        else if (err.code === 'too_young') mapped.birthYear = err.message;
        else if (!Object.keys(mapped).length) mapped.form = err.message;
        setErrors(mapped);
      } else {
        setErrors({ form: (err as Error).message });
      }
    } finally {
      setBusy(false);
    }
  };

  const h = normalizeHandle(handle);
  const handleStatus =
    availability && availability.handle === h ? (
      availability.available ? (
        <View
          accessibilityLabel="Available"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Check size={16} color={t.c.success} />
          <Text variant="caption" color="success">
            Available
          </Text>
        </View>
      ) : null
    ) : null;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes a minute. You can change all of it later."
    >
      <View style={{ gap: 14 }}>
        <TextField
          label="Your name"
          value={displayName}
          onChangeText={setDisplayName}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => refs.handle.current?.focus()}
          error={errors.displayName}
          hint="How people see you. Use any name you like."
          testID="signup-name"
        />
        <View style={{ gap: 6 }}>
          <TextField
            ref={refs.handle}
            label="Handle"
            icon={AtSign}
            value={handle}
            onChangeText={(v) => {
              setHandleTouched(true);
              setHandle(v.replace(/\s/g, ''));
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => refs.email.current?.focus()}
            error={
              errors.handle ??
              (availability && availability.handle === h && !availability.available
                ? availability.reason
                : null)
            }
            hint="People can find you by it. Letters, numbers, dots or underscores."
            trailing={handleStatus}
            testID="signup-handle"
          />
          {availability &&
          availability.handle === h &&
          !availability.available &&
          availability.suggestion ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setHandleTouched(true);
                setHandle(availability.suggestion ?? '');
              }}
            >
              <Text variant="captionStrong" color="link">
                Use @{availability.suggestion}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <TextField
          ref={refs.email}
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => refs.password.current?.focus()}
          error={errors.email}
          hint="For signing in. Hidden from others unless you choose otherwise."
          testID="signup-email"
        />
        <TextField
          ref={refs.password}
          label="Password"
          secret
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => refs.birthYear.current?.focus()}
          error={errors.password}
          hint="At least 10 characters. A short sentence works well."
          testID="signup-password"
        />
        <TextField
          ref={refs.birthYear}
          label="Year you were born"
          value={birthYear}
          onChangeText={(v) => setBirthYear(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          inputMode="numeric"
          autoComplete="birthdate-year"
          returnKeyType="done"
          onSubmitEditing={submit}
          error={errors.birthYear}
          hint="Only to keep younger people safer. Never shown to anyone."
          testID="signup-birth-year"
          style={{ maxWidth: 220 }}
        />
      </View>
      {errors.form ? (
        <Text variant="bodyStrong" color="danger" accessibilityLiveRegion="assertive">
          {errors.form}
        </Text>
      ) : null}
      <Button
        label="Create account"
        size="lg"
        block
        loading={busy}
        onPress={submit}
        testID="signup-submit"
      />
      <Pressable
        accessibilityRole="link"
        onPress={() => router.replace('/sign-in')}
        style={{ alignSelf: 'center', padding: 8 }}
      >
        <Text variant="body" color="textSecondary">
          Already have an account?{' '}
          <Text variant="bodyStrong" color="link">
            Sign in
          </Text>
        </Text>
      </Pressable>
    </AuthLayout>
  );
}
