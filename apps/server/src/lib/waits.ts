/**
 * Where a wait on someone stands (M17 I2), read once for every way Caime brings it up (the
 * reminder on its day, Cai's follow-up, Attention's "still waiting?"), so each says the same
 * true thing and none says what another already has:
 *
 * - `arrived`: what was waited on came ("Mark done" waits on its owner, I2b): nothing asks
 *   whether it's still awaited.
 * - `promised`: they said it would be done by a day that has passed (the wait is their words).
 * - `unanswered`: nothing from them where it was asked since it was asked.
 * - `waiting`: neither can be said (they wrote since, about this or not; or it was made by hand
 *   with nowhere asked): the line claims nothing.
 *
 * One query for a batch: where they last wrote is `participants.last_sent_seq` (M16 D1).
 */
import type { WaitState } from '@caime/core';
import { tr } from '@caime/core/i18n';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { Database } from '../db/schema';

type Q = Kysely<Database> | Transaction<Database>;

export type WaitNow = WaitState | 'arrived';

export interface WaitStanding {
  state: WaitNow;
  /** When it was asked: the words it came from, else when it was made. */
  askedAt: Date;
}

export async function waitStates(
  db: Q,
  ids: readonly string[],
  now: Date,
): Promise<Map<string, WaitStanding>> {
  if (!ids.length) return new Map();
  const { rows } = await sql<{
    id: string;
    arrived: boolean;
    theirs: boolean;
    passed: boolean;
    in_it: boolean;
    answered: boolean | null;
    asked_at: Date;
  }>`
    select t.id,
      exists (select 1 from suggestions s where s.user_id = t.owner_id
        and s.fingerprint = 'done:' || t.id::text and s.status = 'pending') as arrived,
      coalesce(asked.sender_id = t.assignee_id, false) as theirs,
      coalesce(t.due_at <= ${now}, false) as passed,
      p.user_id is not null as in_it,
      last.created_at > coalesce(asked.created_at, t.created_at) as answered,
      coalesce(asked.created_at, t.created_at) as asked_at
    from tasks t
    left join messages asked on asked.id = t.message_id
    left join participants p on p.conversation_id = t.conversation_id
      and p.user_id = t.assignee_id
    left join messages last on last.conversation_id = p.conversation_id
      and last.seq = p.last_sent_seq
    where t.id in (${sql.join(ids)})
  `.execute(db);
  return new Map(
    rows.map((r) => [
      r.id,
      {
        state: r.arrived
          ? 'arrived'
          : r.theirs
            ? r.passed
              ? 'promised'
              : 'waiting'
            : r.in_it && !r.answered
              ? 'unanswered'
              : 'waiting',
        askedAt: r.asked_at,
      },
    ]),
  );
}

/** What a reminder of a wait says (M17 I2), in the words every other nudge about it uses. */
export function waitLine(state: WaitNow, name: string): string {
  switch (state) {
    case 'arrived':
      return tr('{name} sent something. Is it done?', { name });
    case 'promised':
      return tr('{name} said it would be done by now', { name });
    case 'unanswered':
      return tr('No reply from {name} yet', { name });
    default:
      return tr('Still waiting on {name}', { name });
  }
}
