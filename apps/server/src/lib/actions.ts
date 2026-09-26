/**
 * Creating actions with provenance (PRD §28–§30; PRODUCT-REVIEW R13). Every task and decision
 * keeps the conversation and message it came from and a snapshot of the relationship at the time.
 */
import { relationshipLabel, type Sphere, uuidv7 } from '@caishy/core';
import type { Kysely, Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database, Task } from '../db/schema';
import { recordEvent } from './events';

type Q = Kysely<Database> | Transaction<Database>;

export async function relationshipSnapshot(db: Q, ownerId: string, subjectId: string) {
  if (ownerId === subjectId) return null;
  const r = await db
    .selectFrom('relationships')
    .select(['sphere', 'role', 'role_label', 'org_name'])
    .where('owner_id', '=', ownerId)
    .where('subject_id', '=', subjectId)
    .where('status', '=', 'active')
    .orderBy('is_primary', 'desc')
    .executeTakeFirst();
  if (!r) return null;
  return {
    sphere: r.sphere,
    role: r.role,
    label: relationshipLabel({
      sphere: r.sphere as Sphere,
      role: r.role,
      roleLabel: r.role_label,
      orgName: r.org_name,
    }),
  };
}

export interface NewTask {
  ownerId: string;
  assigneeId: string;
  shared?: boolean;
  title: string;
  notes?: string | null;
  dueAt?: string | Date | null;
  dueHasTime?: boolean;
  remindAt?: string | Date | null;
  conversationId?: string | null;
  messageId?: string | null;
  contextId?: string | null;
  source?: Task['source'];
  /** Whose relationship to snapshot: the other party of the task. */
  counterpartId?: string | null;
}

export async function createTask(db: Q, ctx: AppContext, t: NewTask): Promise<Task> {
  const counterpart = t.counterpartId ?? (t.assigneeId !== t.ownerId ? t.assigneeId : null);
  const snapshot = counterpart ? await relationshipSnapshot(db, t.ownerId, counterpart) : null;
  const row = await db
    .insertInto('tasks')
    .values({
      id: uuidv7(),
      owner_id: t.ownerId,
      assignee_id: t.assigneeId,
      shared: t.shared ?? false,
      title: t.title,
      notes: t.notes ?? null,
      due_at: t.dueAt ?? null,
      due_has_time: t.dueHasTime ?? false,
      remind_at: t.remindAt ?? null,
      conversation_id: t.conversationId ?? null,
      message_id: t.messageId ?? null,
      context_id: t.contextId ?? null,
      relationship_snapshot: snapshot ? JSON.stringify({ ...snapshot, userId: counterpart }) : null,
      source: t.source ?? 'manual',
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await recordEvent(db, 'task.created', t.ownerId, {
    taskId: row.id,
    shared: row.shared,
    assigneeId: row.assignee_id,
  });
  return row;
}

export async function createDecision(
  db: Q,
  ctx: AppContext,
  d: {
    conversationId: string;
    messageId?: string | null;
    title: string;
    notes?: string | null;
    decidedBy?: string | null;
    recordedBy: string;
    contextId?: string | null;
  },
) {
  const row = await db
    .insertInto('decisions')
    .values({
      id: uuidv7(),
      conversation_id: d.conversationId,
      message_id: d.messageId ?? null,
      context_id: d.contextId ?? null,
      title: d.title,
      notes: d.notes ?? null,
      decided_by: d.decidedBy ?? d.recordedBy,
      recorded_by: d.recordedBy,
      decided_at: ctx.now(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await recordEvent(db, 'decision.recorded', d.recordedBy, {
    decisionId: row.id,
    conversationId: d.conversationId,
  });
  return row;
}
