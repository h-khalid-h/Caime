import type { TaskView } from '@caishy/core/api';
import { formatDue } from '@caishy/core/format';
import { router } from 'expo-router';
import { memo } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Check, Clock } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

/** Who the task is between, from the reader's side; null when it's only theirs. */
export function taskWho(task: TaskView): string | null {
  if (task.direction === 'asked_me') return `${task.owner.displayName} asked you`;
  if (task.direction === 'mine') return null;
  return task.assignee.id
    ? `Waiting on ${task.assignee.displayName}`
    : 'Waiting on a deleted account';
}

export const TaskRow = memo(function TaskRow({
  task,
  now,
  timeZone,
  locale,
  onToggle,
  pending,
  onRetry,
  onDiscard,
}: {
  task: TaskView;
  now: Date;
  timeZone: string;
  locale: string;
  onToggle: (t: TaskView) => void;
  /** Still on this device (PRD §49): waiting to go, or refused and why. */
  pending?: { state: 'queued' | 'sending' | 'failed'; error?: string };
  onRetry?: (id: string) => void;
  onDiscard?: (id: string) => void;
}) {
  const t = useTheme();
  const done = task.status === 'done';
  const overdue = !done && task.dueAt !== null && Date.parse(task.dueAt) < now.getTime();
  const who = taskWho(task);
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
        // Refused, what can be done about it is reachable by a screen reader too: on a phone
        // the row is one element, and its "Try again" and "Discard" are inside it.
        {...(pending?.state === 'failed'
          ? {
              accessibilityActions: [
                ...(onRetry ? [{ name: 'retry', label: 'Try again' }] : []),
                ...(onDiscard ? [{ name: 'discard', label: 'Discard' }] : []),
              ],
              onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
                if (e.nativeEvent.actionName === 'retry') onRetry?.(task.id);
                if (e.nativeEvent.actionName === 'discard') onDiscard?.(task.id);
              },
            }
          : {})}
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
          {pending && pending.state !== 'failed' ? (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              testID="task-pending"
            >
              <Clock size={12} color={t.c.textTertiary} />
              <Text variant="captionStrong" color="textTertiary">
                Pending
              </Text>
            </View>
          ) : null}
        </View>
        {pending?.state === 'failed' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }} testID="task-failed">
            <Text variant="caption" color="danger">
              {`Couldn’t add it: ${pending.error ?? 'try again'}`}
            </Text>
            {onRetry ? (
              <Text
                variant="captionStrong"
                color="accentStrong"
                accessibilityRole="button"
                onPress={() => onRetry(task.id)}
              >
                Try again
              </Text>
            ) : null}
            {onDiscard ? (
              <Text
                variant="captionStrong"
                color="textSecondary"
                accessibilityRole="button"
                onPress={() => onDiscard(task.id)}
              >
                Discard
              </Text>
            ) : null}
          </View>
        ) : null}
        {task.source ? (
          <Text variant="caption" color="textTertiary" numberOfLines={1}>
            “{task.source.preview}”
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
});
