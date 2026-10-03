import type { ConnectionRequestView } from '@caime/core/api';
import { formatListTime } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useRequests } from '@/api/hooks';
import { qk } from '@/api/keys';
import type { RelationshipDraft } from '@/features/relationships/RelationshipPicker';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft, UserPlus } from '@/ui/icons';
import { lazyPart } from '@/ui/Lazy';
import { SectionTitle } from '@/ui/ListRow';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/** How they know someone, in its sheet: loaded the first time it's asked for. */
const RelationshipPicker = lazyPart(() =>
  import('@/features/relationships/RelationshipPicker').then((m) => m.RelationshipPicker),
);

export default function Requests() {
  const t = useTheme();
  const qc = useQueryClient();
  const { desktop } = useLayout();
  const incoming = useRequests('incoming');
  const outgoing = useRequests('outgoing');
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [accepting, setAccepting] = useState<ConnectionRequestView | null>(null);

  const refresh = () => {
    for (const k of [qk.requests('incoming'), qk.requests('outgoing'), qk.connections, qk.inbox])
      void qc.invalidateQueries({ queryKey: k });
  };
  const accept = async (r: ConnectionRequestView, relationship?: RelationshipDraft) => {
    try {
      const res = await endpoints.acceptRequest(r.id, relationship);
      toast(tr('You’re connected with {displayName}', { displayName: r.person.displayName }));
      refresh();
      router.navigate({ pathname: '/c/[id]', params: { id: res.conversationId } });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };

  const card = (r: ConnectionRequestView) => (
    <Card key={r.id}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Avatar id={r.person.id} name={r.person.displayName} url={r.person.avatarUrl} size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="label">{r.person.displayName}</Text>
          <Text variant="caption" color="textSecondary">
            @{r.person.handle} · {r.person.trust.label} ·{' '}
            {formatListTime(r.createdAt, now, timeZone, locale)}
          </Text>
          {r.context ? (
            <Text variant="caption" color="textSecondary">
              {tr('Says you know each other from')}{' '}
              <Text variant="captionStrong">
                {r.context.label}
                {r.context.orgName ? ` · ${r.context.orgName}` : ''}
              </Text>
            </Text>
          ) : null}
          {r.note ? (
            <Text variant="body" style={{ marginTop: 4 }} auto>
              “{r.note}”
            </Text>
          ) : null}
        </View>
      </View>
      {r.direction === 'incoming' ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button
            label={tr('Accept')}
            onPress={() => setAccepting(r)}
            testID={`accept-${r.person.handle}`}
          />
          <Button
            label={tr('Decline')}
            variant="secondary"
            onPress={async () => {
              await endpoints
                .declineRequest(r.id)
                .catch((e) => toast((e as Error).message, { tone: 'danger' }));
              toast(tr('Declined. They won’t be told.'));
              refresh();
            }}
          />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button
            label={tr('Cancel request')}
            variant="ghost"
            onPress={async () => {
              await endpoints
                .cancelRequest(r.id)
                .catch((e) => toast((e as Error).message, { tone: 'danger' }));
              refresh();
            }}
          />
        </View>
      )}
    </Card>
  );

  const inList = incoming.data?.requests ?? [];
  const outList = outgoing.data?.requests ?? [];
  return (
    <Screen edges={desktop ? [] : ['top']}>
      <TopBar
        left={
          <IconButton
            icon={ArrowLeft}
            label={tr('Back')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/people'))}
          />
        }
        title={tr('Requests')}
      />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 12,
          maxWidth: 640,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        {incoming.isPending && !incoming.data ? (
          <SkeletonRows count={4} />
        ) : incoming.isError && !incoming.data ? (
          <EmptyState
            icon={UserPlus}
            title={tr('Requests couldn’t load')}
            body={(incoming.error as Error).message}
            action={
              <Button
                label={tr('Try again')}
                variant="secondary"
                onPress={() => void incoming.refetch()}
                testID="requests-retry"
              />
            }
          />
        ) : inList.length === 0 && outList.length === 0 && incoming.isFetched ? (
          <EmptyState
            character="momo"
            expression="happy"
            icon={UserPlus}
            title={tr('No requests')}
            body={tr(
              'When someone wants to connect, you’ll see who they are and how they know you here. Share your link, and the first one is yours to answer.',
            )}
            action={
              <Button
                label={tr('Find people or share your link')}
                variant="secondary"
                onPress={() => router.navigate('/connect')}
                testID="requests-connect"
              />
            }
          />
        ) : null}
        {inList.length ? <SectionTitle>{tr('Want to connect')}</SectionTitle> : null}
        {inList.map(card)}
        {outList.length ? <SectionTitle>{tr('You asked')}</SectionTitle> : null}
        {outList.map(card)}
        <View style={{ height: 8, backgroundColor: t.c.canvas }} />
      </ScrollView>
      {accepting ? (
        <RelationshipPicker
          open
          onClose={() => setAccepting(null)}
          person={accepting.person}
          onPick={(draft) => void accept(accepting, draft)}
          skip={{ label: tr('Accept without a label'), onPress: () => void accept(accepting) }}
        />
      ) : null}
    </Screen>
  );
}
