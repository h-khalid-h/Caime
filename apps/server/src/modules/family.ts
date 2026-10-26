/**
 * Family (R122, lib/family.ts): a parent's links for their children, the children who signed up
 * through them (to agree to, say aren't theirs, or let go of), whom each child is connected with
 * while the parent's say holds, and, for a child, their parent and whether they've agreed. The
 * link's own page asks nothing of anyone signed in: `GET /v1/family/:token` names the parent and
 * the child for the sign-up screen.
 */

import { FamilyLinkBody, WithdrawConsentBody } from '@caime/core';
import type {
  FamilyChildView,
  FamilyLinkPublicResponse,
  FamilyLinkResponse,
  FamilyLinkView,
  FamilyRequestView,
  FamilyResponse,
  OkResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { verifyPassword } from '../lib/crypto';
import { AppError, notFound } from '../lib/errors';
import {
  answerGuardianRequest,
  consentFor,
  endByGuardian,
  familyLinkGone,
  familyLinkUrl,
  liveFamilyLink,
  makeFamilyLink,
  openFamilyLinks,
  revokeFamilyLink,
  supervisorOf,
} from '../lib/family';
import { personViewsFor } from '../lib/people-batch';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const linkView = (l: {
  id: string;
  child_name: string;
  expires_at: Date;
  created_at: Date;
}): FamilyLinkView => ({
  id: l.id,
  childName: l.child_name,
  expiresAt: l.expires_at.toISOString(),
  createdAt: l.created_at.toISOString(),
});

const ChildParams = z.object({ childId: z.string().uuid() });

export async function familyRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/me/family', async (req): Promise<FamilyResponse> => {
    const me = requireAuth(req).userId;
    const now = ctx.now();
    const [self, children, links, mine, asks] = await Promise.all([
      ctx.db
        .selectFrom('users')
        .select(['kind', 'birth_date', 'time_zone', 'age_minor_until'])
        .where('id', '=', me)
        .executeTakeFirstOrThrow(),
      ctx.db
        .selectFrom('guardianships')
        .select(['child_id', 'asked_at', 'consented_at'])
        .where('guardian_id', '=', me)
        .where('ended_at', 'is', null)
        .orderBy('asked_at')
        .execute(),
      openFamilyLinks(ctx, me),
      ctx.db
        .selectFrom('guardianships')
        .select(['guardian_id', 'consented_at'])
        .where('child_id', '=', me)
        .where('ended_at', 'is', null)
        .executeTakeFirst(),
      // Requests waiting on a parent: on me as that parent, or made by me as the child.
      ctx.db
        .selectFrom('connection_requests')
        .select(['id', 'from_user', 'to_user', 'note', 'created_at', 'waits_on_guardian'])
        .where('status', '=', 'pending')
        .where((eb) =>
          eb.or([
            eb('waits_on_guardian', '=', me),
            eb.and([eb('from_user', '=', me), eb('waits_on_guardian', 'is not', null)]),
          ]),
        )
        .orderBy('created_at')
        .limit(100)
        .execute(),
    ]);
    // Whose say holds now, for each child and for me as one: at most `CHILDREN_MAX` reads.
    const supervised = new Set<string>();
    for (const c of children)
      if (c.consented_at && (await supervisorOf(ctx.db, c.child_id, now)) === me)
        supervised.add(c.child_id);
    const mySupervisor = mine?.consented_at ? await supervisorOf(ctx.db, me, now) : null;
    // Whom each child is connected with, while the parent's say holds: one query for them all.
    const sides = supervised.size
      ? await ctx.db
          .selectFrom('connection_sides as s')
          .innerJoin('connections as c', 'c.id', 's.connection_id')
          .select(['s.owner_id', 's.other_id'])
          .where('s.owner_id', 'in', [...supervised])
          .where('c.status', '=', 'active')
          .where('s.other_id', '<>', me)
          .execute()
      : [];
    const onMe = asks.filter((r) => r.waits_on_guardian === me);
    const mineWaiting = asks.filter((r) => r.from_user === me && r.waits_on_guardian !== me);
    const people = await personViewsFor(ctx, me, [
      ...children.map((c) => c.child_id),
      ...sides.map((s) => s.other_id),
      ...(mine?.guardian_id ? [mine.guardian_id] : []),
      ...onMe.flatMap((r) => [r.from_user, r.to_user]),
      ...mineWaiting.map((r) => r.to_user),
    ]);
    const childViews: FamilyChildView[] = children.flatMap((c) => {
      const person = people.get(c.child_id);
      if (!person) return [];
      return [
        {
          person,
          state: c.consented_at ? 'agreed' : 'asked',
          askedAt: c.asked_at.toISOString(),
          agreedAt: c.consented_at?.toISOString() ?? null,
          supervised: supervised.has(c.child_id),
          connections: sides
            .filter((s) => s.owner_id === c.child_id)
            .flatMap((s) => {
              const p = people.get(s.other_id);
              return p ? [p] : [];
            }),
        },
      ];
    });
    const requests: FamilyRequestView[] = onMe.flatMap((r) => {
      const byChild = supervised.has(r.from_user);
      const child = people.get(byChild ? r.from_user : r.to_user);
      const person = people.get(byChild ? r.to_user : r.from_user);
      if (!child || !person) return [];
      return [
        {
          requestId: r.id,
          child,
          person,
          byChild,
          note: r.note,
          createdAt: r.created_at.toISOString(),
        },
      ];
    });
    const guardian = mine?.guardian_id ? (people.get(mine.guardian_id) ?? null) : null;
    return {
      children: childViews,
      links: links.map(linkView),
      requests,
      guardian:
        guardian && mine
          ? {
              person: guardian,
              agreed: Boolean(mine.consented_at),
              supervised: mySupervisor === mine.guardian_id,
              waiting: mineWaiting.flatMap((r) => {
                const p = people.get(r.to_user);
                return p ? [p] : [];
              }),
            }
          : null,
      mayAdd: self.kind === 'human' && !minorOf(self, now),
    };
  });

  app.post('/me/family/links', async (req, reply): Promise<FamilyLinkResponse> => {
    const me = requireAuth(req).userId;
    const body = parse(FamilyLinkBody, req.body);
    ctx.limiter.hit(`family-link:${me}`, ctx.config.isTest ? 1000 : 10, 86_400_000);
    const { link, token } = await makeFamilyLink(ctx, me, body.childName);
    reply.status(201);
    return { link: linkView(link), url: familyLinkUrl(ctx, token) };
  });

  app.delete('/me/family/links/:id', async (req): Promise<OkResponse> => {
    const me = requireAuth(req).userId;
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (!(await revokeFamilyLink(ctx, me, id))) throw notFound(tr('That family link'));
    return { ok: true };
  });

  app.post('/me/family/children/:childId/consent', async (req): Promise<OkResponse> => {
    const me = requireAuth(req).userId;
    const { childId } = parse(ChildParams, req.params);
    await consentFor(ctx, me, childId);
    return { ok: true };
  });

  // "That isn't my child": before agreeing, the account the link made is deleted.
  app.post('/me/family/children/:childId/refuse', async (req): Promise<OkResponse> => {
    const me = requireAuth(req).userId;
    const { childId } = parse(ChildParams, req.params);
    await endByGuardian(ctx, me, childId, 'not_mine');
    return { ok: true };
  });

  // The consent withdrawn: the child's account is deleted, so the parent's password says it's them.
  app.post('/me/family/children/:childId/withdraw', async (req): Promise<OkResponse> => {
    const me = requireAuth(req).userId;
    const { childId } = parse(ChildParams, req.params);
    const { password } = parse(WithdrawConsentBody, req.body);
    ctx.limiter.hit(`family-withdraw:${me}`, ctx.config.isTest ? 1000 : 5, 3_600_000);
    const user = await ctx.db
      .selectFrom('users')
      .select('password_hash')
      .where('id', '=', me)
      .executeTakeFirstOrThrow();
    if (!(await verifyPassword(password, user.password_hash)))
      throw new AppError(401, 'invalid_credentials', tr('That password isn’t right.'));
    await endByGuardian(ctx, me, childId, 'withdrawn');
    return { ok: true };
  });

  // A request to connect that waits on this parent's yes: passed on, or declined.
  app.post('/me/family/requests/:id/:answer', async (req): Promise<OkResponse> => {
    const me = requireAuth(req).userId;
    const { id, answer } = parse(
      z.object({ id: z.string().uuid(), answer: z.enum(['allow', 'decline']) }),
      req.params,
    );
    await answerGuardianRequest(ctx, me, id, answer === 'allow');
    return { ok: true };
  });

  // The link's own page, for the sign-up screen: whose link it is and for whom; nothing else.
  app.get('/family/:token', async (req): Promise<FamilyLinkPublicResponse> => {
    const { token } = parse(z.object({ token: z.string().max(80) }), req.params);
    ctx.limiter.hit(`family-open:${req.ip}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    const link = await liveFamilyLink(ctx.db, token, ctx.now());
    if (!link) throw familyLinkGone();
    return { guardianName: link.guardian_name, childName: link.child_name };
  });
}
