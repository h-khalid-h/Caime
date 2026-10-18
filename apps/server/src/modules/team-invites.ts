/**
 * Team invites (M16 C3a, review 2026-10-17 §1 H3): an organization's owner or admins make a link
 * to share, or send one to an address, and whoever accepts it is on the team in the role it
 * gives. The making, listing and taking back are the team's; opening and accepting are for a
 * signed-in adult, who joins through `seatOnTeam` as anyone added does. What a visitor without
 * an account sees is the `/t/<token>` page (`lib/public-pages.ts`).
 */

import { ownsOrg, TeamInviteBody } from '@caime/core';
import type {
  OkResponse,
  TeamInviteAcceptResponse,
  TeamInviteMadeResponse,
  TeamInviteOpenResponse,
  TeamInvitesResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { orgAvatarUrl } from '../lib/business';
import { badRequest, forbidden, mailUnavailable, notFound } from '../lib/errors';
import { notify } from '../lib/notify';
import { managerSeat, orgById, orgSeat, seatOnTeam } from '../lib/orgs';
import {
  addressedTo,
  liveTeamInvite,
  makeTeamInvite,
  openTeamInviteCount,
  openTeamInvites,
  revokeTeamInvite,
  spendTeamInvite,
  TEAM_INVITES_OPEN,
  teamInviteMail,
  teamInviteUrl,
  teamInviteView,
} from '../lib/team-invites';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function teamInviteRoutes(app: FastifyInstance, ctx: AppContext) {
  const idParam = z.object({ id: z.string().uuid() });
  const inviteParam = z.object({ id: z.string().uuid(), inviteId: z.string().uuid() });
  const tokenParam = z.object({ token: z.string().min(1).max(64) });

  app.post('/orgs/:id/invites', async (req): Promise<TeamInviteMadeResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const body = parse(TeamInviteBody, req.body);
    const org = await orgById(ctx.db, id);
    const seat = await managerSeat(ctx.db, auth.userId, id);
    if (body.role === 'admin' && !ownsOrg(seat.role))
      throw forbidden(tr('Only the owner makes admins.'));
    ctx.limiter.hit(`team-invite:${auth.userId}`, ctx.config.isTest ? 1000 : 30, 3_600_000);
    const email = body.email?.toLowerCase() ?? null;
    // An address is mailed its link after the response; without a mailer there's no sending one.
    const mail = ctx.mail;
    if (email && !mail) throw mailUnavailable();
    if ((await openTeamInviteCount(ctx, id)) >= TEAM_INVITES_OPEN)
      throw badRequest(tr('{n} invites are open: take one back first.', { n: TEAM_INVITES_OPEN }));
    const { invite, token } = await makeTeamInvite(ctx, id, auth.userId, body.role, email);
    const url = teamInviteUrl(ctx, token);
    if (email && mail) {
      const me = await ctx.db
        .selectFrom('users')
        .select('display_name')
        .where('id', '=', auth.userId)
        .executeTakeFirstOrThrow();
      const letter = teamInviteMail(
        email,
        me.display_name,
        org.name,
        body.role,
        url,
        invite.expires_at,
      );
      ctx.defer('email.team-invite', () => mail.send(letter));
    }
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.invite_made',
      target: id,
      // Never the token, nor the address: the invite's id says which.
      metadata: { inviteId: invite.id, role: body.role, byEmail: email !== null },
    });
    return { invite: teamInviteView(invite), url };
  });

  app.get('/orgs/:id/invites', async (req): Promise<TeamInvitesResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await orgById(ctx.db, id);
    await managerSeat(ctx.db, auth.userId, id);
    return { invites: (await openTeamInvites(ctx, id)).map(teamInviteView) };
  });

  app.delete('/orgs/:id/invites/:inviteId', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id, inviteId } = parse(inviteParam, req.params);
    await orgById(ctx.db, id);
    await managerSeat(ctx.db, auth.userId, id);
    if (!(await revokeTeamInvite(ctx, id, inviteId))) throw notFound(tr('That invite'));
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.invite_revoked',
      target: id,
      metadata: { inviteId },
    });
    return { ok: true };
  });

  /** What an invite offers whoever opened it signed in: the organization, the role, who asks. */
  app.get('/team-invites/:token', async (req): Promise<TeamInviteOpenResponse> => {
    const auth = requireAuth(req);
    const { token } = parse(tokenParam, req.params);
    const invite = await liveTeamInvite(ctx, token);
    if (!invite) throw notFound(tr('That invite'));
    const org = await orgById(ctx.db, invite.org_id);
    const inviter = invite.created_by
      ? await ctx.db
          .selectFrom('users')
          .select('display_name')
          .where('id', '=', invite.created_by)
          .where('deleted_at', 'is', null)
          .executeTakeFirst()
      : undefined;
    return {
      invite: {
        org: {
          id: org.id,
          name: org.name,
          handle: org.handle,
          kind: org.kind,
          avatarUrl: orgAvatarUrl(org),
          verified: org.verified_at !== null,
        },
        role: invite.role,
        invitedBy: inviter?.display_name ?? null,
        onTeam: (await orgSeat(ctx.db, auth.userId, org.id)) !== null,
        addressed: await addressedTo(ctx, invite, auth.userId),
        expiresAt: invite.expires_at.toISOString(),
      },
    };
  });

  app.post('/team-invites/:token/accept', async (req): Promise<TeamInviteAcceptResponse> => {
    const auth = requireAuth(req);
    const { token } = parse(tokenParam, req.params);
    ctx.limiter.hit(`team-join:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    const invite = await liveTeamInvite(ctx, token);
    if (!invite) throw notFound(tr('That invite'));
    const org = await orgById(ctx.db, invite.org_id);
    if (await orgSeat(ctx.db, auth.userId, org.id))
      return { orgId: org.id, handle: org.handle, already: true };
    const me = await ctx.db
      .selectFrom('users')
      .select(['kind', 'display_name', 'birth_date', 'time_zone', 'age_minor_until'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    // Teams are for people (an app's bot joins through its app), and for adults (R29).
    if (me.kind !== 'human') throw forbidden(tr('Teams are for people over 18.'));
    if (minorOf(me, ctx.now())) throw forbidden(tr('Teams are for people over 18.'));
    const addressed = await addressedTo(ctx, invite, auth.userId);
    if (addressed === 'unconfirmed')
      throw forbidden(tr('Confirm your address first: the invite was sent to it.'));
    if (addressed === 'elsewhere')
      throw forbidden(
        tr('This invite was sent to another address: sign in with it, or add it to your account.'),
      );
    const added = await seatOnTeam(ctx, org.id, [auth.userId], invite.role, invite.created_by);
    if (added.length === 0) return { orgId: org.id, handle: org.handle, already: true };
    await spendTeamInvite(ctx, invite);
    ctx.metrics.teamJoins.inc({ by: 'invite' });
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.members_added',
      target: org.id,
      metadata: { userIds: added, inviteId: invite.id },
    });
    // Whoever asked hears it worked, while they're on the team, and opens its page from it.
    if (
      invite.created_by &&
      invite.created_by !== auth.userId &&
      (await orgSeat(ctx.db, invite.created_by, org.id))
    ) {
      const name = me.display_name;
      await notify(ctx, {
        userId: invite.created_by,
        kind: 'business',
        level: 'activity',
        title: () => tr('{name} joined {org}’s team', { name, org: org.name }),
        data: { handle: org.handle, orgId: org.id },
        groupKey: `team:${org.id}`,
      });
    }
    return { orgId: org.id, handle: org.handle, already: false };
  });
}
