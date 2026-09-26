/**
 * Spaces (PRD §40), the pieces other modules need: who is in a space and in what role, the
 * space a conversation belongs to, and the title a space conversation goes by elsewhere
 * ("Family" for its General conversation, "Family · Venue" for the others).
 */
import { nextSpaceOwner, type SpaceRef } from '@caishy/core';
import type { Kysely, Transaction } from 'kysely';
import type { Database, Space, SpaceMember } from '../db/schema';
import { notFound } from './errors';

type Q = Kysely<Database> | Transaction<Database>;

/** A space the person is in, with their seat. Anything else reads as not found. */
export async function spaceSeat(
  db: Q,
  userId: string,
  spaceId: string,
): Promise<{ space: Space; seat: SpaceMember }> {
  const row = await db
    .selectFrom('space_members as m')
    .innerJoin('spaces as s', 's.id', 'm.space_id')
    .selectAll('s')
    .select(['m.user_id', 'm.role', 'm.added_by', 'm.joined_at', 'm.left_at', 'm.space_id'])
    .where('m.space_id', '=', spaceId)
    .where('m.user_id', '=', userId)
    .where('m.left_at', 'is', null)
    .where('s.archived_at', 'is', null)
    .executeTakeFirst();
  if (!row) throw notFound('That space');
  const { user_id, role, added_by, joined_at, left_at, space_id, ...space } = row;
  return {
    space: space as Space,
    seat: { space_id, user_id, role, added_by, joined_at, left_at },
  };
}

/** Name and kind of each space, for conversation views and notifications. */
export async function spaceRefs(db: Q, ids: Array<string | null>): Promise<Map<string, SpaceRef>> {
  const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .selectFrom('spaces')
    .select(['id', 'name', 'kind'])
    .where('id', 'in', wanted)
    .execute();
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, kind: r.kind }]));
}

/** What a space conversation is called outside the space. */
export function spaceConversationTitle(
  space: Pick<SpaceRef, 'name'>,
  conversation: { title: string | null; is_general: boolean },
): string {
  return conversation.is_general ? space.name : `${space.name} · ${conversation.title ?? 'Topic'}`;
}

/** The conversation everyone in the space is in. */
export async function generalOf(db: Q, spaceId: string) {
  return db
    .selectFrom('conversations')
    .selectAll()
    .where('space_id', '=', spaceId)
    .where('is_general', '=', true)
    .executeTakeFirstOrThrow();
}

/**
 * An account is going: each space it owns passes to whoever is next in line (core
 * nextSpaceOwner), and a space nobody else is in closes. Runs before the account row goes.
 */
export async function handOverSpaces(trx: Q, userId: string, now: Date): Promise<void> {
  const owned = await trx
    .selectFrom('space_members')
    .select('space_id')
    .where('user_id', '=', userId)
    .where('role', '=', 'owner')
    .where('left_at', 'is', null)
    .execute();
  if (owned.length === 0) return;
  // Step down first: a space has one owner at a time.
  await trx
    .updateTable('space_members')
    .set({ role: 'member' })
    .where('user_id', '=', userId)
    .where('role', '=', 'owner')
    .execute();
  for (const { space_id } of owned) {
    const members = await trx
      .selectFrom('space_members')
      .select(['user_id', 'role', 'joined_at'])
      .where('space_id', '=', space_id)
      .where('left_at', 'is', null)
      .execute();
    const heir = nextSpaceOwner(
      members.map((m) => ({
        userId: m.user_id,
        role: m.role,
        joinedAt: m.joined_at.toISOString(),
      })),
      userId,
    );
    if (!heir) {
      await trx
        .updateTable('spaces')
        .set({ archived_at: now })
        .where('id', '=', space_id)
        .execute();
      continue;
    }
    await trx
      .updateTable('space_members')
      .set({ role: 'owner' })
      .where('space_id', '=', space_id)
      .where('user_id', '=', heir)
      .execute();
    const general = await generalOf(trx, space_id);
    await trx
      .updateTable('participants')
      .set({ role: 'owner' })
      .where('conversation_id', '=', general.id)
      .where('user_id', '=', heir)
      .execute();
  }
}
