/**
 * How two accounts relate: connection, requests, blocks, and each side's private relationships.
 * A relationship is only ever returned to its owner (ADR-10); other code gets spheres for
 * evaluating that owner's own privacy rules and never sends them anywhere.
 */
import {
  type PolicyTarget,
  type RelationshipPolicy,
  relationshipFit,
  relationshipLabel,
  resolvePolicy,
  type Sphere,
} from '@caishy/core';
import type { Kysely, Transaction } from 'kysely';
import type { Database, Relationship } from '../db/schema';
import type { ViewerRelation } from './users';

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
  const rows = await db
    .selectFrom('relationship_policies')
    .selectAll()
    .where('user_id', '=', userId)
    .execute();
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    scope: {
      sphere: (p.scope_sphere as Sphere | null) ?? null,
      role: p.scope_role,
      orgId: p.scope_org_id,
      connectionId: p.scope_connection_id,
    },
    settings: p.settings as RelationshipPolicy['settings'],
  }));
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
    return { isSelf: true, isConnected: true, blocked: false, ownerSpheresForViewer: [] };
  const [b, spheres, policies, primary] = await Promise.all([
    between(db, viewerId, ownerId),
    ownerSpheresFor(db, ownerId, viewerId),
    loadPolicies(db, ownerId),
    activeRelationships(db, ownerId, [viewerId]),
  ]);
  const preset = resolvePolicy(policies, policyTargetFor(primary[0], b.connectionId)).privacy;
  return {
    isSelf: false,
    isConnected: b.connected,
    blocked: b.blockedByMe || b.blockedMe,
    ownerSpheresForViewer: spheres,
    preset,
  };
}

export function relationshipView(r: Relationship) {
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

export type RelationshipView = ReturnType<typeof relationshipView>;

/**
 * Mutual confirmation (PRD §53): only when both sides chose to share their classification.
 * Returns their label (which they shared) and how the two views fit.
 */
export async function mutualFit(db: Q, me: string, other: string, mine: Relationship | undefined) {
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
