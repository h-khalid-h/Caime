import type { CallHistoryItem } from '@caishy/core/api';
import { callDuration } from '@caishy/core/calls';
import { formatListTime } from '@caishy/core/format';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useCallHistory } from '@/api/hooks';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Divider } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Users, Video } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Segmented } from '@/ui/Segmented';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { callsSupported, startCall } from './engine';
import { groupCallsSupported, startGroupCall } from './group';

/** What a call in the list says it was: "Missed video call", "Outgoing · 4 min". */
export function callSummary(c: CallHistoryItem): string {
  const kind = `${c.group ? 'group ' : ''}${c.kind} call`;
  switch (c.result) {
    case 'answered':
      return `${c.direction === 'outgoing' ? 'Outgoing' : 'Incoming'} · ${callDuration(c.seconds)}`;
    case 'missed':
      return `Missed ${kind}`;
    case 'declined':
      return `You declined a ${kind}`;
    case 'unanswered':
      return 'No answer';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Couldn’t connect';
  }
}

/** Who a call was with: the other person, or the group's name. */
export const callWith = (c: CallHistoryItem) =>
  c.group ? (c.conversationTitle ?? 'Group call') : (c.with[0]?.displayName ?? 'Someone');

/** One call: who with, how it went and when; call them back from it. */
export function CallRow({ call }: { call: CallHistoryItem }) {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const missed = call.result === 'missed';
  const Icon = missed ? PhoneMissed : call.direction === 'outgoing' ? PhoneOutgoing : PhoneIncoming;
  const other = call.with[0];
  const canCall = call.group ? groupCallsSupported : callsSupported;
  const summary = callSummary(call);
  const when = formatListTime(call.createdAt, now, timeZone, locale);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${callWith(call)}, ${summary}, ${when}`}
        onPress={() =>
          router.navigate({ pathname: '/c/[id]', params: { id: call.conversationId } })
        }
        style={({ hovered, pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: pressed ? t.c.surfacePressed : hovered ? t.c.surfaceHover : undefined,
        })}
        testID="call-history-row"
      >
        {call.group ? (
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: t.c.surfaceMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Users size={20} color={t.c.textSecondary} />
          </View>
        ) : other ? (
          <Avatar id={other.id} name={other.displayName} url={other.avatarUrl} size={44} />
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1} color={missed ? 'danger' : 'text'} auto>
            {callWith(call)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon size={14} color={missed ? t.c.danger : t.c.textSecondary} />
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
              {call.group && call.with.length
                ? `${summary} · ${call.with.map((p) => p.displayName.split(' ')[0]).join(', ')}`
                : summary}
            </Text>
          </View>
        </View>
        <Text variant="caption" color="textTertiary">
          {when}
        </Text>
      </Pressable>
      {canCall ? (
        <IconButton
          icon={call.kind === 'video' ? Video : Phone}
          label={`${call.kind === 'video' ? 'Video' : 'Voice'} call ${callWith(call)}`}
          onPress={() =>
            void (call.group
              ? startGroupCall(call.conversationId, call.kind)
              : startCall(call.conversationId, call.kind))
          }
          testID="call-history-call"
        />
      ) : null}
    </View>
  );
}

/** The person's calls (PRD §47), newest first: every one, the missed ones, or those with one person. */
/** A few calls, one under the other (someone's page shows their latest). */
export function CallRows({ calls }: { calls: CallHistoryItem[] }) {
  return (
    <>
      {calls.map((c, i) => (
        <View key={c.id}>
          {i > 0 ? <Divider inset={72} /> : null}
          <CallRow call={c} />
        </View>
      ))}
    </>
  );
}

/** The Calls screen's list, under the bar history.tsx draws before this has loaded. */
export function CallHistoryBody({ withId, withName }: { withId?: string; withName?: string }) {
  const [view, setView] = useState<'all' | 'missed'>('all');
  const q = useCallHistory(withId ? `with:${withId}` : view);
  const calls = q.data?.pages.flatMap((p) => p.calls) ?? [];
  return (
    <>
      {withId ? null : (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Segmented
            label="Which calls"
            value={view}
            onChange={setView}
            options={[
              { value: 'all', label: 'All' },
              { value: 'missed', label: 'Missed' },
            ]}
          />
        </View>
      )}
      <FlatList
        data={calls}
        keyExtractor={(c) => c.id}
        style={{ maxWidth: 760, width: '100%', alignSelf: 'center' }}
        ItemSeparatorComponent={() => <Divider inset={72} />}
        renderItem={({ item }) => <CallRow call={item} />}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />
        }
        ListEmptyComponent={
          q.isPending ? (
            <SkeletonRows count={6} />
          ) : (
            <EmptyState
              character="momo"
              icon={Phone}
              title={view === 'missed' && !withId ? 'No missed calls' : 'No calls yet'}
              body={
                withId
                  ? `Your calls with ${withName ?? 'them'} will be here.`
                  : 'Calls you make and get, and the ones you miss, will be here.'
              }
            />
          )
        }
      />
    </>
  );
}
