/**
 * Onto a verified organization's team by an address at its domain (M16 C3b): the one route, for
 * an adult person whose proven address is there, through the one way onto a team (`seatOnTeam`).
 * Whether its domain takes people is its owner's and admins' to say (`PATCH /orgs/:id`).
 */
import type { OrgJoinResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { MANAGING_ROLES } from '@caime/core/permissions';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { domainStanding } from '../lib/domain-join';
import { forbidden } from '../lib/errors';
import { notify } from '../lib/notify';
import { orgById, orgSeat, seatOnTeam } from '../lib/orgs';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function domainJoinRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/orgs/:id/join', async (req): Promise<OrgJoinResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    ctx.limiter.hit(`team-join:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    const org = await orgById(ctx.db, id);
    if (await orgSeat(ctx.db, auth.userId, org.id))
      return { orgId: org.id, handle: org.handle, already: true };
    const me = await ctx.db
      .selectFrom('users')
      .select(['kind', 'display_name', 'birth_date', 'time_zone'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    // Teams are for people (an app's bot joins through its app), and for adults (R29).
    if (me.kind !== 'human' || minorOf(me, ctx.now()))
      throw forbidden(tr('Teams are for people over 18.'));
    const standing = await domainStanding(ctx.db, org, auth.userId, ctx.now());
    if (!standing.joinableAs)
      throw forbidden(
        standing.joinOnceConfirmed
          ? tr('Confirm your address first: it’s what lets you join.')
          : tr('No address of yours lets you join this team.'),
      );
    const added = await seatOnTeam(ctx, org.id, [auth.userId], 'agent', null);
    if (added.length === 0) return { orgId: org.id, handle: org.handle, already: true };
    // Who came in and how, never by which address.
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.members_added',
      target: org.id,
      metadata: { userIds: added, byDomain: true },
    });
    ctx.metrics.teamJoins.inc({ by: 'domain' });
    // Whoever runs it hears who came in by its domain, and opens its page from it.
    const managers = await ctx.db
      .selectFrom('org_members as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select('m.user_id')
      .where('m.org_id', '=', org.id)
      .where('m.left_at', 'is', null)
      .where('m.role', 'in', MANAGING_ROLES)
      .where('u.kind', '=', 'human')
      .execute();
    const name = me.display_name;
    for (const m of managers)
      await notify(ctx, {
        userId: m.user_id,
        kind: 'business',
        level: 'activity',
        title: () => tr('{name} joined {org}’s team', { name, org: org.name }),
        data: { handle: org.handle, orgId: org.id },
        groupKey: `team:${org.id}`,
      });
    return { orgId: org.id, handle: org.handle, already: false };
  });
}
