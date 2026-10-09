/**
 * Whose tasks a person sees: their own, and what's asked of them that the asker shared with
 * them (R3, PRD §30). A private wait someone keeps on you is theirs alone until they share it.
 * One rule for every reader (Actions, the inbox's counts, Cai and the friends, the briefs,
 * the calendar), so nothing reads a private wait to the person it's about.
 */
import { type RawBuilder, sql } from 'kysely';

export function visibleTasksSql(me: string, alias = 'tasks'): RawBuilder<boolean> {
  const col = (c: string) => sql.ref(`${alias}.${c}`);
  return sql<boolean>`(${col('owner_id')} = ${me} or (${col('assignee_id')} = ${me} and ${col('shared')}))`;
}
