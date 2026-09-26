/**
 * Handles are one namespace for people and organizations (R15): nobody can take @datac as a
 * person once DATA C has it, or the other way round.
 */
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/schema';

type Q = Kysely<Database> | Transaction<Database>;

export async function handleTaken(
  db: Q,
  handle: string,
  except: { userId?: string; orgId?: string } = {},
): Promise<boolean> {
  const [person, org] = await Promise.all([
    db
      .selectFrom('users')
      .select('id')
      .where('handle', '=', handle)
      .$if(Boolean(except.userId), (qb) => qb.where('id', '<>', except.userId!))
      .executeTakeFirst(),
    db
      .selectFrom('organizations')
      .select('id')
      .where('handle', '=', handle)
      .$if(Boolean(except.orgId), (qb) => qb.where('id', '<>', except.orgId!))
      .executeTakeFirst(),
  ]);
  return Boolean(person || org);
}
