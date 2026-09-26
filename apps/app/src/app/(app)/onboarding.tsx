import { SPHERE_DEFS, type Sphere } from '@caishy/core/taxonomy';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { usePolicies } from '@/api/hooks';
import { Character } from '@/brand/Character';
import { handleLink } from '@/lib/config';
import { handleIn, isAuthorizeLink } from '@/lib/paths';
import { shareLink } from '@/lib/share';
import { peekLink, takeLink } from '@/state/pendingLink';
import { useMe, useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { RelationshipChip } from '@/ui/Chip';
import { Check, KeyRound } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function workweekText(days: number[]): string {
  if (!days.length) return 'every day';
  const sorted = [...days].sort((a, b) => a - b);
  const contiguous = sorted.every((d, i) => i === 0 || d === (sorted[i - 1] ?? 0) + 1);
  if (contiguous && sorted.length > 2)
    return `${DAYS[sorted[0] ?? 0]} to ${DAYS[sorted[sorted.length - 1] ?? 0]}`;
  return sorted.map((d) => DAYS[d]).join(', ');
}

export default function Onboarding() {
  const t = useTheme();
  const me = useMe();
  const codes = useSession((s) => s.freshRecoveryCodes);
  const policies = usePolicies();
  const [step, setStep] = useState<'codes' | 'rules' | 'people'>(codes?.length ? 'codes' : 'rules');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = me.displayName.split(' ')[0] ?? me.displayName;
  // Came through someone's link, or an app asking to act for them: the last step opens it.
  const [pending] = useState(() => peekLink());
  const linkHandle = handleIn(pending);
  const forApp = isAuthorizeLink(pending);
  const linked = Boolean(linkHandle || forApp);

  const finish = async (next: '/' | '/connect' | 'link') => {
    setBusy(true);
    try {
      const res = await endpoints.updateMe({ onboarded: true });
      // Taken before the account reads as onboarded, so the signed-in layout doesn't open it too.
      const link = takeLink();
      useSession.getState().clearRecoveryCodes();
      useSession.getState().setUser(res.user);
      router.replace('/');
      const then = next === 'link' ? link : next === '/connect' ? '/connect' : null;
      if (then) setTimeout(() => router.push(then), 0);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  // The rows that show the idea best: close people always, work in work hours, managers first.
  const PICKS: Array<{ sphere: Sphere; role?: string; label: string }> = [
    { sphere: 'family', label: SPHERE_DEFS.family.plural },
    { sphere: 'friend', label: SPHERE_DEFS.friend.plural },
    { sphere: 'work', label: SPHERE_DEFS.work.plural },
    { sphere: 'work', role: 'manager', label: 'Managers' },
    { sphere: 'customer', label: SPHERE_DEFS.customer.plural },
    { sphere: 'vendor', label: SPHERE_DEFS.vendor.plural },
  ];
  const all = policies.data?.policies ?? [];
  const shown = PICKS.flatMap((pick) => {
    const p = all.find(
      (x) =>
        !x.scope.connectionId &&
        x.scope.sphere === pick.sphere &&
        (x.scope.role ?? undefined) === pick.role,
    );
    return p ? [{ ...pick, id: p.id, description: p.description }] : [];
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          gap: 20,
          maxWidth: 520,
          width: '100%',
          alignSelf: 'center',
          justifyContent: 'center',
        }}
      >
        {step === 'codes' && codes ? (
          <>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Character name="panda" expression="happy" size={112} />
              <Text variant="display" align="center" accessibilityRole="header">
                Welcome, {name}
              </Text>
              <Text variant="body" color="textSecondary" align="center">
                First, one thing to keep safe. If you ever forget your password, these codes get you
                back in. Caishy never asks for your phone number.
              </Text>
            </View>
            <Card>
              <View
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}
                accessibilityLabel={`Recovery codes: ${codes.join(', ')}`}
              >
                {codes.map((c) => (
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
            </Card>
            <Button
              label="Copy the codes"
              icon={KeyRound}
              variant="secondary"
              block
              onPress={async () => {
                await Clipboard.setStringAsync(codes.join('\n'));
                toast('Copied. Paste them into your password manager or notes.');
                setSaved(true);
              }}
            />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: saved }}
              onPress={() => setSaved((s) => !s)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
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
              <Text variant="bodyStrong">I’ve saved them somewhere safe</Text>
            </Pressable>
            <Button
              label="Continue"
              size="lg"
              block
              disabled={!saved}
              onPress={() => setStep('rules')}
              testID="onboarding-codes-next"
            />
          </>
        ) : step === 'rules' ? (
          <>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Character name="lumi" expression="curious" size={112} />
              <Text variant="title" align="center" accessibilityRole="header">
                People aren’t all the same. Neither are their messages.
              </Text>
              <Text variant="body" color="textSecondary" align="center">
                When you add someone, you tell Caishy how you know them (only you see it). Caishy
                then treats them the right way:
              </Text>
            </View>
            <Card padded={false}>
              {shown.map((p, i) => (
                <View
                  key={p.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: t.c.border,
                  }}
                >
                  <RelationshipChip label={p.label} sphere={p.sphere} size="md" />
                  <Text variant="caption" color="textSecondary" style={{ flex: 1 }} align="right">
                    {p.description}
                  </Text>
                </View>
              ))}
            </Card>
            <Text variant="caption" color="textTertiary" align="center">
              Your work week is {workweekText(me.workweek)}. Change any of this later in You →
              Notifications.
            </Text>
            <Button
              label="Sounds good"
              size="lg"
              block
              onPress={() => setStep('people')}
              testID="onboarding-rules-next"
            />
          </>
        ) : (
          <>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Character name="niko" expression="excited" size={120} />
              <Text variant="title" align="center" accessibilityRole="header">
                Now, your people
              </Text>
              <Text variant="body" color="textSecondary" align="center">
                {forApp
                  ? 'An app asked to act for you. See what it asks first; find people by @handle or email any time.'
                  : linkHandle
                    ? `You came here for @${linkHandle}. Find others by @handle or email any time.`
                    : `Find someone by @handle or email, or share your link: @${me.handle}`}
              </Text>
            </View>
            {linked ? (
              <Button
                label={forApp ? 'See what the app asks' : `See @${linkHandle}`}
                size="lg"
                block
                loading={busy}
                onPress={() => void finish('link')}
                testID="onboarding-link"
              />
            ) : null}
            <Button
              label="Find people"
              variant={linked ? 'secondary' : 'primary'}
              size="lg"
              block
              loading={busy && !linked}
              onPress={() => void finish('/connect')}
              testID="onboarding-find"
            />
            {linked ? null : (
              <>
                <Button
                  label="Share your link"
                  variant="secondary"
                  size="lg"
                  block
                  onPress={() =>
                    void shareLink(`I’m on Caishy as @${me.handle}.`, handleLink(me.handle))
                  }
                  testID="onboarding-share"
                />
                <Button
                  label="I’ll do it later"
                  variant="ghost"
                  block
                  onPress={() => void finish('/')}
                  testID="onboarding-skip"
                />
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
