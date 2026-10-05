/**
 * Organizations (PRD §35–36, §55, R15): a business, a shop, a clinic, a school, a nonprofit or a
 * public service, with its team. It verifies a domain with a DNS TXT record; until then it says
 * so, and nobody on its team shows as verified. Organizations and their teams are for adults.
 */

import type {
  OrgExportView,
  OrgInsightsView,
  OrgMemberView,
  OrgReclaimView,
  OrgSpaceView,
  OrgSummaryView,
  OrgView,
} from '@caime/core';
import {
  CreateOrgBody,
  canChangeOrgRole,
  canManageOrg,
  canRemoveFromOrg,
  nextOwner,
  normalizeDomain,
  OrgDomainBody,
  type OrgDoorView,
  OrgMemberBody,
  OrgMembersBody,
  type OrgRole,
  recordMatches,
  UpdateOrgBody,
  uuidv7,
  verificationRecord,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Organization } from '../db/schema';
import { activeAgent } from '../lib/agent';
import { audit } from '../lib/audit';
import { tellSaved } from '../lib/automations';
import { endBillingOf } from '../lib/billing';
import { orgBlocked } from '../lib/blocks';
import { bookingOf } from '../lib/booking';
import { joinThreads, leaveThreads, orgAvatarUrl } from '../lib/business';
import { qrPath } from '../lib/door';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { currencyOf, isCountry } from '../lib/geo';
import { assertHandleAvailable } from '../lib/handles';
import { orgInsights } from '../lib/insights';
import { applyOrgRetention, buildOrgExport, eraseBusinessConversation } from '../lib/org-data';
import {
  closedOrgById,
  closeOrg,
  newVerifyToken,
  orgById,
  orgSeat,
  orgSpacesOf,
} from '../lib/orgs';
import { personViewsFor } from '../lib/people-batch';
import { assertInsights, assertTeamRoom, orgPlanView } from '../lib/plans';
import { doorPath } from '../lib/public-pages';
import { viewerRelation } from '../lib/relations';
import { suggestFromPlace, withdrawPlaceOffers } from '../lib/suggest';
import { endFollowsOf } from '../lib/updates';
import { minorOf, personView } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { addToSpace, orgSpaceViews, removeFromSpace } from './spaces';

const ROLE_ORDER: Record<OrgRole, number> = { owner: 0, admin: 1, agent: 2 };

async function team(ctx: AppContext, orgId: string) {
  return ctx.db
    .selectFrom('org_members as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(['m.user_id', 'm.role', 'm.title', 'm.joined_at', 'u.kind'])
    .where('m.org_id', '=', orgId)
    .where('m.left_at', 'is', null)
    .orderBy('m.joined_at')
    .execute();
}

async function summaryOf(
  ctx: AppContext,
  org: Organization,
  myRole: OrgRole | null,
): Promise<OrgSummaryView> {
  // People: an app's bot is on the team, but isn't one of them.
  const { n } = await ctx.db
    .selectFrom('org_members as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('m.org_id', '=', org.id)
    .where('m.left_at', 'is', null)
    .where('u.kind', '=', 'human')
    .executeTakeFirstOrThrow();
  return {
    id: org.id,
    name: org.name,
    handle: org.handle,
    kind: org.kind,
    about: org.about,
    website: org.website,
    verified: org.verified_at !== null,
    verifiedDomain: org.verified_at ? org.domain : null,
    memberCount: n,
    myRole,
    country: org.country,
    currency: currencyOf(org.country),
    foundedYear: org.founded_year,
    avatarUrl: orgAvatarUrl(org),
  };
}

async function orgView(ctx: AppContext, viewerId: string, org: Organization): Promise<OrgView> {
  const seat = await orgSeat(ctx.db, viewerId, org.id);
  const summary = await summaryOf(ctx, org, seat?.role ?? null);
  let members: OrgMemberView[] | null = null;
  if (seat) {
    const rows = await team(ctx, org.id);
    const others = rows.map((r) => r.user_id).filter((id) => id !== viewerId);
    const [people, me, meRelation] = await Promise.all([
      personViewsFor(ctx, viewerId, others),
      ctx.db.selectFrom('users').selectAll().where('id', '=', viewerId).executeTakeFirstOrThrow(),
      viewerRelation(ctx.db, viewerId, viewerId),
    ]);
    members = rows
      .flatMap((r) => {
        const person =
          r.user_id === viewerId ? personView(me, meRelation, ctx.now()) : people.get(r.user_id);
        return person
          ? [
              {
                userId: r.user_id,
                role: r.role,
                title: r.title,
                person,
                joinedAt: r.joined_at.toISOString(),
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
          a.person.displayName.localeCompare(b.person.displayName),
      );
  }
  const domain =
    seat && canManageOrg(seat.role) && org.domain && org.verify_token
      ? {
          name: org.domain,
          verified: org.verified_at !== null,
          verifiedAt: org.verified_at?.toISOString() ?? null,
          record: verificationRecord(org.domain, org.verify_token),
        }
      : null;
  const plan = seat && canManageOrg(seat.role) ? await orgPlanView(ctx, org.id) : null;
  const [blockedByMe, agent] = await Promise.all([
    orgBlocked(ctx.db, viewerId, org.id),
    activeAgent(ctx, org.id),
  ]);
  return {
    ...summary,
    createdAt: org.created_at.toISOString(),
    members,
    domain,
    plan,
    blockedByMe,
    // Everyone sees it answers first, before they write (PRD §75).
    agent: agent && ctx.ai ? { name: agent.name } : null,
    booking: bookingOf(org),
    retentionDays: org.retention_days,
  };
}

async function adult(ctx: AppContext, userIds: string[]): Promise<boolean> {
  const rows = await ctx.db
    .selectFrom('users')
    .select(['birth_date', 'time_zone'])
    .where('id', 'in', userIds)
    .execute();
  return rows.length === userIds.length && rows.every((u) => !minorOf(u, ctx.now()));
}

async function managerSeat(ctx: AppContext, userId: string, orgId: string) {
  const seat = await orgSeat(ctx.db, userId, orgId);
  if (!seat) throw notFound(tr('That organization'));
  if (!canManageOrg(seat.role))
    throw forbidden(tr('Only the organization’s owner and admins can.'));
  return seat;
}

export async function orgRoutes(app: FastifyInstance, ctx: AppContext) {
  const idParam = z.object({ id: z.string().uuid() });
  const memberParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

  app.post('/orgs', async (req, reply): Promise<{ org: OrgView }> => {
    const auth = requireAuth(req);
    const body = parse(CreateOrgBody, req.body);
    ctx.limiter.hit(`org:${auth.userId}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
    if (!(await adult(ctx, [auth.userId])))
      throw forbidden(tr('Organizations are for people over 18.'));
    await assertHandleAvailable(ctx.db, body.handle, ctx.now());
    if (!isCountry(body.country)) throw badRequest(tr('Choose where it’s based.'));
    const id = uuidv7();
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('organizations')
        .values({
          id,
          name: body.name,
          handle: body.handle,
          kind: body.kind,
          about: body.about ?? null,
          website: body.website ?? null,
          country: body.country,
          founded_year: body.foundedYear ?? null,
          created_by: auth.userId,
        })
        .execute();
      await trx
        .insertInto('org_members')
        .values({ org_id: id, user_id: auth.userId, role: 'owner', added_by: auth.userId })
        .execute();
    });
    await audit(ctx.db, { actorId: auth.userId, action: 'org.created', target: id });
    reply.status(201);
    return { org: await orgView(ctx, auth.userId, await orgById(ctx.db, id)) };
  });

  /** The organizations you're on the team of. */
  app.get('/orgs', async (req): Promise<{ orgs: OrgSummaryView[] }> => {
    const auth = requireAuth(req);
    const rows = await ctx.db
      .selectFrom('org_members as m')
      .innerJoin('organizations as o', 'o.id', 'm.org_id')
      .selectAll('o')
      .select('m.role as my_role')
      .where('m.user_id', '=', auth.userId)
      .where('m.left_at', 'is', null)
      .where('o.archived_at', 'is', null)
      .orderBy('o.name')
      .execute();
    return {
      orgs: await Promise.all(
        rows.map(({ my_role, ...org }) => summaryOf(ctx, org as Organization, my_role)),
      ),
    };
  });

  /** Find an organization to reach it: by name or @handle, verified ones first. */
  app.get('/orgs/search', async (req): Promise<{ orgs: OrgSummaryView[] }> => {
    const auth = requireAuth(req);
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(100) }), req.query);
    ctx.limiter.hit(`org-search:${auth.userId}`, ctx.config.isTest ? 1000 : 60, 60_000);
    const term = q.replace(/^@/, '');
    const rows = await ctx.db
      .selectFrom('organizations')
      .selectAll()
      .where('archived_at', 'is', null)
      .where((eb) =>
        eb.or([
          eb('handle', '=', term.toLowerCase()),
          eb(sql`lower(name)`, 'like', `%${term.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`),
        ]),
      )
      .orderBy(sql`verified_at is null`)
      .orderBy('name')
      .limit(20)
      .execute();
    return {
      orgs: await Promise.all(
        rows.map(async (org) =>
          summaryOf(ctx, org, (await orgSeat(ctx.db, auth.userId, org.id))?.role ?? null),
        ),
      ),
    };
  });

  app.get('/orgs/by-handle/:handle', async (req): Promise<{ org: OrgView }> => {
    const auth = requireAuth(req);
    const { handle } = parse(z.object({ handle: z.string().min(1).max(60) }), req.params);
    const org = await ctx.db
      .selectFrom('organizations')
      .selectAll()
      .where('handle', '=', handle.replace(/^@/, '').toLowerCase())
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (!org) throw notFound(tr('That organization'));
    return { org: await orgView(ctx, auth.userId, org) };
  });

  app.get('/orgs/:id', async (req): Promise<{ org: OrgView }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    return { org: await orgView(ctx, auth.userId, await orgById(ctx.db, id)) };
  });

  /**
   * Its door (R53): the link that lands a customer in the conversation, with its QR code for
   * the door, the receipt and the bio. The team's to see; the link itself is public.
   */
  app.get('/orgs/:id/door', async (req, reply): Promise<OrgDoorView> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const org = await orgById(ctx.db, id);
    if (!(await orgSeat(ctx.db, auth.userId, id))) throw notFound(tr('That organization'));
    const url = `${ctx.config.PUBLIC_URL.replace(/\/+$/, '')}${doorPath(org.handle)}`;
    // The same for everyone on the team until the handle changes: a browser may keep it a while.
    reply.header('cache-control', 'private, max-age=3600');
    return { url, qr: qrPath(url) };
  });

  /**
   * What a clinic's lawyer needs (R54): the organization exports its own conversations (its
   * owner or admins, a few times an hour, each in the audit log), and erases a customer's at
   * that customer's request.
   */
  app.get('/orgs/:id/export', async (req, reply): Promise<OrgExportView> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const org = await orgById(ctx.db, id);
    await managerSeat(ctx, auth.userId, id);
    ctx.limiter.hit(`org-export:${id}`, ctx.config.isTest ? 1000 : 3, 3_600_000);
    let data: OrgExportView;
    try {
      data = await buildOrgExport(ctx, id, ctx.now());
    } catch (e) {
      if ((e as { status?: number }).status === 413)
        throw new AppError(
          413,
          'export_too_large',
          tr('This export is too large to make here. Write to Caime and it will be made for you.'),
        );
      throw e;
    }
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.exported',
      target: id,
      metadata: { conversations: data.conversations.length },
    });
    reply.header(
      'content-disposition',
      `attachment; filename="${org.handle}-caime-${ctx.now().toISOString().slice(0, 10)}.json"`,
    );
    return data;
  });

  app.delete(
    '/orgs/:id/conversations/:conversationId',
    async (req): Promise<{ erased: number }> => {
      const auth = requireAuth(req);
      const { id, conversationId } = parse(
        z.object({ id: z.string().uuid(), conversationId: z.string().uuid() }),
        req.params,
      );
      await orgById(ctx.db, id);
      await managerSeat(ctx, auth.userId, id);
      const result = await eraseBusinessConversation(ctx, id, conversationId, auth.userId);
      if (result === null) throw notFound(tr('That conversation'));
      await audit(ctx.db, {
        actorId: auth.userId,
        action: 'org.conversation_erased',
        target: conversationId,
        metadata: { orgId: id, erased: result.erased },
      });
      return result;
    },
  );

  app.patch('/orgs/:id', async (req): Promise<{ org: OrgView }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const body = parse(UpdateOrgBody, req.body);
    await orgById(ctx.db, id);
    await managerSeat(ctx, auth.userId, id);
    if (body.country !== undefined && !isCountry(body.country))
      throw badRequest(tr('Choose where it’s based.'));
    // How long its customers' conversations are kept is its owner's to set (R54), and takes
    // what's already there with it: the shorter time wins for every message.
    if (body.retentionDays !== undefined) {
      const seat = await orgSeat(ctx.db, auth.userId, id);
      if (seat?.role !== 'owner')
        throw forbidden(tr('Only the owner sets how long conversations are kept.'));
      await ctx.db
        .transaction()
        .execute((trx) => applyOrgRetention(trx, id, body.retentionDays ?? null, ctx.now()));
      await audit(ctx.db, {
        actorId: auth.userId,
        action: 'org.retention_set',
        target: id,
        metadata: { retentionDays: body.retentionDays },
      });
    }
    // Its logo is an image of the person's own upload, as a profile photo is (modules/me.ts).
    if (body.avatarFileId) {
      const file = await ctx.db
        .selectFrom('files')
        .select(['id', 'kind'])
        .where('id', '=', body.avatarFileId)
        .where('owner_id', '=', auth.userId)
        .executeTakeFirst();
      if (file?.kind !== 'image') throw badRequest(tr('Choose an image you uploaded.'));
    }
    await ctx.db
      .updateTable('organizations')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.about !== undefined ? { about: body.about } : {}),
        ...(body.website !== undefined ? { website: body.website } : {}),
        ...(body.country !== undefined ? { country: body.country } : {}),
        ...(body.foundedYear !== undefined ? { founded_year: body.foundedYear } : {}),
        ...(body.avatarFileId !== undefined ? { avatar_file_id: body.avatarFileId } : {}),
        updated_at: ctx.now(),
      })
      .where('id', '=', id)
      .execute();
    return { org: await orgView(ctx, auth.userId, await orgById(ctx.db, id)) };
  });

  /**
   * The organization's spaces (R43): the ones you're in, and, running it, all of them to join.
   */
  app.get('/orgs/:id/spaces', async (req): Promise<{ spaces: OrgSpaceView[] }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await orgById(ctx.db, id);
    const seat = await orgSeat(ctx.db, auth.userId, id);
    if (!seat) throw notFound(tr('That organization'));
    return { spaces: await orgSpaceViews(ctx, auth.userId, id, canManageOrg(seat.role)) };
  });

  /** Its owner or an admin joins one of its spaces, as an admin of it: they run the place. */
  app.post('/orgs/:id/spaces/:spaceId/join', async (req): Promise<{ ok: true }> => {
    const auth = requireAuth(req);
    const { id, spaceId } = parse(
      z.object({ id: z.string().uuid(), spaceId: z.string().uuid() }),
      req.params,
    );
    await orgById(ctx.db, id);
    await managerSeat(ctx, auth.userId, id);
    const space = await ctx.db
      .selectFrom('spaces')
      .select('id')
      .where('id', '=', spaceId)
      .where('org_id', '=', id)
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (!space) throw notFound(tr('That space'));
    const inIt = await ctx.db
      .selectFrom('space_members')
      .select('user_id')
      .where('space_id', '=', spaceId)
      .where('user_id', '=', auth.userId)
      .where('left_at', 'is', null)
      .executeTakeFirst();
    if (inIt) throw conflict('already_in', tr('You’re in it already.'));
    await addToSpace(ctx, spaceId, [auth.userId], auth.userId, 'admin');
    return { ok: true };
  });

  /** How its inbox is doing, for its owner and admins on a plan with insights (PRD §71). */
  app.get('/orgs/:id/insights', async (req): Promise<{ insights: OrgInsightsView }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const { days } = parse(
      z.object({
        days: z.coerce
          .number()
          .pipe(z.union([z.literal(7), z.literal(30)]))
          .default(7),
      }),
      req.query,
    );
    await orgById(ctx.db, id);
    await managerSeat(ctx, auth.userId, id);
    await assertInsights(ctx, id);
    return { insights: await orgInsights(ctx, id, days) };
  });

  app.post('/orgs/:id/members', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const body = parse(OrgMembersBody, req.body);
    await orgById(ctx.db, id);
    const seat = await managerSeat(ctx, auth.userId, id);
    if (body.role === 'admin' && seat.role !== 'owner')
      throw forbidden(tr('Only the owner makes admins.'));
    const current = new Set((await team(ctx, id)).map((m) => m.user_id));
    const adding = [...new Set(body.userIds)].filter((u) => !current.has(u));
    if (adding.length === 0) return { ok: true };
    // People you're connected with, as for groups and spaces: nobody is put on a team by a stranger.
    const connected = await ctx.db
      .selectFrom('connection_sides as s')
      .innerJoin('connections as c', 'c.id', 's.connection_id')
      .select('s.other_id')
      .where('s.owner_id', '=', auth.userId)
      .where('s.other_id', 'in', adding)
      .where('c.status', '=', 'active')
      .execute();
    if (new Set(connected.map((c) => c.other_id)).size !== adding.length)
      throw badRequest(tr('You can add people you’re connected with.'));
    if (!(await adult(ctx, adding))) throw forbidden(tr('Teams are for people over 18.'));
    await assertTeamRoom(ctx, id, adding.length);
    for (const userId of adding)
      await ctx.db
        .insertInto('org_members')
        .values({ org_id: id, user_id: userId, role: body.role, added_by: auth.userId })
        .onConflict((oc) =>
          oc.columns(['org_id', 'user_id']).doUpdateSet({
            left_at: null,
            role: body.role,
            added_by: auth.userId,
            joined_at: ctx.now(),
          }),
        )
        .execute();
    // The team answers every one of the organization's conversations.
    for (const userId of adding) await joinThreads(ctx.db, id, userId);
    await ctx.bus.publish(adding, { type: 'business.updated', data: { orgId: id } });
    // Teammates who know each other may be colleagues: offered to each, never decided (PRD §12).
    ctx.defer('suggest-teammates', async () => {
      const org = await orgById(ctx.db, id);
      const people = (await team(ctx, id)).filter((m) => m.kind === 'human').map((m) => m.user_id);
      await suggestFromPlace(
        ctx,
        { kind: 'org', id, name: org.name, verified: org.verified_at !== null },
        adding,
        people,
      );
    });
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.members_added',
      target: id,
      metadata: { userIds: adding },
    });
    return { ok: true };
  });

  app.delete('/orgs/:id/members/:userId', async (req) => {
    const auth = requireAuth(req);
    const { id, userId } = parse(memberParam, req.params);
    await orgById(ctx.db, id);
    const seat = await orgSeat(ctx.db, auth.userId, id);
    if (!seat) throw notFound(tr('That organization'));
    const members = await team(ctx, id);
    const target = members.find((m) => m.user_id === userId);
    if (!target) throw notFound(tr('That person on the team'));
    if (target.kind !== 'human')
      throw badRequest(tr('That’s an app’s bot: remove the app instead.'));
    // Only people run an organization: a bot never inherits it, nor keeps it open alone.
    const people = members.filter((m) => m.kind === 'human');
    const leaving = userId === auth.userId;
    if (!leaving && !canRemoveFromOrg(seat.role, target.role))
      throw forbidden(
        seat.role === 'admin'
          ? tr('Admins remove the team; the owner removes admins.')
          : tr('Only the organization’s owner and admins remove people.'),
      );
    const heir =
      target.role === 'owner'
        ? nextOwner(
            people.map((m) => ({
              userId: m.user_id,
              role: m.role,
              joinedAt: m.joined_at.toISOString(),
            })),
            userId,
          )
        : null;
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('org_members')
        .set({ left_at: ctx.now(), role: 'agent' })
        .where('org_id', '=', id)
        .where('user_id', '=', userId)
        .execute();
      await leaveThreads(trx, id, userId, ctx.now());
      if (heir)
        await trx
          .updateTable('org_members')
          .set({ role: 'owner' })
          .where('org_id', '=', id)
          .where('user_id', '=', heir)
          .execute();
      // Nobody left to run it: it closes, and stops showing anyone as verified.
      if (people.length === 1) await closeOrg(trx, id, ctx.now());
    });
    // Their seat in the organization's spaces ends with the one on its team (R43).
    for (const spaceId of await orgSpacesOf(ctx.db, id, userId))
      await removeFromSpace(ctx, spaceId, userId, auth.userId);
    // What they saved of its customers' conversations is out of their Saved now, and what
    // Caime offered because they were on its team goes.
    await tellSaved(ctx, [userId]);
    await withdrawPlaceOffers(ctx, { kind: 'org', id }, userId);
    // Closed: what it paid for ends (a job keeps trying if Stripe can't be reached now).
    if (people.length === 1) {
      await endBillingOf(ctx, { orgId: id });
      await endFollowsOf(ctx, id);
    }
    await ctx.bus.publish([userId], { type: 'business.updated', data: { orgId: id } });
    await audit(ctx.db, {
      actorId: auth.userId,
      action: leaving ? 'org.left' : 'org.member_removed',
      target: id,
      metadata: { userId, newOwner: heir },
    });
    return { ok: true };
  });

  app.patch('/orgs/:id/members/:userId', async (req) => {
    const auth = requireAuth(req);
    const { id, userId } = parse(memberParam, req.params);
    const body = parse(OrgMemberBody, req.body);
    await orgById(ctx.db, id);
    const seat = await managerSeat(ctx, auth.userId, id);
    const target = (await team(ctx, id)).find((m) => m.user_id === userId);
    if (!target) throw notFound(tr('That person on the team'));
    if (target.kind !== 'human')
      throw badRequest(tr('That’s an app’s bot: change the app instead.'));
    if (body.role !== undefined && !canChangeOrgRole(seat.role, target.role))
      throw forbidden(tr('Only the owner makes admins.'));
    await ctx.db
      .updateTable('org_members')
      .set({
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
      })
      .where('org_id', '=', id)
      .where('user_id', '=', userId)
      .execute();
    return { ok: true };
  });

  /** The domain to verify, and a new token for its TXT record. Changing it unverifies. */
  app.put('/orgs/:id/domain', async (req): Promise<{ org: OrgView }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const body = parse(OrgDomainBody, req.body);
    const org = await orgById(ctx.db, id);
    await managerSeat(ctx, auth.userId, id);
    const domain = normalizeDomain(body.domain);
    if (!domain) throw badRequest(tr('Enter a domain like datac.com.'));
    const holder = await ctx.db
      .selectFrom('organizations')
      .select('id')
      .where(sql`lower(domain)`, '=', domain)
      .where('verified_at', 'is not', null)
      .where('id', '<>', id)
      .executeTakeFirst();
    if (holder)
      throw conflict('domain_taken', tr('Another organization has verified this domain.'));
    if (org.domain !== domain || !org.verify_token)
      await ctx.db
        .updateTable('organizations')
        .set({ domain, verify_token: newVerifyToken(), verified_at: null, updated_at: ctx.now() })
        .where('id', '=', id)
        .execute();
    return { org: await orgView(ctx, auth.userId, await orgById(ctx.db, id)) };
  });

  /** Look for the TXT record now. */
  app.post('/orgs/:id/domain/check', async (req): Promise<{ org: OrgView }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const org = await orgById(ctx.db, id);
    await managerSeat(ctx, auth.userId, id);
    ctx.limiter.hit(`org-verify:${id}`, ctx.config.isTest ? 1000 : 10, 60_000);
    if (!org.domain || !org.verify_token) throw badRequest(tr('Add your domain first.'));
    if (!org.verified_at) {
      const record = verificationRecord(org.domain, org.verify_token);
      const [named, apex] = await Promise.all([
        ctx.dns.resolveTxt(record.name).catch(() => [] as string[][]),
        ctx.dns.resolveTxt(org.domain).catch(() => [] as string[][]),
      ]);
      if (!recordMatches([...named, ...apex], org.verify_token))
        throw new AppError(
          422,
          'record_not_found',
          tr(
            'We couldn’t find the record yet. DNS changes can take a few minutes, sometimes an hour.',
          ),
        );
      try {
        await ctx.db
          .updateTable('organizations')
          .set({ verified_at: ctx.now(), updated_at: ctx.now() })
          .where('id', '=', id)
          .execute();
      } catch (err) {
        if ((err as { code?: string }).code === '23505')
          throw conflict('domain_taken', tr('Another organization has verified this domain.'));
        throw err;
      }
      await audit(ctx.db, {
        actorId: auth.userId,
        action: 'org.verified',
        target: id,
        metadata: { domain: org.domain },
      });
    }
    return { org: await orgView(ctx, auth.userId, await orgById(ctx.db, id)) };
  });

  /**
   * Its owner closes it (R42): its page goes, its team's seats end, its apps stop, and its
   * customers keep their conversations read-only. Verified, its handle waits for whoever proves
   * its domain again; else it's held a year, then free.
   */
  app.post('/orgs/:id/close', async (req): Promise<{ ok: true }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const org = await orgById(ctx.db, id);
    const seat = await orgSeat(ctx.db, auth.userId, id);
    if (seat?.role !== 'owner') throw forbidden(tr('Only the organization’s owner closes it.'));
    const members = await team(ctx, id);
    await ctx.db.transaction().execute((trx) => closeOrg(trx, id, ctx.now()));
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.closed',
      target: id,
      metadata: { handle: org.handle, verified: org.verified_at !== null },
    });
    const people = members.filter((m) => m.kind === 'human').map((m) => m.user_id);
    await tellSaved(ctx, people);
    for (const userId of people) await withdrawPlaceOffers(ctx, { kind: 'org', id }, userId);
    await endBillingOf(ctx, { orgId: id });
    await endFollowsOf(ctx, id);
    await ctx.bus.publish(people, { type: 'business.updated', data: { orgId: id } });
    return { ok: true };
  });

  /**
   * Taking a closed organization back (R42): whoever it was, proving its domain again. The
   * record to add, made for this person; then `check`. Anyone may start (it proves nothing yet).
   */
  app.post('/orgs/:id/reclaim', async (req): Promise<OrgReclaimView> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    ctx.limiter.hit(`org-reclaim:${auth.userId}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
    if (!(await adult(ctx, [auth.userId])))
      throw forbidden(tr('Organizations are for people over 18.'));
    const org = await closedOrgById(ctx.db, id);
    if (!org.domain || !org.verified_at)
      throw conflict(
        'not_reclaimable',
        tr(
          'This organization was never verified at a domain, so there’s no way to prove it’s yours.',
        ),
      );
    const token = newVerifyToken();
    await ctx.db
      .updateTable('organizations')
      .set({ reclaim_by: auth.userId, reclaim_token: token, updated_at: ctx.now() })
      .where('id', '=', id)
      .execute();
    await audit(ctx.db, { actorId: auth.userId, action: 'org.reclaim_started', target: id });
    return {
      org: { id: org.id, name: org.name, handle: org.handle },
      domain: org.domain,
      record: verificationRecord(org.domain, token),
    };
  });

  /**
   * The record is there: the organization continues, as a new one with the same handle, name
   * and page, verified at its domain, owned by whoever proved it. The closed one stays as it
   * was, with everything its customers were sent; their blocks of it carry over. Nothing of the
   * old team, its apps or its followers comes back.
   */
  app.post('/orgs/:id/reclaim/check', async (req, reply): Promise<{ org: OrgView }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    ctx.limiter.hit(`org-verify:${id}`, ctx.config.isTest ? 1000 : 10, 60_000);
    const org = await closedOrgById(ctx.db, id);
    if (!org.domain || org.reclaim_by !== auth.userId || !org.reclaim_token)
      throw badRequest(tr('Start taking it back first.'));
    const record = verificationRecord(org.domain, org.reclaim_token);
    const [named, apex] = await Promise.all([
      ctx.dns.resolveTxt(record.name).catch(() => [] as string[][]),
      ctx.dns.resolveTxt(org.domain).catch(() => [] as string[][]),
    ]);
    if (!recordMatches([...named, ...apex], org.reclaim_token))
      throw new AppError(
        422,
        'record_not_found',
        tr(
          'We couldn’t find the record yet. DNS changes can take a few minutes, sometimes an hour.',
        ),
      );
    const newId = uuidv7();
    await ctx.db.transaction().execute(async (trx) => {
      // The closed one lets go of the domain (verified at it once at a time), the new one takes
      // it and the handle, and the closed one then points at the new one.
      await trx
        .updateTable('organizations')
        .set({ verified_at: null, reclaim_by: null, reclaim_token: null, updated_at: ctx.now() })
        .where('id', '=', id)
        .execute();
      await trx
        .insertInto('organizations')
        .values({
          id: newId,
          name: org.name,
          handle: org.handle,
          kind: org.kind,
          about: org.about,
          website: org.website,
          country: org.country,
          founded_year: org.founded_year,
          domain: org.domain,
          verify_token: org.reclaim_token,
          verified_at: ctx.now(),
          created_by: auth.userId,
        })
        .execute();
      await trx
        .updateTable('organizations')
        .set({ succeeded_by: newId })
        .where('id', '=', id)
        .execute();
      await trx
        .insertInto('org_members')
        .values({ org_id: newId, user_id: auth.userId, role: 'owner', added_by: auth.userId })
        .execute();
      await trx
        .insertInto('org_blocks')
        .columns(['user_id', 'org_id'])
        .expression((eb) =>
          eb
            .selectFrom('org_blocks')
            .select(['user_id', sql<string>`${newId}::uuid`.as('org_id')])
            .where('org_id', '=', id),
        )
        .execute();
    });
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.reclaimed',
      target: newId,
      metadata: { from: id, domain: org.domain, handle: org.handle },
    });
    reply.status(201);
    return { org: await orgView(ctx, auth.userId, await orgById(ctx.db, newId)) };
  });

  app.delete('/orgs/:id/domain', async (req): Promise<{ org: OrgView }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await orgById(ctx.db, id);
    await managerSeat(ctx, auth.userId, id);
    await ctx.db
      .updateTable('organizations')
      .set({ domain: null, verify_token: null, verified_at: null, updated_at: ctx.now() })
      .where('id', '=', id)
      .execute();
    return { org: await orgView(ctx, auth.userId, await orgById(ctx.db, id)) };
  });
}
