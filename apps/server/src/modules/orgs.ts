/**
 * Organizations (PRD §35–36, §55, R15): a business, a shop, a clinic, a school, a nonprofit or a
 * public service, with its team. It verifies a domain with a DNS TXT record; until then it says
 * so, and nobody on its team shows as verified. Organizations and their teams are for adults.
 */

import type { OrgMemberView, OrgSummaryView, OrgView } from '@caishy/core';
import {
  CreateOrgBody,
  canChangeOrgRole,
  canManageOrg,
  canRemoveFromOrg,
  isMinor,
  nextOwner,
  normalizeDomain,
  OrgDomainBody,
  OrgMemberBody,
  OrgMembersBody,
  type OrgRole,
  recordMatches,
  UpdateOrgBody,
  uuidv7,
  verificationRecord,
} from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Organization } from '../db/schema';
import { audit } from '../lib/audit';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { handleTaken } from '../lib/handles';
import { newVerifyToken, orgById, orgSeat } from '../lib/orgs';
import { personViewsFor } from '../lib/people-batch';
import { viewerRelation } from '../lib/relations';
import { personView } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const ROLE_ORDER: Record<OrgRole, number> = { owner: 0, admin: 1, agent: 2 };

async function team(ctx: AppContext, orgId: string) {
  return ctx.db
    .selectFrom('org_members')
    .select(['user_id', 'role', 'title', 'joined_at'])
    .where('org_id', '=', orgId)
    .where('left_at', 'is', null)
    .orderBy('joined_at')
    .execute();
}

async function summaryOf(
  ctx: AppContext,
  org: Organization,
  myRole: OrgRole | null,
): Promise<OrgSummaryView> {
  const { n } = await ctx.db
    .selectFrom('org_members')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('org_id', '=', org.id)
    .where('left_at', 'is', null)
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
  return { ...summary, createdAt: org.created_at.toISOString(), members, domain };
}

async function adult(ctx: AppContext, userIds: string[]): Promise<boolean> {
  const rows = await ctx.db
    .selectFrom('users')
    .select('birth_year')
    .where('id', 'in', userIds)
    .execute();
  return rows.length === userIds.length && rows.every((u) => !isMinor(u.birth_year, ctx.now()));
}

async function managerSeat(ctx: AppContext, userId: string, orgId: string) {
  const seat = await orgSeat(ctx.db, userId, orgId);
  if (!seat) throw notFound('That organization');
  if (!canManageOrg(seat.role)) throw forbidden('Only the organization’s owner and admins can.');
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
      throw forbidden('Organizations are for people over 18.');
    if (await handleTaken(ctx.db, body.handle))
      throw conflict('handle_taken', 'That handle is taken. Try another.');
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
    if (!org) throw notFound('That organization');
    return { org: await orgView(ctx, auth.userId, org) };
  });

  app.get('/orgs/:id', async (req): Promise<{ org: OrgView }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    return { org: await orgView(ctx, auth.userId, await orgById(ctx.db, id)) };
  });

  app.patch('/orgs/:id', async (req): Promise<{ org: OrgView }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const body = parse(UpdateOrgBody, req.body);
    await orgById(ctx.db, id);
    await managerSeat(ctx, auth.userId, id);
    await ctx.db
      .updateTable('organizations')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.about !== undefined ? { about: body.about } : {}),
        ...(body.website !== undefined ? { website: body.website } : {}),
        updated_at: ctx.now(),
      })
      .where('id', '=', id)
      .execute();
    return { org: await orgView(ctx, auth.userId, await orgById(ctx.db, id)) };
  });

  app.post('/orgs/:id/members', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const body = parse(OrgMembersBody, req.body);
    await orgById(ctx.db, id);
    const seat = await managerSeat(ctx, auth.userId, id);
    if (body.role === 'admin' && seat.role !== 'owner')
      throw forbidden('Only the owner makes admins.');
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
      throw badRequest('You can add people you’re connected with.');
    if (!(await adult(ctx, adding))) throw forbidden('Teams are for people over 18.');
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
    if (!seat) throw notFound('That organization');
    const members = await team(ctx, id);
    const target = members.find((m) => m.user_id === userId);
    if (!target) throw notFound('That person on the team');
    const leaving = userId === auth.userId;
    if (!leaving && !canRemoveFromOrg(seat.role, target.role))
      throw forbidden(
        seat.role === 'admin'
          ? 'Admins remove the team; the owner removes admins.'
          : 'Only the organization’s owner and admins remove people.',
      );
    const heir =
      target.role === 'owner'
        ? nextOwner(
            members.map((m) => ({
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
      if (heir)
        await trx
          .updateTable('org_members')
          .set({ role: 'owner' })
          .where('org_id', '=', id)
          .where('user_id', '=', heir)
          .execute();
      // Nobody left to run it: it closes, and stops showing anyone as verified.
      if (members.length === 1)
        await trx
          .updateTable('organizations')
          .set({ archived_at: ctx.now() })
          .where('id', '=', id)
          .execute();
    });
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
    if (!target) throw notFound('That person on the team');
    if (body.role !== undefined && !canChangeOrgRole(seat.role, target.role))
      throw forbidden('Only the owner makes admins.');
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
    if (!domain) throw badRequest('Enter a domain like datac.com.');
    const holder = await ctx.db
      .selectFrom('organizations')
      .select('id')
      .where(sql`lower(domain)`, '=', domain)
      .where('verified_at', 'is not', null)
      .where('id', '<>', id)
      .executeTakeFirst();
    if (holder) throw conflict('domain_taken', 'Another organization has verified this domain.');
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
    if (!org.domain || !org.verify_token) throw badRequest('Add your domain first.');
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
          'We couldn’t find the record yet. DNS changes can take a few minutes, sometimes an hour.',
        );
      try {
        await ctx.db
          .updateTable('organizations')
          .set({ verified_at: ctx.now(), updated_at: ctx.now() })
          .where('id', '=', id)
          .execute();
      } catch (err) {
        if ((err as { code?: string }).code === '23505')
          throw conflict('domain_taken', 'Another organization has verified this domain.');
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
