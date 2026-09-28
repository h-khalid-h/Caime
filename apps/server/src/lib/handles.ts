/**
 * Handles are one namespace for people and organizations (R15): nobody can take @datac as a
 * person once DATA C has it, or the other way round. Some are nobody's to take (R35:
 * isReservedHandle, @caime, @support…); only the operator gives those out (modules/admin.ts).
 *
 * A link to a handle outlives whoever had it (R35: cai.me/@handle on cards and QR codes), so one
 * someone lets go of, by taking another or deleting their account, is held from everyone for a
 * year, whoever had it included: only the handle and the days are kept, never whose it was. An
 * organization's handle stays with it, closed or not (its row stays).
 */
import { isReservedHandle } from '@caime/core';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/schema';
import { conflict } from './errors';
import { dayOf, KEPT_DAYS } from './retention';

type Q = Kysely<Database> | Transaction<Database>;

/** How a handle that can't be had reads: someone has it, it's held, or it's reserved. */
export const HANDLE_UNAVAILABLE = 'That handle isn’t available.';

/** Whether someone has `handle`: a person (but whoever `except` names) or an organization. */
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

/** Whether `handle` is held on `now`'s day, since someone let it go. */
export async function handleHeld(db: Q, handle: string, now: Date): Promise<boolean> {
  const held = await db
    .selectFrom('released_handles')
    .select('handle')
    .where('handle', '=', handle)
    .where('held_until', '>', dayOf(now))
    .executeTakeFirst();
  return Boolean(held);
}

/**
 * Holds `handle` from everyone, as whoever had it lets it go; call it in the transaction that
 * lets it go, so there's no moment it's anyone's. A reserved handle needs no hold: only the
 * operator gives one out anyway, and may give it again.
 */
export async function releaseHandle(db: Q, handle: string, now: Date): Promise<void> {
  if (isReservedHandle(handle)) return;
  const hold = {
    released_on: dayOf(now),
    held_until: dayOf(new Date(now.getTime() + KEPT_DAYS.heldHandles * 86_400_000)),
  };
  await db
    .insertInto('released_handles')
    .values({ handle, ...hold })
    .onConflict((oc) => oc.column('handle').doUpdateSet(hold))
    .execute();
}

/** Which of `handles` nobody may take now: someone has it, it's held or it's reserved. */
export async function unavailableAmong(db: Q, handles: string[], now: Date): Promise<Set<string>> {
  if (!handles.length) return new Set();
  const [people, orgs, held] = await Promise.all([
    db.selectFrom('users').select('handle').where('handle', 'in', handles).execute(),
    db.selectFrom('organizations').select('handle').where('handle', 'in', handles).execute(),
    db
      .selectFrom('released_handles')
      .select('handle')
      .where('handle', 'in', handles)
      .where('held_until', '>', dayOf(now))
      .execute(),
  ]);
  return new Set([
    ...[...people, ...orgs, ...held].map((r) => String(r.handle).toLowerCase()),
    ...handles.filter((h) => isReservedHandle(h)),
  ]);
}

/**
 * Throws unless someone may take `handle` now: nobody but `except` has it, it isn't held and it
 * isn't reserved. Every refusal is one answer, so it can't be told which it was.
 */
export async function assertHandleAvailable(
  db: Q,
  handle: string,
  now: Date,
  except: { userId?: string; orgId?: string } = {},
): Promise<void> {
  // Whether someone has it before whether it's held: a handle is held in the transaction that
  // lets it go, so once the first no longer finds its holder, the second finds the hold.
  if (
    isReservedHandle(handle) ||
    (await handleTaken(db, handle, except)) ||
    (await handleHeld(db, handle, now))
  )
    throw conflict('handle_taken', HANDLE_UNAVAILABLE);
}
