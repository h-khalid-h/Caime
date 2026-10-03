import type { TaskView } from '@caime/core/api';
import { msg, tr } from '@caime/core/i18n';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import type { TaskViewFilter } from '@/api/endpoints';
import { endpoints } from '@/api/endpoints';
import { useTasks } from '@/api/hooks';
import { AddTaskSheet } from '@/features/actions/AddTaskSheet';
import { TaskRow } from '@/features/actions/TaskRow';
import { ConnectionBanner } from '@/features/common/ConnectionBanner';
import { YouButton } from '@/features/shell/YouButton';
import { chosenOf, instantOf } from '@/features/when/when';
import { useNow, useUserClock } from '@/lib/time';
import { useMe } from '@/state/session';
import { pendingTaskView, usePendingTasks, useTaskOutbox } from '@/state/taskOutbox';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Divider } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { CircleCheck, Plus } from '@/ui/icons';
import { lazyPart } from '@/ui/Lazy';
import { useLayout } from '@/ui/layout';
import { PageHeader, Screen } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { SkeletonRows } from '@/ui/Skeleton';
import { toast } from '@/ui/Toast';

const EMPTY: Record<string, { title: string; body: string; character: 'momo' | 'panda' | 'zuzu' }> =
  {
    todo: {
      title: msg('Nothing on your plate'),
      body: msg('Promises you make in conversations can land here with one tap.'),
      character: 'momo',
    },
    asked_me: {
      title: msg('No one’s waiting on you'),
      body: msg('When someone asks you for something, it shows up here.'),
      character: 'momo',
    },
    waiting: {
      title: msg('You’re not waiting on anyone'),
      body: msg('Ask for something in a conversation and Caime can keep track of it.'),
      character: 'panda',
    },
    done: {
      title: msg('Nothing finished yet'),
      body: msg('Completed actions stay here, with a link back to where they came from.'),
      character: 'zuzu',
    },
  };

/** Choosing a day, loaded the first time it's opened. */
const WhenSheet = lazyPart(() => import('@/features/when/WhenSheet').then((m) => m.WhenSheet));
/** The calendar (R51), loaded when it's first shown. */
const CalendarList = lazyPart(() =>
  import('@/features/calendar/CalendarList').then((m) => m.CalendarList),
);

export default function Actions() {
  const t = useTheme();
  const me = useMe();
  const { desktop } = useLayout();
  const [view, setView] = useState<TaskViewFilter | 'calendar'>('todo');
  const [adding, setAdding] = useState(false);
  // The action whose due date is being chosen, in the person's own days and times.
  const [dueFor, setDueFor] = useState<TaskView | null>(null);
  const setDue = async (task: TaskView, due: { dueAt: string | null; dueHasTime: boolean }) => {
    try {
      await endpoints.updateTask(task.id, due);
      void q.refetch();
      toast(due.dueAt ? tr('Due date changed') : tr('Due date removed'));
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  const q = useTasks(view === 'calendar' ? 'todo' : view);
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const { creates, pending } = usePendingTasks();
  // Made on this device and not sent yet: on your list already, marked Pending (PRD §49).
  const unsent = useMemo(
    () => (view === 'todo' ? creates.map((op) => pendingTaskView(op, me)) : []),
    [view, creates, me],
  );
  const serverCounts = q.data?.counts;
  const counts = serverCounts
    ? { ...serverCounts, todo: serverCounts.todo + creates.filter((c) => !c.done).length }
    : undefined;

  const toggle = (task: TaskView) => {
    const status = task.status === 'done' ? 'open' : 'done';
    useTaskOutbox.getState().setStatus(task, status);
    if (status === 'done')
      toast(tr('Done'), {
        action: {
          label: tr('Undo'),
          onPress: () => useTaskOutbox.getState().setStatus(task, 'open'),
        },
      });
  };
  const retry = (id: string) => useTaskOutbox.getState().retry(id);
  const discard = (id: string) => useTaskOutbox.getState().discard(id);

  const tasks = [...unsent, ...(q.data?.tasks ?? [])];
  const empty = EMPTY[view] ?? EMPTY.todo!;
  return (
    <Screen edges={desktop ? [] : ['top']}>
      <View style={{ flex: 1, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <PageHeader
          title={tr('Actions')}
          subtitle={counts?.overdue ? tr('{overdue} overdue', { overdue: counts.overdue }) : null}
          left={desktop ? undefined : <YouButton />}
          right={
            <IconButton
              icon={Plus}
              label={tr('New action')}
              tone="primary"
              size={20}
              onPress={() => setAdding(true)}
              testID="add-task"
            />
          }
        />
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Segmented<TaskViewFilter | 'calendar'>
            label={tr('Which actions')}
            value={view}
            onChange={setView}
            options={[
              { value: 'todo', label: tr('To do'), count: counts?.todo },
              { value: 'asked_me', label: tr('Asked me'), count: counts?.asked_me },
              { value: 'waiting', label: tr('Waiting'), count: counts?.waiting },
              { value: 'done', label: tr('Done') },
              { value: 'calendar', label: tr('Calendar') },
            ]}
          />
        </View>
        <ConnectionBanner />
        {view === 'calendar' ? (
          <CalendarList />
        ) : q.isPending && !q.data && !unsent.length ? (
          <SkeletonRows count={5} />
        ) : (
          <FlatList
            data={tasks}
            keyExtractor={(x) => x.id}
            renderItem={({ item }) => (
              <TaskRow
                task={item}
                now={now}
                timeZone={timeZone}
                locale={locale}
                onToggle={toggle}
                pending={pending.get(item.id)}
                onRetry={retry}
                onDiscard={discard}
                onDue={setDueFor}
              />
            )}
            ItemSeparatorComponent={() => <Divider inset={52} />}
            refreshControl={
              <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />
            }
            ListEmptyComponent={
              <EmptyState
                character={empty.character}
                icon={CircleCheck}
                title={tr(empty.title)}
                body={tr(empty.body)}
                action={
                  view === 'todo' ? (
                    <Button
                      label={tr('Add an action')}
                      variant="secondary"
                      onPress={() => setAdding(true)}
                      testID="add-task-empty"
                    />
                  ) : undefined
                }
              />
            }
            contentContainerStyle={{
              paddingBottom: 32,
              backgroundColor: tasks.length ? t.c.surface : undefined,
            }}
          />
        )}
      </View>
      {dueFor ? (
        <WhenSheet
          open
          onClose={() => setDueFor(null)}
          title={tr('Due')}
          value={dueFor.dueAt ? chosenOf(dueFor.dueAt, timeZone, dueFor.dueHasTime) : null}
          onChange={(c) =>
            void setDue(dueFor, {
              dueAt: instantOf(c, timeZone).toISOString(),
              dueHasTime: Boolean(c.time),
            })
          }
          onClear={() => void setDue(dueFor, { dueAt: null, dueHasTime: false })}
          clearLabel={tr('No due date')}
          testID="task-when"
        />
      ) : null}
      <AddTaskSheet open={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}
