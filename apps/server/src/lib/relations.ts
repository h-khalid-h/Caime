/**
 * How two accounts relate: connection, requests, blocks, and each side's private relationships.
 * A relationship is only ever returned to its owner (ADR-10); other code gets spheres for
 * evaluating that owner's own privacy rules and never sends them anywhere.
 */
import {
  type MutualFit,
  type PolicyTarget,
  type RelationshipPolicy,
  type RelationshipView,
  readReceiptsVisible,
  relationshipFit,
  relationshipLabel,
  resolvePolicy,
  type Sphere,
} from '@caime/core';
import type { Kysely, Transaction } from 'kysely';
import type { Database, Relationship, User } from '../db/schema';
import { verifiedOrgNames } from './orgs';
import { privacyOf, type ViewerRelation } from './users';

type Q = Kysely<Database> | Transaction<Database>;

export function pairKey(a: string, b: string): { low: string; high: string; key: string } {
  const [low, high] = a < b ? [a, b] : [b, a];
  return { low, high, key: `${low}:${high}` };
}

export interface Between {
  connectionId: string | null;
  connected: boolean;
  outgoingRequestId: string | null;
  incomingRequestId: string | null;
  blockedByMe: boolean;
  blockedMe: boolean;
}

export async function between(db: Q, me: string, other: string): Promise<Between> {
  const { low, high } = pairKey(me, other);
  const [conn, requests, blocks] = await Promise.all([
    db
      .selectFrom('connections')
      .select(['id', 'status'])
      .where('user_a', '=', low)
      .where('user_b', '=', high)
      .executeTakeFirst(),
    db
      .selectFrom('connection_requests')
      .select(['id', 'from_user'])
      .where('status', '=', 'pending')
      .where((eb) =>
        eb.or([
          eb.and([eb('from_user', '=', me), eb('to_user', '=', other)]),
          eb.and([eb('from_user', '=', other), eb('to_user', '=', me)]),
        ]),
      )
      .execute(),
    db
      .selectFrom('blocks')
      .select(['blocker_id'])
      .where((eb) =>
        eb.or([
          eb.and([eb('blocker_id', '=', me), eb('blocked_id', '=', other)]),
          eb.and([eb('blocker_id', '=', other), eb('blocked_id', '=', me)]),
        ]),
      )
      .execute(),
  ]);
  const connected = conn?.status === 'active';
  return {
    connectionId: connected ? conn!.id : null,
    connected,
    outgoingRequestId: requests.find((r) => r.from_user === me)?.id ?? null,
    incomingRequestId: requests.find((r) => r.from_user === other)?.id ?? null,
    blockedByMe: blocks.some((b) => b.blocker_id === me),
    blockedMe: blocks.some((b) => b.blocker_id === other),
  };
}

/** The pair's connection while it's active: what a rule just for one person is scoped by. */
export async function activeConnectionId(db: Q, a: string, b: string): Promise<string | null> {
  const { low, high } = pairKey(a, b);
  const row = await db
    .selectFrom('connections')
    .select('id')
    .where('user_a', '=', low)
    .where('user_b', '=', high)
    .where('status', '=', 'active')
    .executeTakeFirst();
  return row?.id ?? null;
}

export async function isBlockedEitherWay(db: Q, a: string, b: string): Promise<boolean> {
  const row = await db
    .selectFrom('blocks')
    .select('blocker_id')
    .where((eb) =>
      eb.or([
        eb.and([eb('blocker_id', '=', a), eb('blocked_id', '=', b)]),
        eb.and([eb('blocker_id', '=', b), eb('blocked_id', '=', a)]),
      ]),
    )
    .executeTakeFirst();
  return Boolean(row);
}

/** Do `a` and `b` share at least one active connection (friend of a friend)? */
export async function shareAConnection(db: Q, a: string, b: string): Promise<boolean> {
  const row = await db
    .selectFrom('connection_sides as x')
    .innerJoin('connection_sides as y', 'y.other_id', 'x.other_id')
    .innerJoin('connections as cx', 'cx.id', 'x.connection_id')
    .innerJoin('connections as cy', 'cy.id', 'y.connection_id')
    .select('x.other_id')
    .where('x.owner_id', '=', a)
    .where('y.owner_id', '=', b)
    .where('cx.status', '=', 'active')
    .where('cy.status', '=', 'active')
    .limit(1)
    .executeTakeFirst();
  return Boolean(row);
}

export async function activeRelationships(
  db: Q,
  ownerId: string,
  subjectIds: string[],
): Promise<Relationship[]> {
  if (subjectIds.length === 0) return [];
  return db
    .selectFrom('relationships')
    .selectAll()
    .where('owner_id', '=', ownerId)
    .where('subject_id', 'in', subjectIds)
    .where('status', '=', 'active')
    .orderBy('is_primary', 'desc')
    .orderBy('created_at', 'asc')
    .execute();
}

/** The owner's spheres for the viewer, to evaluate the owner's privacy rules. Never exposed. */
export async function ownerSpheresFor(db: Q, ownerId: string, viewerId: string): Promise<Sphere[]> {
  const rows = await db
    .selectFrom('relationships')
    .select('sphere')
    .where('owner_id', '=', ownerId)
    .where('subject_id', '=', viewerId)
    .where('status', '=', 'active')
    .execute();
  return rows.map((r) => r.sphere as Sphere);
}

export async function loadPolicies(db: Q, userId: string): Promise<RelationshipPolicy[]> {
  return (await loadPoliciesFor(db, [userId])).get(userId) ?? [];
}

/** Several people's rules in one query (a fan-out), each list in `loadPolicies`' order. */
export async function loadPoliciesFor(
  db: Q,
  userIds: string[],
): Promise<Map<string, RelationshipPolicy[]>> {
  const out = new Map<string, RelationshipPolicy[]>(userIds.map((id) => [id, []]));
  if (!userIds.length) return out;
  // Oldest first, always the same order: two rules never apply by chance of storage.
  const rows = await db
    .selectFrom('relationship_policies')
    .selectAll()
    .where('user_id', 'in', userIds)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  for (const p of rows)
    out.get(p.user_id)?.push({
      id: p.id,
      name: p.name,
      scope: {
        sphere: (p.scope_sphere as Sphere | null) ?? null,
        role: p.scope_role,
        orgId: p.scope_org_id,
        connectionId: p.scope_connection_id,
      },
      settings: p.settings as RelationshipPolicy['settings'],
    });
  return out;
}

/** The active connection between `me` and each of `others`, by the other's id, in one query. */
export async function activeConnectionIds(
  db: Q,
  me: string,
  others: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!others.length) return out;
  const rows = await db
    .selectFrom('connections')
    .select(['id', 'user_a', 'user_b'])
    .where('status', '=', 'active')
    .where((eb) =>
      eb.or([
        eb.and([eb('user_a', '=', me), eb('user_b', 'in', others)]),
        eb.and([eb('user_b', '=', me), eb('user_a', 'in', others)]),
      ]),
    )
    .execute();
  for (const r of rows) out.set(r.user_a === me ? r.user_b : r.user_a, r.id);
  return out;
}

/** The owner's effective policy for one person, from the owner's primary relationship. */
export function policyTargetFor(
  primary: Relationship | undefined,
  connectionId: string | null,
): PolicyTarget {
  return {
    sphere: (primary?.sphere as Sphere | undefined) ?? null,
    role: primary?.role ?? null,
    orgId: primary?.org_id ?? null,
    connectionId,
  };
}

export async function viewerRelation(
  db: Q,
  ownerId: string,
  viewerId: string,
): Promise<ViewerRelation> {
  if (ownerId === viewerId)
    return {
      isSelf: true,
      isConnected: true,
      blocked: false,
      ownerSpheresForViewer: [],
      verifiedOrgName: (await verifiedOrgNames(db, [ownerId])).get(ownerId) ?? null,
    };
  const [b, spheres, policies, primary, verified] = await Promise.all([
    between(db, viewerId, ownerId),
    ownerSpheresFor(db, ownerId, viewerId),
    loadPolicies(db, ownerId),
    activeRelationships(db, ownerId, [viewerId]),
    verifiedOrgNames(db, [ownerId]),
  ]);
  const preset = resolvePolicy(policies, policyTargetFor(primary[0], b.connectionId)).privacy;
  return {
    isSelf: false,
    isConnected: b.connected,
    blocked: b.blockedByMe || b.blockedMe,
    ownerSpheresForViewer: spheres,
    preset,
    verifiedOrgName: verified.get(ownerId) ?? null,
  };
}

export function relationshipView(r: Relationship): RelationshipView {
  return {
    id: r.id,
    sphere: r.sphere as Sphere,
    role: r.role,
    roleLabel: r.role_label,
    orgName: r.org_name,
    contextNote: r.context_note,
    label: relationshipLabel({
      sphere: r.sphere as Sphere,
      role: r.role,
      roleLabel: r.role_label,
      orgName: r.org_name,
      status: r.status === 'ended' ? 'ended' : 'active',
    }),
    status: r.status,
    isPrimary: r.is_primary,
    shared: r.shared,
    source: r.source,
    startedAt: r.started_at.toISOString(),
    endedAt: r.ended_at?.toISOString() ?? null,
  };
}

export type { RelationshipView };

/**
 * Mutual confirmation (PRD §53): only when both sides chose to share their classification.
 * Returns their label (which they shared) and how the two views fit.
 */
export async function mutualFit(
  db: Q,
  me: string,
  other: string,
  mine: Relationship | undefined,
): Promise<MutualFit | null> {
  if (!mine?.shared) return null;
  const theirs = await db
    .selectFrom('relationships')
    .selectAll()
    .where('owner_id', '=', other)
    .where('subject_id', '=', me)
    .where('status', '=', 'active')
    .where('shared', '=', true)
    .orderBy('is_primary', 'desc')
    .executeTakeFirst();
  if (!theirs) return null;
  const fit = relationshipFit(
    { sphere: mine.sphere as Sphere, role: mine.role },
    { sphere: theirs.sphere as Sphere, role: theirs.role },
  );
  return {
    fit,
    theirLabel: relationshipLabel({
      sphere: theirs.sphere as Sphere,
      role: theirs.role,
      roleLabel: theirs.role_label,
      orgName: theirs.org_name,
    }),
  };
}

/**
 * Whether `viewer` may see `reader`'s read position. Reciprocal (R25): both must share read
 * receipts with each other under their own rules. Every path that reveals a read position —
 * the conversation view and the live receipts event — goes through this one check.
 */
export async function readReceiptVisibleTo(
  db: Q,
  now: Date,
  reader: User,
  viewer: User,
): Promise<boolean> {
  return (await readReceiptsVisibleTo(db, now, reader, [viewer])).has(viewer.id);
}

/**
 * Which of `viewers` may see `reader`'s read position, decided for them all at once: both
 * sides' connections, blocks, relationships, rules and verified organizations in five queries
 * for a whole group, instead of ten per member. The rule is `readReceiptsVisible` (R25), the
 * same one `readReceiptVisibleTo` applies to one.
 */
export async function readReceiptsVisibleTo(
  db: Q,
  now: Date,
  reader: User,
  viewers: User[],
): Promise<Set<string>> {
  const visible = new Set<string>();
  const others = viewers.filter((v) => v.id !== reader.id);
  if (viewers.length > others.length) visible.add(reader.id);
  if (!others.length) return visible;
  const ids = others.map((v) => v.id);
  const everyone = [reader.id, ...ids];
  const [connections, blocks, rels, policies, verified] = await Promise.all([
    activeConnectionIds(db, reader.id, ids),
    db
      .selectFrom('blocks')
      .select(['blocker_id', 'blocked_id'])
      .where((eb) =>
        eb.or([
          eb.and([eb('blocker_id', '=', reader.id), eb('blocked_id', 'in', ids)]),
          eb.and([eb('blocked_id', '=', reader.id), eb('blocker_id', 'in', ids)]),
        ]),
      )
      .execute(),
    db
      .selectFrom('relationships')
      .selectAll()
      .where('status', '=', 'active')
      .where((eb) =>
        eb.or([
          eb.and([eb('owner_id', '=', reader.id), eb('subject_id', 'in', ids)]),
          eb.and([eb('subject_id', '=', reader.id), eb('owner_id', 'in', ids)]),
        ]),
      )
      .orderBy('is_primary', 'desc')
      .orderBy('created_at', 'asc')
      .execute(),
    loadPoliciesFor(db, everyone),
    verifiedOrgNames(db, everyone),
  ]);
  const blockedWith = new Set<string>();
  for (const b of blocks) blockedWith.add(b.blocker_id === reader.id ? b.blocked_id : b.blocker_id);
  // How `owner` sees `viewer`, from what was loaded: one of the two is always the reader.
  const relation = (owner: User, viewer: User): ViewerRelation => {
    const other = owner.id === reader.id ? viewer.id : owner.id;
    const mine = rels.filter((r) => r.owner_id === owner.id && r.subject_id === viewer.id);
    const connectionId = connections.get(other) ?? null;
    return {
      isSelf: false,
      isConnected: connectionId !== null,
      blocked: blockedWith.has(other),
      ownerSpheresForViewer: mine.map((r) => r.sphere as Sphere),
      preset: resolvePolicy(policies.get(owner.id) ?? [], policyTargetFor(mine[0], connectionId))
        .privacy,
      verifiedOrgName: verified.get(owner.id) ?? null,
    };
  };
  const readerPrivacy = privacyOf(reader, now);
  for (const viewer of others)
    if (
      readReceiptsVisible(
        { settings: readerPrivacy, viewerAsSeenByOwner: relation(reader, viewer) },
        { settings: privacyOf(viewer, now), ownerAsSeenByViewer: relation(viewer, reader) },
      )
    )
      visible.add(viewer.id);
  return visible;
}
