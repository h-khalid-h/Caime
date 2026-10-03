import { tr } from '@caime/core/i18n';
import { SPHERE_DEFS, type Sphere } from '@caime/core/taxonomy';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { usePolicies } from '@/api/hooks';
import { qk } from '@/api/keys';
import { Character } from '@/brand/Character';
import { copyText } from '@/lib/clipboard';
import { handleLink } from '@/lib/config';
import { handleIn, inviteIn, isAuthorizeLink } from '@/lib/paths';
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
    return tr('{DAYS} to {DAYS2}', {
      DAYS: DAYS[sorted[0] ?? 0],
      DAYS2: DAYS[sorted[sorted.length - 1] ?? 0],
    });
  return sorted.map((d) => DAYS[d]).join(', ');
}

export default function Onboarding() {
  const t = useTheme();
  const me = useMe();
  const codes = useSession((s) => s.freshRecoveryCodes);
  const policies = usePolicies();
  const [step, setStep] = useState<'codes' | 'rules' | 'people'>(codes?.length ? 'codes' : 'rules');
  // Where they are, as a spec sheet labels it: "step 2 of 3 · how Caime works".
  const steps = (['codes', 'rules', 'people'] as const).filter(
    (x) => x !== 'codes' || codes?.length,
  );
  const stepLine = tr('step {indexOf} of {length} · {codes}', {
    indexOf: steps.indexOf(step) + 1,
    length: steps.length,
    codes: { codes: tr('recovery codes'), rules: tr('how Caime works'), people: tr('your people') }[
      step
    ],
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = me.displayName.split(' ')[0] ?? me.displayName;
  // Came through someone's link, or an app asking to act for them: the last step opens it.
  const [pending] = useState(() => peekLink());
  const linkHandle = handleIn(pending);
  const inviteToken = inviteIn(pending);
  const forApp = isAuthorizeLink(pending);
  const linked = Boolean(linkHandle || inviteToken || forApp);
  // Invited (R1): the last step names who, and opens the conversation they'll land in.
  const invite = useQuery({
    queryKey: qk.invite(inviteToken ?? ''),
    queryFn: () => endpoints.openInvite(inviteToken ?? ''),
    enabled: inviteToken !== null,
    retry: false,
  });
  const inviter = invite.data?.invite.inviter.displayName ?? null;

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
    { sphere: 'family', label: tr(SPHERE_DEFS.family.plural) },
    { sphere: 'friend', label: tr(SPHERE_DEFS.friend.plural) },
    { sphere: 'work', label: tr(SPHERE_DEFS.work.plural) },
    { sphere: 'work', role: 'manager', label: tr('Managers') },
    { sphere: 'customer', label: tr(SPHERE_DEFS.customer.plural) },
    { sphere: 'vendor', label: tr(SPHERE_DEFS.vendor.plural) },
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
              <Text variant="mono" color="textTertiary" testID="onboarding-step">
                {stepLine}
              </Text>
              <Text variant="display" align="center" accessibilityRole="header">
                {tr('Welcome, {name}', { name })}
              </Text>
              <Text variant="body" color="textSecondary" align="center">
                {tr(
                  'First, one thing to keep safe. If you ever forget your password, these codes get you back in. Caime never asks for your phone number.',
                )}
              </Text>
            </View>
            <Card>
              <View
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}
                accessibilityLabel={tr('Recovery codes: {join}', { join: codes.join(', ') })}
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
              label={tr('Copy the codes')}
              icon={KeyRound}
              variant="secondary"
              block
              onPress={async () => {
                await copyText(codes.join('\n'));
                toast(tr('Copied. Paste them into your password manager or notes.'));
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
              <Text variant="bodyStrong">{tr('I’ve saved them somewhere safe')}</Text>
            </Pressable>
            <Button
              label={tr('Continue')}
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
              <Text variant="mono" color="textTertiary" testID="onboarding-step">
                {stepLine}
              </Text>
              <Text variant="title" align="center" accessibilityRole="header">
                {tr('People aren’t all the same. Neither are their messages.')}
              </Text>
              <Text variant="body" color="textSecondary" align="center">
                {tr(
                  'When you add someone, you tell Caime how you know them (only you see it). Caime then treats them the right way:',
                )}
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
              label={tr('Sounds good')}
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
              <Text variant="mono" color="textTertiary" testID="onboarding-step">
                {stepLine}
              </Text>
              <Text variant="title" align="center" accessibilityRole="header">
                {tr('Now, your people')}
              </Text>
              <Text variant="body" color="textSecondary" align="center">
                {forApp
                  ? tr(
                      'An app asked to act for you. See what it asks first; find people by @handle or email any time.',
                    )
                  : linkHandle
                    ? tr(
                        'You came here for @{linkHandle}. Find others by @handle or email any time.',
                        { linkHandle },
                      )
                    : inviteToken
                      ? tr(
                          '{inviter} invited you: open the conversation and you’re connected. Find others by @handle or email any time.',
                          { inviter: inviter ?? tr('Someone') },
                        )
                      : tr('Find someone by @handle or email, or share your link: @{handle}', {
                          handle: me.handle,
                        })}
              </Text>
            </View>
            {linked ? (
              <Button
                label={
                  forApp
                    ? tr('See what the app asks')
                    : inviteToken
                      ? tr('Open the conversation with {inviter}', { inviter: inviter ?? 'them' })
                      : tr('See @{linkHandle}', { linkHandle })
                }
                size="lg"
                block
                loading={busy}
                onPress={() => void finish('link')}
                testID="onboarding-link"
              />
            ) : null}
            <Button
              label={tr('Find people')}
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
                  label={tr('Share your link')}
                  variant="secondary"
                  size="lg"
                  block
                  onPress={() =>
                    void shareLink(
                      tr('I’m on Caime as @{handle}.', { handle: me.handle }),
                      handleLink(me.handle),
                    )
                  }
                  testID="onboarding-share"
                />
                <Button
                  label={tr('I’ll do it later')}
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
