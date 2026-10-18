import {
  findRole,
  isSphere,
  type RelationshipInputT,
  SPHERE_DEFS,
  type Sphere,
  uuidv7,
} from '@caime/core';
import { lower, tr } from '@caime/core/i18n';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database, Relationship } from '../db/schema';
import { badRequest } from './errors';
import { recordEvent } from './events';
import { between, pairKey } from './relations';

type Q = Kysely<Database> | Transaction<Database>;

/** How many places someone knows people from are offered to pick. */

export function snapshot(
  r: Pick<
    Relationship,
    'sphere' | 'role' | 'role_label' | 'org_name' | 'context_note' | 'shared' | 'status'
  >,
) {
  return {
    sphere: r.sphere,
    role: r.role,
    roleLabel: r.role_label,
    orgName: r.org_name,
    contextNote: r.context_note,
    shared: r.shared,
    status: r.status,
  };
}

export function validateRole(
  sphere: Sphere,
  role: string | null | undefined,
  roleLabel: string | null | undefined,
) {
  if (!isSphere(sphere)) throw badRequest(tr('Unknown sphere.'));
  if (role && !findRole(sphere, role))
    throw badRequest(
      tr('“{role}” isn’t a {sphere} role. Use a custom role instead.', {
        role,
        sphere: lower(tr(SPHERE_DEFS[sphere].label)),
      }),
    );
  if (role && roleLabel) throw badRequest(tr('Choose a role or write your own, not both.'));
}

/** May `owner` classify `subject`? Connected, requested either way, or sharing a conversation. */
/** Whether someone may say how they know another: never someone who blocked them. */
export async function mayClassify(db: Q, owner: string, subject: string): Promise<boolean> {
  const b = await between(db, owner, subject);
  if (b.blockedMe) return false;
  if (b.connected || b.outgoingRequestId || b.incomingRequestId) return true;
  const shared = await db
    .selectFrom('participants as a')
    .innerJoin('participants as b', 'b.conversation_id', 'a.conversation_id')
    .select('a.conversation_id')
    .where('a.user_id', '=', owner)
    .where('b.user_id', '=', subject)
    .limit(1)
    .executeTakeFirst();
  return Boolean(shared);
}

/**
 * Where someone is known from, as the person already writes it: a place they've named before or
 * an organization they're on the team of ("data c" is their "DATA C"), else as it's typed. One
 * organization is never two for a difference of case or spacing.
 */
export async function theirOrganization(
  db: Q,
  ownerId: string,
  typed: string | null | undefined,
): Promise<string | null> {
  const name = typed?.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  const named = await db
    .selectFrom('relationships')
    .select(sql<string>`min(org_name)`.as('name'))
    .where('owner_id', '=', ownerId)
    .where(sql<boolean>`lower(org_name) = ${name.toLowerCase()}`)
    .executeTakeFirst();
  if (named?.name) return named.name;
  const team = await db
    .selectFrom('org_members as m')
    .innerJoin('organizations as o', 'o.id', 'm.org_id')
    .select(sql<string>`min(o.name)`.as('name'))
    .where('m.user_id', '=', ownerId)
    .where('m.left_at', 'is', null)
    .where(sql<boolean>`lower(o.name) = ${name.toLowerCase()}`)
    .executeTakeFirst();
  return team?.name ?? name;
}

export async function createRelationship(
  db: Q,
  ctx: AppContext,
  ownerId: string,
  subjectId: string,
  input: RelationshipInputT,
  opts: {
    source: Relationship['source'];
    connectionId?: string | null;
    primary?: boolean;
    /** False when this row supersedes another: the caller records one "changed" event instead. */
    recordCreated?: boolean;
  } = {
    source: 'user',
  },
): Promise<Relationship> {
  validateRole(input.sphere, input.role, input.roleLabel);
  const active = await db
    .selectFrom('relationships')
    .select(['id', 'is_primary'])
    .where('owner_id', '=', ownerId)
    .where('subject_id', '=', subjectId)
    .where('status', '=', 'active')
    .execute();
  const makePrimary = opts.primary ?? !active.some((r) => r.is_primary);
  if (makePrimary && active.length) {
    await db
      .updateTable('relationships')
      .set({ is_primary: false })
      .where(
        'id',
        'in',
        active.map((r) => r.id),
      )
      .execute();
  }
  const connectionId =
    opts.connectionId ??
    (
      await db
        .selectFrom('connections')
        .select('id')
        .where('user_a', '=', pairKey(ownerId, subjectId).low)
        .where('user_b', '=', pairKey(ownerId, subjectId).high)
        .where('status', '=', 'active')
        .executeTakeFirst()
    )?.id ??
    null;
  const row = await db
    .insertInto('relationships')
    .values({
      id: uuidv7(),
      owner_id: ownerId,
      subject_id: subjectId,
      connection_id: connectionId,
      sphere: input.sphere,
      role: input.role ?? null,
      role_label: input.roleLabel ?? null,
      org_name: await theirOrganization(db, ownerId, input.orgName),
      context_note: input.contextNote ?? null,
      shared: input.shared ?? false,
      is_primary: makePrimary,
      source: opts.source,
      started_at: ctx.now(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  if (opts.recordCreated !== false)
    await db
      .insertInto('relationship_events')
      .values({
        id: uuidv7(),
        relationship_id: row.id,
        owner_id: ownerId,
        kind: 'created',
        after: JSON.stringify(snapshot(row)),
        at: ctx.now(),
      })
      .execute();
  await recordEvent(db, 'relationship.assigned', ownerId, { relationshipId: row.id, subjectId });
  // Said how they know them: what Caime offered about it is answered, here and on every device
  // (the relationship's own event says so).
  await db
    .updateTable('suggestions')
    .set({ status: 'expired', resolved_at: ctx.now() })
    .where('user_id', '=', ownerId)
    .where('subject_user_id', '=', subjectId)
    .where('kind', '=', 'relationship')
    .where('status', '=', 'pending')
    .execute();
  return row;
}
