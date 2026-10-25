/**
 * A date's history (R119 level 2, M17 I19d): each move of a meeting's or an appointment's time and
 * of an action's due, written in the change's own transaction by whatever moved it, never updated,
 * gone with what it's about (a card erased, an action deleted). `replan` is the plan truly moving
 * (another time suggested, a due changed), `correction` a wrong value fixed (a card moved back to
 * its own clock, I19c); what slipped is counted from `replan` alone, which is what Cai and the
 * brief say ("moved twice").
 */
import { uuidv7 } from '@caime/core';
import { dayIn } from '@caime/core/series';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { Database } from '../db/schema';

type Q = Kysely<Database> | Transaction<Database>;

export type DateMove = {
  of: { messageId: string } | { taskId: string };
  field: 'start' | 'due';
  /** The new value and the one it replaced: an instant, or a day for a day-only due. */
  value: { at: Date | null; on?: string | null };
  previous: { at: Date | null; on?: string | null };
  reason: 'replan' | 'correction';
  source: 'person' | 'rules';
  byId: string | null;
};

const same = (a: DateMove['value'], b: DateMove['previous']) =>
  (a.at?.getTime() ?? null) === (b.at?.getTime() ?? null) && (a.on ?? null) === (b.on ?? null);

/** One move kept, in the transaction that made it; nothing when nothing moved. */
export async function recordMove(trx: Q, move: DateMove, now: Date): Promise<void> {
  if (same(move.value, move.previous)) return;
  await trx
    .insertInto('date_moves')
    .values({
      id: uuidv7(),
      message_id: 'messageId' in move.of ? move.of.messageId : null,
      task_id: 'taskId' in move.of ? move.of.taskId : null,
      field: move.field,
      value_at: move.value.at,
      previous_at: move.previous.at,
      value_on: move.value.on ?? null,
      previous_on: move.previous.on ?? null,
      reason: move.reason,
      source: move.source,
      by_id: move.byId,
      known_at: now,
    })
    .execute();
}

/** How many times each card's or action's plan moved (`replan` alone), in one query. */
export async function replansOf(
  db: Q,
  ids: { messageIds?: string[]; taskIds?: string[] },
): Promise<Map<string, number>> {
  const messageIds = ids.messageIds ?? [];
  const taskIds = ids.taskIds ?? [];
  if (!messageIds.length && !taskIds.length) return new Map();
  const rows = await db
    .selectFrom('date_moves')
    .select([
      sql<string>`coalesce(message_id, task_id)`.as('id'),
      sql<number>`count(*)::int`.as('n'),
    ])
    .where('reason', '=', 'replan')
    .where((w) =>
      w.or([
        ...(messageIds.length ? [w('message_id', 'in', messageIds)] : []),
        ...(taskIds.length ? [w('task_id', 'in', taskIds)] : []),
      ]),
    )
    .groupBy(sql`coalesce(message_id, task_id)`)
    .execute();
  return new Map(rows.map((r) => [r.id, r.n]));
}

type TaskDue = {
  id: string;
  owner_id: string;
  due_at: Date | null;
  due_has_time: boolean;
  due_on: string | null;
};

/**
 * An action's due that existed and moved (`PATCH /tasks/:id`), kept as a replan: its day on its
 * owner's clock when either side is a day, its instant when both have a time. A first due, or a
 * time given on the same day, is no move.
 */
export async function keepDueMove(
  trx: Q,
  before: TaskDue,
  after: TaskDue,
  byId: string,
  now: Date,
): Promise<void> {
  if (!before.due_at || !after.due_at) return;
  if (!(before.due_has_time && after.due_has_time)) {
    const owner = await trx
      .selectFrom('users')
      .select('time_zone')
      .where('id', '=', after.owner_id)
      .executeTakeFirst();
    const zone = owner?.time_zone || 'UTC';
    const dayOf = (t: TaskDue) => t.due_on ?? dayIn(t.due_at!, zone);
    if (dayOf(before) === dayOf(after)) return;
  } else if (before.due_at.getTime() === after.due_at.getTime()) return;
  await recordMove(
    trx,
    {
      of: { taskId: after.id },
      field: 'due',
      value: { at: after.due_at, on: after.due_on },
      previous: { at: before.due_at, on: before.due_on },
      reason: 'replan',
      source: 'person',
      byId,
    },
    now,
  );
}
