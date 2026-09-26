/**
 * Person views for many people at once, in a fixed number of queries. Used by lists (inbox,
 * connections) where per-person lookups would be N×4 round trips.
 */
import { type RelationshipPolicy, resolvePolicy, type Sphere } from '@caishy/core';
import type { AppContext } from '../context';
import type { User } from '../db/schema';
import { verifiedOrgNames } from './orgs';
import { pairKey } from './relations';
import { type PersonView, personView, type ViewerRelation } from './users';

export async function personViewsFor(
  ctx: AppContext,
  viewerId: string,
  ownerIds: string[],
): Promise<Map<string, PersonView>> {
  const ids = [...new Set(ownerIds.filter((id) => id !== viewerId))];
  const out = new Map<string, PersonView>();
  if (ids.length === 0) return out;
  const now = ctx.now();
  const [users, blocks, connections, theirRels, policies, sides, defaults, verified] =
    await Promise.all([
      ctx.db.selectFrom('users').selectAll().where('id', 'in', ids).execute(),
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
      ctx.db
        .selectFrom('connection_sides')
        .innerJoin('identities', 'identities.id', 'connection_sides.identity_id')
        .select([
          'connection_sides.owner_id',
          'identities.display_name',
          'identities.headline',
          'identities.org_name',
        ])
        .where('connection_sides.owner_id', 'in', ids)
        .where('connection_sides.other_id', '=', viewerId)
        .execute(),
      ctx.db
        .selectFrom('identities')
        .select(['user_id', 'display_name', 'headline', 'org_name'])
        .where('user_id', 'in', ids)
        .where('is_default', '=', true)
        .execute(),
      verifiedOrgNames(ctx.db, ids),
    ]);
  const byId = new Map<string, User>(users.map((u) => [u.id, u]));
  for (const id of ids) {
    const u = byId.get(id);
    if (!u) continue;
    const conn = connections.find(
      (c) => pairKey(c.user_a, c.user_b).key === pairKey(id, viewerId).key,
    );
    const rels = theirRels.filter((r) => r.owner_id === id);
    const theirPolicies: RelationshipPolicy[] = policies
      .filter((p) => p.user_id === id)
      .map((p) => ({
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
      blocked: blocks.some((b) => b.blocker_id === id || b.blocked_id === id),
      ownerSpheresForViewer: rels.map((r) => r.sphere as Sphere),
      preset: resolvePolicy(theirPolicies, {
        sphere: (primary?.sphere as Sphere | undefined) ?? null,
        role: primary?.role ?? null,
        orgId: primary?.org_id ?? null,
        connectionId: conn?.id ?? null,
      }).privacy,
      sharesConversation: true,
      verifiedOrgName: verified.get(id) ?? null,
    };
    const side = sides.find((s) => s.owner_id === id);
    const def = defaults.find((d) => d.user_id === id);
    const identity = side
      ? { displayName: side.display_name, headline: side.headline, orgName: side.org_name }
      : def
        ? { displayName: def.display_name, headline: def.headline, orgName: def.org_name }
        : null;
    out.set(id, personView(u, relation, now, identity));
  }
  return out;
}
