import type { TaskView } from '@caishy/core/api';
import { formatDue } from '@caishy/core/format';
import { router } from 'expo-router';
import { memo } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Check } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

export const TaskRow = memo(function TaskRow({
  task,
  now,
  timeZone,
  locale,
  onToggle,
}: {
  task: TaskView;
  now: Date;
  timeZone: string;
  locale: string;
  onToggle: (t: TaskView) => void;
}) {
  const t = useTheme();
  const done = task.status === 'done';
  const overdue = !done && task.dueAt !== null && Date.parse(task.dueAt) < now.getTime();
  const who =
    task.direction === 'asked_me'
      ? `${task.owner.displayName} asked you`
      : task.direction === 'waiting' || task.direction === 'i_asked'
        ? `Waiting on ${task.assignee.displayName}`
        : null;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        alignItems: 'flex-start',
      }}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        onPress={() => onToggle(task)}
        haptic
        hitSlop={8}
        focusRadius={12}
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: done ? t.c.success : overdue ? t.c.warning : t.c.borderStrong,
          backgroundColor: done ? t.c.success : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {done ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
      </Pressable>
      <Pressable
        accessibilityRole={task.conversationId ? 'link' : 'text'}
        onPress={
          task.conversationId
            ? () =>
                router.navigate({ pathname: '/c/[id]', params: { id: task.conversationId ?? '' } })
            : undefined
        }
        style={{ flex: 1, gap: 3 }}
      >
        <Text
          variant="bodyStrong"
          color={done ? 'textTertiary' : 'text'}
          style={{ textDecorationLine: done ? 'line-through' : 'none' }}
          auto
        >
          {task.title}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {task.dueAt ? (
            <Text variant="captionStrong" color={overdue ? 'warning' : 'textSecondary'}>
              {overdue ? 'Overdue · ' : ''}
              {formatDue(task.dueAt, now, timeZone, locale)}
            </Text>
          ) : null}
          {who ? (
            <Text variant="caption" color="textSecondary">
              {who}
            </Text>
          ) : null}
          {task.relationship ? (
            <Text variant="caption" color="textTertiary">
              {task.relationship}
            </Text>
          ) : null}
        </View>
        {task.source ? (
          <Text variant="caption" color="textTertiary" numberOfLines={1}>
            “{task.source.preview}”
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
});
