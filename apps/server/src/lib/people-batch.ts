/**
 * Person views for many people at once, in a fixed number of queries. Used by lists (inbox,
 * connections) where per-person lookups would be N×4 round trips.
 */
import { type RelationshipPolicy, resolvePolicy, type Sphere } from '@caime/core';
import type { AppContext } from '../context';
import type { UserRow } from '../db/schema';
import { USER_COLUMNS } from '../db/schema';
import { verifiedOrgNames } from './orgs';
import { pairKey } from './relations';
import { type PersonView, personView, type ViewerRelation } from './users';

export async function personViewsFor(
  ctx: AppContext,
  viewerId: string,
  ownerIds: string[],
  /** A list of people the viewer shares a conversation with (the default), or strangers found (R79). */
  opts: { sharesConversation?: boolean } = {},
): Promise<Map<string, PersonView>> {
  const ids = [...new Set(ownerIds.filter((id) => id !== viewerId))];
  const out = new Map<string, PersonView>();
  if (ids.length === 0) return out;
  const now = ctx.now();
  const [users, blocks, connections, theirRels, policies, verified] = await Promise.all([
    ctx.db.selectFrom('users').select(USER_COLUMNS).where('id', 'in', ids).execute(),
    ctx.db
      .selectFrom('blocks')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb.and([eb('blocker_id', '=', viewerId), eb('blocked_id', 'in', ids)]),
          eb.and([eb('blocked_id', '=', viewerId), eb('blocker_id', 'in', ids)]),
        ]),
      )
      .execute(),
    ctx.db
      .selectFrom('connections')
      .select(['id', 'user_a', 'user_b'])
      .where('status', '=', 'active')
      .where((eb) =>
        eb.or([
          eb.and([eb('user_a', '=', viewerId), eb('user_b', 'in', ids)]),
          eb.and([eb('user_b', '=', viewerId), eb('user_a', 'in', ids)]),
        ]),
      )
      .execute(),
    ctx.db
      .selectFrom('relationships')
      .selectAll()
      .where('owner_id', 'in', ids)
      .where('subject_id', '=', viewerId)
      .where('status', '=', 'active')
      .orderBy('is_primary', 'desc')
      .execute(),
    ctx.db.selectFrom('relationship_policies').selectAll().where('user_id', 'in', ids).execute(),
    verifiedOrgNames(ctx.db, ids),
  ]);
  const byId = new Map<string, UserRow>(users.map((u) => [u.id, u]));
  // Each list read once into a map: a person's row is found, never searched for.
  const connectionOf = new Map(connections.map((c) => [pairKey(c.user_a, c.user_b).key, c]));
  const relsOf = new Map<string, typeof theirRels>();
  for (const r of theirRels) relsOf.set(r.owner_id, [...(relsOf.get(r.owner_id) ?? []), r]);
  const policiesOf = new Map<string, typeof policies>();
  for (const p of policies) policiesOf.set(p.user_id, [...(policiesOf.get(p.user_id) ?? []), p]);
  const blockedIds = new Set(blocks.flatMap((b) => [b.blocker_id, b.blocked_id]));
  for (const id of ids) {
    const u = byId.get(id);
    if (!u) continue;
    const conn = connectionOf.get(pairKey(id, viewerId).key);
    const rels = relsOf.get(id) ?? [];
    const theirPolicies: RelationshipPolicy[] = (policiesOf.get(id) ?? []).map((p) => ({
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
    const primary = rels[0];
    const relation: ViewerRelation = {
      isSelf: false,
      isConnected: Boolean(conn),
      blocked: blockedIds.has(id),
      ownerSpheresForViewer: rels.map((r) => r.sphere as Sphere),
      preset: resolvePolicy(theirPolicies, {
        sphere: (primary?.sphere as Sphere | undefined) ?? null,
        role: primary?.role ?? null,
        orgId: primary?.org_id ?? null,
        connectionId: conn?.id ?? null,
      }).privacy,
      sharesConversation: opts.sharesConversation ?? true,
      verifiedOrgName: verified.get(id) ?? null,
    };
    out.set(id, personView(u, relation, now));
  }
  return out;
}
