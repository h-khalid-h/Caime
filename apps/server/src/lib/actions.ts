/**
 * Creating actions with provenance (PRD §28–§30; PRODUCT-REVIEW R13). Every task and decision
 * keeps the conversation and message it came from and a snapshot of the relationship at the time.
 */
import { type RemindKind, relationshipLabel, remindAtFor, type Sphere, uuidv7 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import { initiativeOf } from '@caime/core/initiative';
import type { Kysely, Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database, Task } from '../db/schema';
import { badRequest } from './errors';
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

/**
 * Nothing is kept on the server from a private conversation (R18, M16 G7): its words never reach
 * it, so neither does a to-do or a decision made from them, however it's asked for (the app never
 * offers one; a token, an accepted suggestion or anything later is refused the same).
 */
async function assertKeepable(db: Q, conversationId: string): Promise<void> {
  const c = await db
    .selectFrom('conversations')
    .select('privacy_class')
    .where('id', '=', conversationId)
    .executeTakeFirst();
  if (c?.privacy_class === 'private')
    throw badRequest(tr('Nothing from a private conversation is kept on the server.'));
}

export interface NewTask {
  ownerId: string;
  assigneeId: string;
  shared?: boolean;
  title: string;
  notes?: string | null;
  dueAt?: string | Date | null;
  dueHasTime?: boolean;
  /**
   * When it reminds its owner: left out, the one rule decides (`reminderFor`, M17 I2); null, it
   * never does; a time, then.
   */
  remindAt?: string | Date | null;
  /** The owner asked to be reminded of it (Cai's "remind me"): rung even without a day. */
  asked?: boolean;
  conversationId?: string | null;
  messageId?: string | null;
  contextId?: string | null;
  source?: Task['source'];
  /** Whose relationship to snapshot: the other party of the task. */
  counterpartId?: string | null;
  /** The device's own id for it (a task made offline): sent again, it's the same task. */
  clientId?: string | null;
}

/**
 * When an action reminds its owner, by the one rule (core `remindAtFor`, M17 I2): what they asked
 * to be reminded of at its hour or its morning, the next morning without a day; one of their own
 * the morning of its day; a wait on someone else at the hour they named or the end of that day,
 * unless Cai is to do less unasked (R66). On the owner's own clock, their brief's hour their
 * morning.
 */
export async function reminderFor(
  db: Q,
  ctx: Pick<AppContext, 'now'>,
  t: {
    ownerId: string;
    assigneeId: string;
    dueAt?: string | Date | null;
    dueHasTime?: boolean;
    asked?: boolean;
  },
): Promise<Date | null> {
  const kind: RemindKind = t.asked ? 'asked' : t.assigneeId === t.ownerId ? 'own' : 'wait';
  if (!t.dueAt && kind !== 'asked') return null;
  const owner = await db
    .selectFrom('users')
    .select(['time_zone', 'preferences'])
    .where('id', '=', t.ownerId)
    .executeTakeFirst();
  if (!owner) return null;
  if (kind === 'wait' && initiativeOf(owner.preferences) === 'less') return null;
  const brief = (owner.preferences as { caiBrief?: unknown } | null)?.caiBrief;
  return remindAtFor({
    kind,
    dueAt: t.dueAt ?? null,
    dueHasTime: Boolean(t.dueHasTime),
    now: ctx.now(),
    timeZone: owner.time_zone,
    morning: typeof brief === 'string' ? brief : null,
  });
}

export async function createTask(db: Q, ctx: AppContext, t: NewTask): Promise<Task> {
  if (t.conversationId) await assertKeepable(db, t.conversationId);
  const remindAt = t.remindAt !== undefined ? t.remindAt : await reminderFor(db, ctx, t);
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
      remind_at: remindAt,
      conversation_id: t.conversationId ?? null,
      message_id: t.messageId ?? null,
      context_id: t.contextId ?? null,
      relationship_snapshot: snapshot ? JSON.stringify({ ...snapshot, userId: counterpart }) : null,
      source: t.source ?? 'manual',
      client_id: t.clientId ?? null,
      created_at: ctx.now(),
      updated_at: ctx.now(),
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
  await assertKeepable(db, d.conversationId);
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
