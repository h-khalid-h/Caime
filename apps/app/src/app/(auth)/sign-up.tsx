import { tr } from '@caime/core/i18n';
import {
  displayNameError,
  emailError,
  handleError,
  handleFromName,
  normalizeHandle,
  passwordError,
} from '@caime/core/rules';
import { tagged } from '@caime/core/tagged';
import { router, useLocalSearchParams } from 'expo-router';
import AtSign from 'lucide-react-native/icons/at-sign';
import Check from 'lucide-react-native/icons/check';
import { useEffect, useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { deviceInfo, deviceRegion } from '@/features/auth/device';
import { CountryField } from '@/features/geo/CountryField';
import { useCountries } from '@/features/geo/countries';
import { WEB_URL } from '@/lib/config';
import { openLink, opensWithEnter } from '@/lib/links';
import { handleIn } from '@/lib/paths';
import type { KeptMeeting } from '@/state/guestLink';
import { peekLink } from '@/state/pendingLink';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceChips } from '@/ui/Chip';
import { ChoiceList } from '@/ui/ChoiceList';
import { DateField } from '@/ui/DateField';
import { dayOf, yearsBefore } from '@/ui/dates';
import { PickerField } from '@/ui/PickerField';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

type Field =
  | 'displayName'
  | 'handle'
  | 'email'
  | 'emailCode'
  | 'password'
  | 'birthDate'
  | 'country';

/** Nobody is older than this, and the day is one that's come. */
const OLDEST_YEARS = 120;

export default function SignUp() {
  const t = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleTouched, setHandleTouched] = useState(false);
  // The handles the name could have (docs/HANDLES.md), best first and free now.
  const [candidates, setCandidates] = useState<string[]>([]);
  const [needsLatin, setNeedsLatin] = useState(false);
  const [latinName, setLatinName] = useState('');
  // Asked, never required (R81): "Prefer not to say" is null.
  const [gender, setGender] = useState<'woman' | 'man' | 'other' | 'none'>('none');
  const [choosingGender, setChoosingGender] = useState(false);
  const GENDERS = [
    { value: 'woman' as const, label: tr('Woman') },
    { value: 'man' as const, label: tr('Man') },
    { value: 'other' as const, label: tr('Another word') },
    { value: 'none' as const, label: tr('Prefer not to say') },
  ];
  const [email, setEmail] = useState('');
  // An address with messages already waiting is claimed only with the six digits sent to it
  // (review 2026-10-17 §2 H1): what the server said when it asked, and what's typed.
  const [codeAsked, setCodeAsked] = useState<string | null>(null);
  const [emailCode, setEmailCode] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  // Keeping a meeting (M16 C3f): what the guest's page handed over, read only when it says so,
  // so the store stays out of every other sign-up's download.
  // A child joining through their parent's family link (R122): its token, sent with the form.
  const { keep, family } = useLocalSearchParams<{ keep?: string; family?: string }>();
  const [kept, setKept] = useState<KeptMeeting | null>(null);
  useEffect(() => {
    if (keep !== '1') return;
    void import('@/state/guestLink')
      .then((g) => g.keptMeeting())
      .then((k) => {
        if (!k) return;
        setKept(k);
        setDisplayName((n) => n || k.name);
        if (k.email) setEmail((e) => e || (k.email ?? ''));
      });
  }, [keep]);
  const [device] = useState(deviceInfo);
  const [errors, setErrors] = useState<Partial<Record<Field | 'form', string>>>({});
  // One request for the list and the suggestion (CountryField asks with the same time zone).
  const [region] = useState(deviceRegion);
  const countries = useCountries(device.locale, device.timeZone, region);
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

  // Suggest a handle from the name until the person edits it themselves: at once from the name,
  // then the engine's best that's free (debounced).
  useEffect(() => {
    if (!handleTouched) setHandle(handleFromName(latinName || displayName));
    const name = displayName.trim();
    if (!name) {
      setCandidates([]);
      setNeedsLatin(false);
      return;
    }
    const timer = setTimeout(() => {
      endpoints
        .handleCandidates({
          for: 'person',
          name,
          ...(latinName.trim() ? { latinName: latinName.trim() } : {}),
        })
        .then((r) => {
          setCandidates(r.candidates);
          setNeedsLatin(r.needsLatinName);
          if (!handleTouched && r.candidates[0]) setHandle(r.candidates[0]);
        })
        .catch(() => setCandidates([]));
    }, 400);
    return () => clearTimeout(timer);
  }, [displayName, latinName, handleTouched]);

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

  const validate = (resend = false): boolean => {
    const next: typeof errors = {};
    next.displayName = displayNameError(displayName) ?? undefined;
    next.handle =
      handleError(handle) ??
      (availability && availability.handle === normalizeHandle(handle) && !availability.available
        ? (availability.reason ?? tr('That handle isn’t available.'))
        : undefined);
    next.email = emailError(email) ?? undefined;
    next.password = passwordError(password) ?? undefined;
    next.birthDate =
      !birthDate || birthDate > today || birthDate < oldest
        ? tr('Enter the day you were born.')
        : undefined;
    next.country = country ? undefined : tr('Choose where you live.');
    next.emailCode =
      codeAsked && !resend && !/^\d{6}$/.test(emailCode.trim())
        ? tr('Enter the six digits from the email.')
        : undefined;
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  // `resend` sends the form without the code, so the server mails a fresh one and asks again.
  const submit = async (resend = false) => {
    if (!validate(resend)) return;
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
        gender: gender === 'none' ? null : gender,
        ...device,
        // Whose @handle link brought them, counted for the operator and told to nobody.
        ...(handleIn(peekLink()) ? { invite: handleIn(peekLink()) ?? undefined } : {}),
        ...(codeAsked && !resend ? { emailCode: emailCode.trim() } : {}),
        ...(kept?.claim ? { keep: kept.claim } : {}),
        ...(family ? { family } : {}),
      });
      if (kept) void import('@/state/guestLink').then((g) => g.forgetKeptMeeting());
      await useSession.getState().signedIn(res);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_code_needed') {
        // Everything else was right: the code field appears under the address, and the same
        // button finishes once it's typed.
        setCodeAsked(err.message);
        setEmailCode('');
        setErrors({});
        return;
      }
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
        if (err.code === 'email_taken' || err.code === 'email_unprovable')
          mapped.email = err.message;
        else if (err.code === 'wrong_code' || err.code === 'code_expired')
          mapped.emailCode = err.message;
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
          accessible
          accessibilityRole="text"
          accessibilityLabel={tr('Available')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Check size={16} color={t.c.success} />
          <Text variant="caption" color="success">
            {tr('Available')}
          </Text>
        </View>
      ) : null
    ) : null;

  return (
    <AuthLayout
      kicker={tr('new account')}
      title={kept ? tr('Keep “{title}”', { title: kept.title }) : tr('Create your account')}
      subtitle={
        kept
          ? tr('Your own account, free: the meeting, its people and what was said come with it.')
          : family
            ? tr('Your own account. Your parent or guardian agrees to it next, from theirs.')
            : tr('It takes a minute. You can change all of it later.')
      }
    >
      <View style={{ gap: 14 }}>
        <TextField
          label={tr('Your name')}
          value={displayName}
          onChangeText={setDisplayName}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => refs.handle.current?.focus()}
          error={errors.displayName}
          hint={tr('How people see you. Use any name you like.')}
          testID="signup-name"
        />
        {needsLatin ? (
          // A name in another script is never guessed at (docs/HANDLES.md): its Latin spelling,
          // as they write it, makes their handle.
          <TextField
            label={tr('Your name in Latin letters')}
            value={latinName}
            onChangeText={setLatinName}
            autoCapitalize="words"
            hint={tr('Only for your handle, the way you spell it.')}
            testID="signup-latin-name"
          />
        ) : null}
        <View style={{ gap: 6 }}>
          <TextField
            ref={refs.handle}
            label={tr('Handle')}
            icon={AtSign}
            value={handle}
            onChangeText={(v) => {
              setHandleTouched(true);
              setHandle(v.replace(/\s/g, ''));
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => refs.email.current?.focus()}
            error={
              errors.handle ??
              (availability && availability.handle === h && !availability.available
                ? availability.reason
                : null)
            }
            hint={tr('People can find you by it. Letters, numbers, dots or underscores.')}
            trailing={handleStatus}
            testID="signup-handle"
          />
          {candidates.length > 1 ? (
            <ChoiceChips
              wrap
              flush
              label={tr('Handles you could have')}
              value={candidates.includes(h) ? h : null}
              onChange={(v) => {
                setHandleTouched(true);
                setHandle(v);
              }}
              options={candidates.map((c) => ({ value: c, label: `@${c}` }))}
              testID="signup-handle-option"
            />
          ) : availability &&
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
                {tr('Use @{suggestion}', { suggestion: availability.suggestion })}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <TextField
          ref={refs.email}
          label={tr('Email')}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            // Another address asks again: a code proves one address only.
            if (codeAsked) {
              setCodeAsked(null);
              setEmailCode('');
            }
          }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => refs.password.current?.focus()}
          error={errors.email}
          hint={
            kept?.email
              ? tr('The address your invitation came to: keep it, and the meeting comes with it.')
              : tr('For signing in. Hidden from others unless you choose otherwise.')
          }
          testID="signup-email"
        />
        {codeAsked ? (
          <>
            <TextField
              label={tr('Code from the email')}
              value={emailCode}
              onChangeText={(v) => setEmailCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              error={errors.emailCode}
              hint={codeAsked}
              testID="signup-email-code"
            />
            {/* A code that ran out, or never came: the form again without it mails a fresh one. */}
            <Button
              label={tr('Send a new code')}
              variant="secondary"
              size="sm"
              disabled={busy}
              onPress={() => void submit(true)}
              testID="signup-resend-code"
            />
          </>
        ) : null}
        <TextField
          ref={refs.password}
          label={tr('Password')}
          secret
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          error={errors.password}
          hint={tr('At least 10 characters. A short sentence works well.')}
          testID="signup-password"
        />
        <DateField
          label={tr('Date of birth')}
          value={birthDate}
          onChange={(day) => {
            setBirthDate(day);
            if (day) setErrors((e) => (e.birthDate ? { ...e, birthDate: undefined } : e));
          }}
          min={oldest}
          max={today}
          memorable
          error={errors.birthDate}
          hint={tr(
            'Only to keep younger people safer, from the day you turn 18. Never shown to anyone.',
          )}
          testID="signup-birth-date"
        />
        <CountryField
          label={tr('Where you live')}
          value={country}
          onChange={chooseCountry}
          locale={device.locale}
          timeZone={device.timeZone}
          region={region}
          error={errors.country}
          hint={tr(
            'Sets your defaults, like your work week and the currency of amounts. Never shown to anyone.',
          )}
          testID="signup-country"
        />
        {/* A field like the others (its twin is one, lib/public-pages.ts), opening four choices. */}
        <PickerField
          label={tr('Gender (optional)')}
          shown={GENDERS.find((g) => g.value === gender)?.label ?? null}
          placeholder={tr('Prefer not to say')}
          accessibilityHint={tr('Opens the choices')}
          onOpen={() => setChoosingGender(true)}
          hint={tr(
            'Only how Caime writes to you in Arabic and French. Never guessed, never in your handle.',
          )}
          testID="signup-gender"
        >
          <Sheet
            open={choosingGender}
            onClose={() => setChoosingGender(false)}
            title={tr('Gender (optional)')}
          >
            <ChoiceList
              label={tr('Gender (optional)')}
              value={gender}
              options={GENDERS}
              onChange={(v) => {
                setGender(v);
                setChoosingGender(false);
              }}
              testID="signup-gender"
            />
          </Sheet>
        </PickerField>
      </View>
      {errors.form ? (
        <Text variant="bodyStrong" color="danger" accessibilityLiveRegion="assertive">
          {errors.form}
        </Text>
      ) : null}
      <Button
        label={tr('Create account')}
        size="lg"
        block
        loading={busy}
        onPress={() => void submit()}
        testID="signup-submit"
      />
      <Text variant="caption" color="textSecondary" align="center">
        {tagged(
          tr(
            'By creating an account, you agree to the <terms>terms</terms>. The <privacy>privacy policy</privacy> says what Caime keeps, and why.',
          ),
        ).map((part, i) =>
          typeof part === 'string' ? (
            part
          ) : part.tag === 'terms' || part.tag === 'privacy' ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: a sentence's parts keep their order.
            <PageLink key={i} name={part.tag}>
              {part.text}
            </PageLink>
          ) : (
            part.text
          ),
        )}
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.replace('/sign-in')}
        style={{ alignSelf: 'center', padding: 8 }}
      >
        <Text variant="body" color="textSecondary">
          {tr('Already have an account?')}{' '}
          <Text variant="bodyStrong" color="link">
            {tr('Sign in')}
          </Text>
        </Text>
      </Pressable>
    </AuthLayout>
  );
}

/** One of Caime's own pages (the server's), opened as a page, never a screen of the app. */
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
