/**
 * A meeting's guest (R83, R84): their own link, `/j/<token>`, opened in a browser. Before it's
 * taken it says what the meeting is, when, and who asked, with the name from the invitation and
 * whether they're 18 or over (R85 (3)); taking it signs them in as the guest they are, for that
 * meeting alone. Signed in as that guest, the same address is their meeting: when it is, who's
 * in it, and its call (rung like anyone's, joined from here while it's on). Nothing else of
 * Caime is theirs (the server's guard, `guest-routes.ts`), so this page is all they see.
 *
 * The address belongs to someone on Caime: they sign in and find the meeting among their
 * requests. Someone else signed in here: the link is never taken over them.
 */
import type { JoinView } from '@caime/core/api';
import { formatWhenAt, joinNames } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { joinOpen } from '@caime/core/meetings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ApiError, setAuthToken } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { AuthLayout } from '@/features/auth/AuthLayout';
import {
  checkGroupCallIn,
  groupCallsSupported,
  joinGroupCall,
  startGroupCall,
} from '@/features/calls/calls';
import { useNow, useUserClock } from '@/lib/time';
import { useGroupCall } from '@/state/groupCall';
import { clientKind, useSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { SkeletonRows } from '@/ui/Skeleton';
import { Spec } from '@/ui/Spec';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

// The link kept for the guest, loaded only once they join: it's on no other page's path.
const guestLinks = () => import('@/state/guestLink');

export function JoinMeeting({ token }: { token: string }) {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const link = useQuery({
    queryKey: qk.joinLink(token),
    queryFn: () => endpoints.joinLink(token),
    retry: false,
  });
  if (link.isPending)
    return (
      <AuthLayout title={tr('Your invitation')} back={false}>
        <SkeletonRows count={3} />
      </AuthLayout>
    );
  if (link.error || !link.data)
    return (
      <AuthLayout title={tr('This invitation has ended')} back={false}>
        <Text color="textSecondary" testID="join-gone">
          {link.error instanceof ApiError && link.error.status === 404
            ? tr(
                'It ran out a day after the meeting, or a newer one replaced it. Ask whoever invited you for a new link.',
              )
            : (link.error as Error | null)?.message}
        </Text>
      </AuthLayout>
    );
  const view = link.data;
  if (view.space && user?.kind === 'provisional')
    return <GuestMeeting view={view} space={view.space} />;
  if (view.signIn)
    return (
      <AuthLayout title={view.meeting.title} back={false}>
        <EmptyState
          title={tr('This invitation is for your Caime account')}
          body={tr('Sign in, and you’ll find the meeting among your requests.')}
          action={
            status === 'signedIn' ? (
              <Button label={tr('Open requests')} onPress={() => router.replace('/requests')} />
            ) : (
              <Button label={tr('Sign in')} onPress={() => router.push('/sign-in')} />
            )
          }
        />
      </AuthLayout>
    );
  if (status === 'signedIn')
    return (
      <AuthLayout title={view.meeting.title} back={false}>
        <EmptyState
          title={tr('Someone else is signed in here')}
          body={tr('Open the link in another browser, or sign out first.')}
          action={
            <Button
              label={tr('Sign out')}
              variant="secondary"
              onPress={() => void useSession.getState().signOut()}
              testID="join-sign-out"
            />
          }
        />
      </AuthLayout>
    );
  return <JoinForm token={token} view={view} />;
}

/** When the meeting is and who asked, as its guest reads them. */
function useMeetingRows(view: JoinView) {
  const { timeZone, locale } = useUserClock();
  const now = useNow();
  return [
    {
      label: tr('When'),
      value: formatWhenAt(view.meeting.at, true, now, timeZone, locale),
      testID: 'join-when',
    },
    { label: tr('Duration'), value: tr('{m} min', { m: view.meeting.durationMinutes }) },
    view.meeting.host ? { label: tr('Invited by'), value: view.meeting.host } : null,
  ];
}

function JoinForm({ token, view }: { token: string; view: JoinView }) {
  const qc = useQueryClient();
  const rows = useMeetingRows(view);
  const [name, setName] = useState(view.guest.name);
  const [adult, setAdult] = useState(false);
  const join = useMutation({
    mutationFn: async () => {
      const taken = await endpoints.takeJoin(token, {
        name: name.trim() || null,
        adult,
        client: clientKind,
      });
      // A phone's session is the token it was given; a browser's, the cookie that came with it.
      if (taken.token) setAuthToken(taken.token);
      const { user } = await endpoints.session();
      if (!user) throw new Error(tr('Something went wrong. Try again.'));
      await (await guestLinks()).keepGuestLink(`/j/${token}`);
      await useSession.getState().signedIn({ user, token: taken.token ?? null });
      await qc.invalidateQueries({ queryKey: qk.joinLink(token) });
    },
  });
  return (
    <AuthLayout
      kicker={tr('Meeting')}
      title={view.meeting.title}
      subtitle={tr('You’re invited. Join as a guest: no account, nothing to install.')}
      back={false}
    >
      <View style={{ gap: 16 }} testID="join-form">
        <Spec rows={rows} dense />
        <TextField
          label={tr('Your name')}
          value={name}
          onChangeText={setName}
          autoComplete="name"
          maxLength={80}
          testID="join-name"
        />
        <SwitchRow
          label={tr('I’m 18 or over')}
          detail={tr(
            'Caime asks everyone in a meeting, for the rules that protect anyone younger.',
          )}
          value={adult}
          onChange={setAdult}
          testID="join-adult"
        />
        {join.error ? (
          <Text color="danger" testID="join-error">
            {(join.error as Error).message}
          </Text>
        ) : null}
        <Button
          label={tr('Join')}
          size="lg"
          block
          loading={join.isPending}
          onPress={() => join.mutate()}
          testID="join-submit"
        />
      </View>
    </AuthLayout>
  );
}

/**
 * The guest's meeting: when, who's in it, and its call. Anyone in it starts the call from its
 * card; the guest is rung like the rest, and while it's on they join it here.
 */
function GuestMeeting({ view, space }: { view: JoinView; space: NonNullable<JoinView['space']> }) {
  const me = useSession((s) => s.user);
  const rows = useMeetingRows(view);
  const now = useNow(30_000);
  const people = useQuery({
    queryKey: qk.conversation(space.conversationId),
    queryFn: () => endpoints.conversation(space.conversationId),
    select: (d) =>
      d.conversation.participants
        .filter((p) => p.userId !== me?.id)
        .map((p) => p.person.displayName),
  }).data;
  const inCall = useGroupCall((s) => Boolean(s.phase && s.phase !== 'ended'));
  // The meeting's call while someone's in it (rung or not, they join it from here), told by the
  // socket and asked once as the page opens.
  const on = useGroupCall((s) => s.on[space.conversationId]);
  const live = Boolean(on && on.state !== 'ended' && on.members.some((m) => m.state === 'joined'));
  useEffect(() => {
    if (groupCallsSupported) void checkGroupCallIn(space.conversationId);
  }, [space.conversationId]);
  const open = joinOpen({ at: view.meeting.at, hasTime: true }, view.meeting.durationMinutes, now);
  const { locale } = useUserClock();
  return (
    <AuthLayout kicker={tr('Meeting')} title={view.meeting.title} back={false}>
      <View style={{ gap: 16 }} testID="guest-meeting">
        <Spec
          rows={[
            ...rows,
            people?.length ? { label: tr('With'), value: joinNames(people, 4, locale) } : null,
          ]}
          dense
        />
        {groupCallsSupported ? (
          <>
            {inCall ? null : live && on ? (
              <Button
                label={tr('Join the call')}
                onPress={() => void joinGroupCall(on)}
                testID="guest-join-call"
              />
            ) : open ? (
              <Button
                label={tr('Start the call')}
                variant="secondary"
                onPress={() => void startGroupCall(space.conversationId, 'video')}
                testID="guest-start-call"
              />
            ) : (
              <Text variant="caption" color="textSecondary" testID="guest-not-yet">
                {tr(
                  'The call opens ten minutes before it starts. Keep this page, or come back by your link.',
                )}
              </Text>
            )}
          </>
        ) : (
          <Text variant="caption" color="textSecondary">
            {tr(
              'This browser can’t make calls. Open your link in a recent Chrome, Safari, Edge or Firefox.',
            )}
          </Text>
        )}
        <Button
          label={tr('Sign out')}
          variant="ghost"
          onPress={() => {
            void guestLinks().then((g) => g.forgetGuestLink());
            void useSession.getState().signOut();
          }}
          testID="guest-sign-out"
        />
      </View>
    </AuthLayout>
  );
}
