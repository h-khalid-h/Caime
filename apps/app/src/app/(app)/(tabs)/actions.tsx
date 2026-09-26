import type { TaskView } from '@caishy/core/api';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { endpoints, type TaskViewFilter } from '@/api/endpoints';
import { useTasks } from '@/api/hooks';
import { AddTaskSheet } from '@/features/actions/AddTaskSheet';
import { TaskRow } from '@/features/actions/TaskRow';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Divider } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { CircleCheck, Plus } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { PageHeader, Screen } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { SkeletonRows } from '@/ui/Skeleton';
import { toast } from '@/ui/Toast';

const EMPTY: Record<string, { title: string; body: string; character: 'momo' | 'panda' | 'zuzu' }> =
  {
    todo: {
      title: 'Nothing on your plate',
      body: 'Promises you make in conversations can land here with one tap.',
      character: 'momo',
    },
    asked_me: {
      title: 'No one’s waiting on you',
      body: 'When someone asks you for something, it shows up here.',
      character: 'momo',
    },
    waiting: {
      title: 'You’re not waiting on anyone',
      body: 'Ask for something in a conversation and Caishy can keep track of it.',
      character: 'panda',
    },
    done: {
      title: 'Nothing finished yet',
      body: 'Completed actions stay here, with a link back to where they came from.',
      character: 'zuzu',
    },
  };

export default function Actions() {
  const t = useTheme();
  const qc = useQueryClient();
  const { desktop } = useLayout();
  const [view, setView] = useState<TaskViewFilter>('todo');
  const [adding, setAdding] = useState(false);
  const q = useTasks(view);
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const counts = q.data?.counts;

  const toggle = async (task: TaskView) => {
    const status = task.status === 'done' ? 'open' : 'done';
    try {
      await endpoints.updateTask(task.id, { status });
      if (status === 'done')
        toast('Done', {
          action: {
            label: 'Undo',
            onPress: () =>
              void endpoints
                .updateTask(task.id, { status: 'open' })
                .then(() => qc.invalidateQueries({ queryKey: ['tasks'] })),
          },
        });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    }
  };

  const tasks = q.data?.tasks ?? [];
  const empty = EMPTY[view] ?? EMPTY.todo!;
  return (
    <Screen edges={desktop ? [] : ['top']}>
      <View style={{ flex: 1, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <PageHeader
          title="Actions"
          subtitle={counts?.overdue ? `${counts.overdue} overdue` : null}
          right={
            <IconButton
              icon={Plus}
              label="New action"
              onPress={() => setAdding(true)}
              testID="add-task"
            />
          }
        />
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Segmented<TaskViewFilter>
            label="Which actions"
            value={view}
            onChange={setView}
            options={[
              { value: 'todo', label: 'To do', count: counts?.todo },
              { value: 'asked_me', label: 'Asked me', count: counts?.asked_me },
              { value: 'waiting', label: 'Waiting', count: counts?.waiting },
              { value: 'done', label: 'Done' },
            ]}
          />
        </View>
        {q.isPending && !q.data ? (
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
                title={empty.title}
                body={empty.body}
              />
            }
            contentContainerStyle={{
              paddingBottom: 32,
              backgroundColor: tasks.length ? t.c.surface : undefined,
            }}
          />
        )}
      </View>
      <AddTaskSheet open={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}
