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
import { CountryField } from '@/features/geo/CountryField';
import { useCountries } from '@/features/geo/countries';
import { WEB_URL } from '@/lib/config';
import { openLink, opensWithEnter } from '@/lib/links';
import { handleIn } from '@/lib/paths';
import { peekLink } from '@/state/pendingLink';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { DateField } from '@/ui/DateField';
import { dayOf, yearsBefore } from '@/ui/dates';
import { AtSign, Check } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

type Field = 'displayName' | 'handle' | 'email' | 'password' | 'birthDate' | 'country';

/** Nobody is older than this, and the day is one that's come. */
const OLDEST_YEARS = 120;

export default function SignUp() {
  const t = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleTouched, setHandleTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [device] = useState(deviceInfo);
  const [errors, setErrors] = useState<Partial<Record<Field | 'form', string>>>({});
  // One request for the list and the suggestion (CountryField asks with the same time zone).
  const countries = useCountries(device.locale, device.timeZone);
  const chooseCountry = (code: string) => {
    setCountry(code);
    setErrors((e) => (e.country ? { ...e, country: undefined } : e));
  };
  // Where the device says it is, until they choose (its time zone, else its language's region).
  useEffect(() => {
    const suggested = countries.data?.suggested;
    if (!suggested) return;
    setCountry((chosen) => chosen ?? suggested);
    setErrors((e) => (e.country ? { ...e, country: undefined } : e));
  }, [countries.data?.suggested]);
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

  const today = dayOf(new Date());
  const oldest = yearsBefore(today, OLDEST_YEARS);

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
    next.birthDate =
      !birthDate || birthDate > today || birthDate < oldest
        ? 'Enter the day you were born.'
        : undefined;
    next.country = country ? undefined : 'Choose where you live.';
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
        birthDate: birthDate ?? '',
        country: country ?? '',
        ...device,
        // Whose @handle link brought them, counted for the operator and told to nobody.
        ...(handleIn(peekLink()) ? { invite: handleIn(peekLink()) ?? undefined } : {}),
      });
      await useSession.getState().signedIn(res);
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fieldErrors();
        const mapped: typeof errors = {};
        for (const key of [
          'displayName',
          'handle',
          'email',
          'password',
          'birthDate',
          'country',
        ] as const)
          if (fields[key]) mapped[key] = fields[key];
        if (err.code === 'email_taken') mapped.email = err.message;
        else if (err.code === 'handle_taken') mapped.handle = err.message;
        else if (err.code === 'too_young') mapped.birthDate = err.message;
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
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          error={errors.password}
          hint="At least 10 characters. A short sentence works well."
          testID="signup-password"
        />
        <DateField
          label="Date of birth"
          value={birthDate}
          onChange={(day) => {
            setBirthDate(day);
            if (day) setErrors((e) => (e.birthDate ? { ...e, birthDate: undefined } : e));
          }}
          min={oldest}
          max={today}
          memorable
          error={errors.birthDate}
          hint="Only to keep younger people safer, from the day you turn 18. Never shown to anyone."
          testID="signup-birth-date"
        />
        <CountryField
          label="Where you live"
          value={country}
          onChange={chooseCountry}
          locale={device.locale}
          timeZone={device.timeZone}
          error={errors.country}
          hint="Sets your defaults, like your work week and the currency of amounts. Never shown to anyone."
          testID="signup-country"
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
      <Text variant="caption" color="textSecondary" align="center">
        By creating an account, you agree to the <PageLink name="terms">terms</PageLink>. The{' '}
        <PageLink name="privacy">privacy policy</PageLink> says what Caishy keeps, and why.
      </Text>
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

/** One of Caishy's own pages (the server's), opened as a page, never a screen of the app. */
function PageLink({ name, children }: { name: 'terms' | 'privacy'; children: string }) {
  const open = () => openLink(`${WEB_URL}/${name}`);
  return (
    <Text
      variant="captionStrong"
      color="link"
      accessibilityRole="link"
      onPress={open}
      {...opensWithEnter(open)}
      testID={`signup-${name}`}
    >
      {children}
    </Text>
  );
}
