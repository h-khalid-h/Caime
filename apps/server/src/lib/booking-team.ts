/** The people on an organization's team (never its bots or agent), for bookings (R58). */
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';

export async function humanTeam(
  db: Kysely<Database>,
  orgId: string,
): Promise<Array<{ id: string; display_name: string }>> {
  return db
    .selectFrom('org_members as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['u.id', 'u.display_name'])
    .where('m.org_id', '=', orgId)
    .where('m.left_at', 'is', null)
    .where('u.kind', '=', 'human')
    .where('u.deleted_at', 'is', null)
    .execute();
}
