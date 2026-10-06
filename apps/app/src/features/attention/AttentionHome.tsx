/**
 * The Attention home (R66): the first screen. Who needs you, and why, from the inbox's own
 * "needs you" (a space's conversations folded into one line); what you're waiting on others for;
 * what's coming up; and, now and then, one question Cai asks rather than assume. When nothing
 * needs you, it says so, and that's the screen working.
 */
import type { CalendarItemView, InboxItemView, TaskView } from '@caime/core/api';
import { formatListTime, formatWhen } from '@caime/core/format';
import { firstName, greetingKey, type HomeEntry, homeEntries, homeSummary } from '@caime/core/home';
import { tr, trn } from '@caime/core/i18n';
import { CAI_ID } from '@caime/core/system-ids';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useAttentionHome, useInbox } from '@/api/hooks';
import { qk } from '@/api/keys';
import { RecoveryCodesCard } from '@/features/account/RecoveryCodesCard';
import { TeamInboxes } from '@/features/business/TeamInboxes';
import { ConversationRow } from '@/features/inbox/ConversationRow';
import { openDirectWith } from '@/features/inbox/openChat';
import { useBadges } from '@/features/shell/useBadges';
import { YouButton } from '@/features/shell/YouButton';
import { useNow, useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { Bell, Calendar, ChevronRight, Clock, LayoutGrid, Sparkles, UserPlus } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Screen } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

const DAY_MS = 86_400_000;

function SectionHead({ label, count, testID }: { label: string; count?: number; testID?: string }) {
  return (
    <View style={{ paddingHorizontal: 22, paddingTop: 24, paddingBottom: 8 }} testID={testID}>
      <Text variant="overline" color="textSecondary" accessibilityRole="header">
        {count ? `${label} · ${count}` : label}
      </Text>
    </View>
  );
}

/** A line of the home that opens something: a mark, two lines of words, and when. */
function HomeRow({
  mark,
  title,
  line,
  when,
  onPress,
  testID,
}: {
  mark: React.ReactNode;
  title: string;
  line: string | null;
  when: string | null;
  onPress: () => void;
  testID?: string;
}) {
  const hover = useTheme().c.surfaceHover;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ hovered, pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginHorizontal: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        opacity: pressed ? 0.85 : 1,
        backgroundColor: hovered ? hover : 'transparent',
      })}
    >
      {mark}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1} auto>
          {title}
        </Text>
        {line ? (
          <Text variant="caption" color="textSecondary" numberOfLines={2} auto>
            {line}
          </Text>
        ) : null}
      </View>
      {when ? (
        <Text variant="caption" color="textTertiary">
          {when}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Whom a wait is on, and since when, as the home says it. */
function waitingLine(task: TaskView, now: Date, timeZone: string, locale: string): string {
  return task.dueAt
    ? tr('Expected {when}', { when: formatWhen(task.dueAt, now, timeZone, locale) })
    : tr('Asked {when}', { when: formatWhen(task.createdAt, now, timeZone, locale) });
}

/**
 * Cai's one question (R66): a wait with no news for days. Cai says what it couldn't find and
 * asks, never deciding it's still open or done on its own; "Still waiting" asks again in three
 * days (a reminder, so the reader hears of it), the others close the wait.
 */
function CaiAsk({ task, since }: { task: TaskView; since: string }) {
  const t = useTheme();
  const name = firstName(task.assignee.displayName);
  const qc = useQueryClient();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const [busy, setBusy] = useState<string | null>(null);
  const answer = async (key: string, patch: Record<string, unknown>, done: string) => {
    setBusy(key);
    try {
      await endpoints.updateTask(task.id, patch);
      void qc.invalidateQueries({ queryKey: qk.attentionHome });
      void qc.invalidateQueries({ queryKey: qk.allTasks });
      toast(done);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 16,
        padding: 14,
        gap: 10,
        borderRadius: 16,
        backgroundColor: t.c.surfaceMuted,
      }}
      testID="cai-ask"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Sparkles size={14} color={t.c.accentStrong} />
        <Text variant="captionStrong" color="accentStrong">
          {tr('Cai')}
        </Text>
      </View>
      <Text variant="body" auto>
        {tr('I haven’t seen anything from {name} about “{title}” since {when}. Still waiting?', {
          name: task.assignee.displayName,
          title: task.title,
          when: formatListTime(since, now, timeZone, locale),
        })}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {task.conversationId ? (
          // A follow-up now, in the composer to change before it goes (R68).
          <Button
            label={tr('Write to {name}', { name })}
            size="sm"
            onPress={() =>
              router.navigate({
                pathname: '/c/[id]',
                params: {
                  id: task.conversationId ?? '',
                  say: tr('Hi {name}, any news on “{title}”?', { name, title: task.title }),
                },
              })
            }
            testID="cai-ask-write"
          />
        ) : null}
        <Button
          label={tr('Still waiting')}
          size="sm"
          variant={task.conversationId ? 'secondary' : 'primary'}
          loading={busy === 'wait'}
          onPress={() =>
            // Cai keeps it (R68): in three days, a follow-up ready to send, in its chat.
            void answer(
              'wait',
              {
                remindAt: new Date(now.getTime() + 3 * DAY_MS).toISOString(),
                caiFollowUp: true,
              },
              tr('I’ll check in three days, with a follow-up ready to send.'),
            )
          }
          testID="cai-ask-waiting"
        />
        <Button
          label={tr('It’s done')}
          size="sm"
          variant="secondary"
          loading={busy === 'done'}
          onPress={() => void answer('done', { status: 'done' }, tr('Marked done.'))}
          testID="cai-ask-done"
        />
        <Button
          label={tr('Not needed any more')}
          size="sm"
          variant="ghost"
          loading={busy === 'drop'}
          onPress={() =>
            void answer('drop', { status: 'cancelled' }, tr('I’ve stopped waiting on it.'))
          }
          testID="cai-ask-drop"
        />
      </View>
    </View>
  );
}

export function AttentionHome() {
  const t = useTheme();
  const { desktop } = useLayout();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const me = useSession((s) => s.user);
  const badges = useBadges();
  const inbox = useInbox();
  const home = useAttentionHome();
  const [openSpace, setOpenSpace] = useState<string | null>(null);

  const needs = useMemo<InboxItemView[]>(
    () => inbox.data?.sections.find((s) => s.section === 'needs_you')?.items ?? [],
    [inbox.data],
  );
  const entries = useMemo(() => homeEntries(needs), [needs]);
  const waiting = home.data?.waiting ?? [];
  const comingUp = home.data?.comingUp ?? [];
  const asked = home.data?.ask
    ? (waiting.find((w) => w.id === home.data?.ask?.taskId) ?? null)
    : null;
  const nothing = needs.length === 0 && waiting.length === 0 && comingUp.length === 0;
  // Nobody to talk to yet: the first thing is to find someone, not that nothing needs you.
  const alone = inbox.data?.sections.every((s) => s.items.length === 0);

  const openConversation = useCallback((item: InboxItemView) => {
    router.navigate({ pathname: '/c/[id]', params: { id: item.id } });
  }, []);
  const openTask = (task: TaskView) =>
    task.conversationId
      ? router.navigate({ pathname: '/c/[id]', params: { id: task.conversationId } })
      : router.navigate('/actions');
  const openItem = (item: CalendarItemView) =>
    item.conversationId
      ? router.navigate({ pathname: '/c/[id]', params: { id: item.conversationId } })
      : router.navigate('/actions');

  const entryRow = (entry: HomeEntry) => {
    if (entry.kind === 'one')
      return (
        <ConversationRow
          key={entry.item.id}
          item={entry.item}
          now={now}
          timeZone={timeZone}
          locale={locale}
          onPress={openConversation}
        />
      );
    const open = openSpace === entry.space.id;
    return (
      <View key={entry.space.id}>
        <HomeRow
          mark={
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.c.accentSoft,
              }}
            >
              <LayoutGrid size={20} color={t.c.accentStrong} />
            </View>
          }
          title={entry.space.name}
          line={trn(entry.items.length, '{n} conversation needs you', '{n} conversations need you')}
          when={null}
          onPress={() => setOpenSpace(open ? null : entry.space.id)}
          testID={`home-space-${entry.space.id}`}
        />
        {open
          ? entry.items.map((item) => (
              <View key={item.id} style={{ paddingStart: 16 }}>
                <ConversationRow
                  item={item}
                  now={now}
                  timeZone={timeZone}
                  locale={locale}
                  onPress={openConversation}
                />
              </View>
            ))
          : null}
      </View>
    );
  };

  const greeting = me ? tr(greetingKey(now, timeZone), { name: firstName(me.displayName) }) : '';
  const loading = inbox.isPending && !inbox.data;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: 32,
          maxWidth: 720,
          width: '100%',
          alignSelf: 'center',
        }}
        refreshControl={
          <RefreshControl
            refreshing={inbox.isRefetching || home.isRefetching}
            onRefresh={() => {
              void inbox.refetch();
              void home.refetch();
            }}
            tintColor={t.c.textSecondary}
          />
        }
        testID="attention-home"
      >
        {/* A bar for who you are and what's around (R69), then the day, on its own lines. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
            paddingTop: desktop ? 24 : 8,
          }}
        >
          {desktop ? null : <YouButton />}
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('Ask Cai')}
            onPress={() => void openDirectWith(CAI_ID)}
            hitSlop={6}
            testID="ask-cai"
          >
            <Avatar id={CAI_ID} name="Cai" size={36} />
          </Pressable>
          {desktop ? null : (
            <IconButton
              icon={Bell}
              label={tr('Notifications')}
              filled
              badge={badges.notifications > 0}
              onPress={() => router.push('/notifications')}
            />
          )}
        </View>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 6 }}>
          <Text
            variant="title"
            accessibilityRole="header"
            auto
            style={desktop ? { fontSize: 32, lineHeight: 38, letterSpacing: -0.8 } : undefined}
          >
            {greeting}
          </Text>
          <Text
            variant="body"
            color={needs.length ? 'accentStrong' : 'textSecondary'}
            testID="home-summary"
          >
            {loading ? ' ' : homeSummary(needs.length)}
          </Text>
        </View>
        <RecoveryCodesCard />
        <TeamInboxes />
        {loading ? (
          <SkeletonRows />
        ) : alone && nothing ? (
          <EmptyState
            character="niko"
            expression="excited"
            title={tr('Say hello to someone')}
            body={tr(
              'Connect with the people you talk to. Caime keeps family, friends and work each in the right place.',
            )}
            icon={UserPlus}
            action={
              <Button
                label={tr('Find people')}
                icon={UserPlus}
                onPress={() => router.push('/connect')}
              />
            }
          />
        ) : nothing ? (
          <EmptyState
            character="momo"
            expression="happy"
            title={tr('Nothing needs you right now.')}
            body={tr('Enjoy it. Everything else can wait.')}
          />
        ) : (
          <>
            {needs.length ? (
              <>
                <SectionHead label={tr('Needs you')} testID="home-needs" />
                {entries.map(entryRow)}
              </>
            ) : null}
            {asked && home.data?.ask ? <CaiAsk task={asked} since={home.data.ask.since} /> : null}
            {waiting.length ? (
              <>
                <SectionHead
                  label={tr('Waiting on others')}
                  count={home.data?.waitingCount}
                  testID="home-waiting"
                />
                {waiting.map((task) => (
                  <HomeRow
                    key={task.id}
                    mark={
                      <Avatar
                        id={task.assignee.id ?? task.id}
                        name={task.assignee.displayName}
                        url={null}
                        size={44}
                      />
                    }
                    title={`${task.assignee.displayName} · ${task.title}`}
                    line={waitingLine(task, now, timeZone, locale)}
                    when={null}
                    onPress={() => openTask(task)}
                    testID={`home-waiting-${task.id}`}
                  />
                ))}
                {(home.data?.waitingCount ?? 0) > waiting.length ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.navigate('/actions')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 22,
                      paddingVertical: 8,
                    }}
                  >
                    <Text variant="captionStrong" color="link">
                      {tr('All you’re waiting for')}
                    </Text>
                    <ChevronRight size={14} color={t.c.link} />
                  </Pressable>
                ) : null}
              </>
            ) : null}
            {comingUp.length ? (
              <>
                <SectionHead label={tr('Coming up')} testID="home-coming" />
                {comingUp.map((item) => (
                  <HomeRow
                    key={`${item.kind}:${item.id}`}
                    mark={
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: t.c.surfaceMuted,
                        }}
                      >
                        {item.kind === 'task' ? (
                          <Clock size={18} color={t.c.textSecondary} />
                        ) : (
                          <Calendar size={18} color={t.c.textSecondary} />
                        )}
                      </View>
                    }
                    title={item.title}
                    line={
                      item.with?.displayName ?? item.org?.name ?? item.conversationTitle ?? null
                    }
                    when={formatListTime(item.at, now, timeZone, locale)}
                    onPress={() => openItem(item)}
                    testID={`home-coming-${item.id}`}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
