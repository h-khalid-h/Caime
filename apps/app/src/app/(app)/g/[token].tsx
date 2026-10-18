import { formatDayHeading } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { SPACE_KIND_DEFS, type SpaceKind } from '@caime/core/spaces';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { OrgMark } from '@/features/orgs/kinds';
import { useUserClock } from '@/lib/time';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Spec } from '@/ui/Spec';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/**
 * A link to join a group or a space, opened signed in (M16 C3e): where it leads, how many are in
 * it, who asks, and Join, which puts this account in it and opens its conversation. Joining is
 * asked for, never done by opening the link: what was said there before comes with it.
 */
export default function JoinLink() {
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  const { timeZone, locale } = useUserClock();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: qk.groupLink(token),
    queryFn: () => endpoints.openJoinLink(token),
    enabled: token !== '',
    retry: false,
  });
  const link = q.data?.link;
  const open = (id: string) => router.replace({ pathname: '/c/[id]', params: { id } });
  const join = useMutation({
    mutationFn: () => endpoints.acceptJoinLink(token),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: qk.inbox });
      void qc.invalidateQueries({ queryKey: qk.spaces });
      if (!res.already && link) toast(tr('You joined “{place}”', { place: link.name }));
      open(res.conversationId);
    },
    onError: (e) => toast((e as Error).message, { tone: 'danger' }),
  });
  const gone = q.isError && q.error instanceof ApiError && q.error.status === 404;
  const kind =
    link?.spaceKind && link.spaceKind in SPACE_KIND_DEFS
      ? tr(SPACE_KIND_DEFS[link.spaceKind as SpaceKind].label)
      : null;
  const asker = link?.org?.name ?? link?.invitedBy ?? null;
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
            <View style={{ gap: 12 }} testID="join-link-gone">
              <Text variant="headline" accessibilityRole="header">
                {tr('Nothing to open')}
              </Text>
              <Text variant="body" color="textSecondary">
                {tr('This link has run out, or was taken back. Ask whoever sent it for a new one.')}
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
          ) : !link ? (
            <SkeletonRows count={3} />
          ) : (
            <View style={{ gap: 16 }} testID="join-link">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {link.org ? (
                  <OrgMark kind={link.org.kind} url={link.org.avatarUrl} size={52} />
                ) : (
                  <Avatar id={link.name} name={link.name} size={52} />
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="headline" accessibilityRole="header">
                    {asker
                      ? tr('{name} invites you to “{place}”', { name: asker, place: link.name })
                      : tr('Join “{place}”', { place: link.name })}
                  </Text>
                  {link.purpose ? (
                    <Text variant="caption" color="textSecondary" auto>
                      {link.purpose}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Spec
                dense
                rows={[
                  {
                    label: link.target === 'space' ? tr('space') : tr('group'),
                    value: link.name,
                  },
                  kind ? { label: tr('kind'), value: kind } : null,
                  { label: tr('people'), value: trn(link.memberCount, '{n} person', '{n} people') },
                  link.invitedBy && !link.org ? { label: tr('from'), value: link.invitedBy } : null,
                  {
                    label: tr('open until'),
                    value: formatDayHeading(link.expiresAt, new Date(), timeZone, locale),
                  },
                ]}
              />
              {link.member ? (
                <>
                  <Text variant="body" color="textSecondary">
                    {tr('You’re in “{place}” already.', { place: link.name })}
                  </Text>
                  <Button
                    label={tr('Open it')}
                    loading={join.isPending}
                    onPress={() => join.mutate()}
                    testID="join-link-open"
                  />
                </>
              ) : (
                <>
                  <Text variant="caption" color="textSecondary">
                    {tr(
                      'You read what was said there before you came, and its people see your name.',
                    )}
                  </Text>
                  <Button
                    label={link.target === 'space' ? tr('Join the space') : tr('Join the group')}
                    size="lg"
                    block
                    loading={join.isPending}
                    onPress={() => join.mutate()}
                    testID="join-link-join"
                  />
                </>
              )}
            </View>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
