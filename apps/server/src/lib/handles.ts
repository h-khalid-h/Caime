/**
 * Handles are one namespace for people and organizations (R15): nobody can take @datac as a
 * person once DATA C has it, or the other way round. Some are nobody's to take (R35:
 * isReservedHandle, @caime, @support…); only the operator gives those out (modules/admin.ts).
 */
import { isReservedHandle } from '@caime/core';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/schema';
import { conflict } from './errors';

type Q = Kysely<Database> | Transaction<Database>;

/** How a handle that can't be had reads, whether someone has it or it's reserved. */
export const HANDLE_UNAVAILABLE = 'That handle isn’t available.';

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

/**
 * Throws unless someone may take `handle` now: nobody but `except` has it, and it isn't reserved.
 * Both refusals are one answer, so which handles are reserved can't be told from them.
 */
export async function assertHandleAvailable(
  db: Q,
  handle: string,
  except: { userId?: string; orgId?: string } = {},
): Promise<void> {
  if (isReservedHandle(handle) || (await handleTaken(db, handle, except)))
    throw conflict('handle_taken', HANDLE_UNAVAILABLE);
}
