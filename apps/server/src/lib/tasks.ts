/**
 * An action as its reader sees it (`TaskView`), shared by Actions, the calendar, memory and
 * search (review 2026-10-09 M22: a route module holds routes; what another module reads lives
 * here).
 */
import type { TaskDirection, TaskView } from '@caime/core';
import type { AppContext } from '../context';
import type { Task } from '../db/schema';
import { MESSAGE_COLUMNS } from '../db/schema';
import { messagePreview } from './messages';

export function directionOf(
  t: Pick<Task, 'owner_id' | 'assignee_id' | 'shared'>,
  me: string,
): TaskDirection {
  if (t.owner_id === me && t.assignee_id === me) return 'mine';
  if (t.owner_id === me) return t.shared ? 'i_asked' : 'waiting';
  return 'asked_me';
}

export async function taskViews(ctx: AppContext, rows: Task[], me: string): Promise<TaskView[]> {
  const userIds = [
    ...new Set(rows.flatMap((t) => (t.assignee_id ? [t.owner_id, t.assignee_id] : [t.owner_id]))),
  ];
  const messageIds = rows.map((t) => t.message_id).filter((x): x is string => Boolean(x));
  const [users, messages] = await Promise.all([
    userIds.length
      ? ctx.db
          .selectFrom('users')
          .select(['id', 'display_name'])
          .where('id', 'in', userIds)
          .execute()
      : [],
    messageIds.length
      ? ctx.db
          .selectFrom('messages')
          .select(MESSAGE_COLUMNS)
          .where('id', 'in', messageIds)
          .execute()
      : [],
  ]);
  const name = (id: string) => users.find((u) => u.id === id)?.display_name ?? 'Someone';
  return rows.map((t) => {
    const m = messages.find((x) => x.id === t.message_id);
    const snap = t.relationship_snapshot as { label?: string } | null;
    return {
      id: t.id,
      title: t.title,
      notes: t.notes,
      status: t.status,
      direction: directionOf(t, me),
      shared: t.shared,
      owner: { id: t.owner_id, displayName: name(t.owner_id) },
      assignee: t.assignee_id
        ? { id: t.assignee_id, displayName: name(t.assignee_id) }
        : { id: null, displayName: 'Deleted account' },
      dueAt: t.due_at?.toISOString() ?? null,
      dueHasTime: t.due_has_time,
      remindAt: t.remind_at?.toISOString() ?? null,
      caiFollowUp: t.cai_follow_up,
      conversationId: t.conversation_id,
      messageId: t.message_id,
      source: m
        ? {
            preview: messagePreview(m),
            senderId: m.sender_id,
            createdAt: m.created_at.toISOString(),
          }
        : null,
      contextId: t.context_id,
      // How its owner described the other person: theirs alone, never shown to that person.
      relationship: t.owner_id === me ? (snap?.label ?? null) : null,
      origin: t.source,
      createdAt: t.created_at.toISOString(),
      completedAt: t.completed_at?.toISOString() ?? null,
    };
  });
}
