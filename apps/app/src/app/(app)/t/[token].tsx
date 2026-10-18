import { formatDayHeading } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { ORG_ROLE_LABELS } from '@caime/core/orgs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { OrgMark } from '@/features/orgs/kinds';
import { useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Spec } from '@/ui/Spec';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/**
 * A team invite opened signed in (M16 C3a): the organization, who asks and in what role, and
 * Join, which puts this account on its team and opens its Business inbox. Joining is asked for,
 * never done by opening the link: the team's conversations with its customers come with it.
 */
export default function TeamInvite() {
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  const { timeZone, locale } = useUserClock();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: qk.teamInvite(token),
    queryFn: () => endpoints.openTeamInvite(token),
    enabled: token !== '',
    retry: false,
  });
  const invite = q.data?.invite;
  const inbox = (handle: string) =>
    router.replace({ pathname: '/o/[handle]/inbox', params: { handle } });
  const join = useMutation({
    mutationFn: () => endpoints.acceptTeamInvite(token),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: qk.orgs });
      void qc.invalidateQueries({ queryKey: qk.businessSummary });
      if (!res.already && invite)
        toast(tr('You’re on {org}’s team', { org: invite.org.name }), { tone: 'success' });
      inbox(res.handle);
    },
    onError: (e) => toast((e as Error).message, { tone: 'danger' }),
  });
  const gone = q.isError && q.error instanceof ApiError && q.error.status === 404;
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 16,
          maxWidth: 520,
          width: '100%',
          alignSelf: 'center',
          flexGrow: 1,
          justifyContent: 'center',
        }}
      >
        <Card>
          {!token || gone ? (
            <View style={{ gap: 12 }} testID="team-invite-gone">
              <Text variant="headline" accessibilityRole="header">
                {tr('Nothing to open')}
              </Text>
              <Text variant="body" color="textSecondary">
                {tr(
                  'This invite has run out, or was taken back. Ask whoever sent it for a new one.',
                )}
              </Text>
              <Button
                label={tr('Go to Caime')}
                variant="secondary"
                onPress={() => router.replace('/')}
              />
            </View>
          ) : q.isError ? (
            <View style={{ gap: 12 }}>
              <Text variant="body" color="textSecondary">
                {(q.error as Error).message}
              </Text>
              <Button
                label={tr('Try again')}
                variant="secondary"
                onPress={() => void q.refetch()}
              />
            </View>
          ) : !invite ? (
            <SkeletonRows count={3} />
          ) : (
            <View style={{ gap: 16 }} testID="team-invite">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <OrgMark kind={invite.org.kind} url={invite.org.avatarUrl} size={52} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="headline" accessibilityRole="header">
                    {invite.invitedBy
                      ? tr('{name} invites you to {org}’s team', {
                          name: invite.invitedBy,
                          org: invite.org.name,
                        })
                      : tr('Join {org}’s team', { org: invite.org.name })}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {invite.role === 'admin'
                      ? tr('To answer its customers with the team, and run it with its owner.')
                      : tr('To answer its customers with the team.')}
                  </Text>
                </View>
              </View>
              <Spec
                dense
                rows={[
                  {
                    label: tr('organization'),
                    value: invite.org.verified
                      ? tr('{name} · verified', { name: invite.org.name })
                      : invite.org.name,
                  },
                  { label: tr('role'), value: tr(ORG_ROLE_LABELS[invite.role]) },
                  invite.invitedBy ? { label: tr('from'), value: invite.invitedBy } : null,
                  {
                    label: tr('open until'),
                    value: formatDayHeading(invite.expiresAt, new Date(), timeZone, locale),
                  },
                ]}
              />
              {invite.onTeam ? (
                <>
                  <Text variant="body" color="textSecondary">
                    {tr('You’re on {org}’s team already.', { org: invite.org.name })}
                  </Text>
                  <Button
                    label={tr('Open the Business inbox')}
                    onPress={() => inbox(invite.org.handle)}
                    testID="team-invite-inbox"
                  />
                </>
              ) : invite.addressed === 'elsewhere' ? (
                <>
                  <Text variant="body" color="textSecondary" testID="team-invite-elsewhere">
                    {tr(
                      'This invite was sent to another address: sign in with it, or add it to your account.',
                    )}
                  </Text>
                  <Button
                    label={tr('Your accounts')}
                    variant="secondary"
                    onPress={() => router.push('/settings/apps')}
                  />
                </>
              ) : invite.addressed === 'unconfirmed' ? (
                <>
                  <Text variant="body" color="textSecondary" testID="team-invite-unconfirmed">
                    {tr('Confirm your address first: the invite was sent to it.')}
                  </Text>
                  <Button
                    label={tr('Confirm your address')}
                    variant="secondary"
                    onPress={() => router.push('/settings/security')}
                  />
                </>
              ) : (
                <Button
                  label={tr('Join the team')}
                  size="lg"
                  block
                  loading={join.isPending}
                  onPress={() => join.mutate()}
                  testID="team-invite-join"
                />
              )}
            </View>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
