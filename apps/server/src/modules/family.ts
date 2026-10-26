/**
 * Family (R122, lib/family.ts; R122 (2), lib/family-asks.ts): a parent's links for their
 * children, the children who signed up through them or asked them (to agree to, say aren't theirs,
 * or let go of), whom each child is connected with while the parent's say holds, a child's own
 * corrections waiting on their parent, and, for a child, their parent and whether they've agreed,
 * or, while their account waits, whom it asked and how to ask someone. The links' own pages ask
 * nothing of anyone signed in: `GET /v1/family/:token` names who is in it for the page.
 */

import {
  ConsentBody,
  FamilyLinkBody,
  FamilyParentBody,
  FamilyTakeAskBody,
  Handle,
  ModerateBody,
  WithdrawConsentBody,
} from '@caime/core';
import type {
  FamilyAskLinkResponse,
  FamilyAskTakenResponse,
  FamilyChildView,
  FamilyLinkPublicResponse,
  FamilyLinkResponse,
  FamilyLinkView,
  FamilyParentResponse,
  FamilyRequestView,
  FamilyResponse,
  FamilyWaitView,
  OkResponse,
} from '@caime/core/api';
import { currentTranslator, tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { verifyPassword } from '../lib/crypto';
import { AppError, notFound } from '../lib/errors';
import {
  answerGuardianRequest,
  CONSENT_DAYS,
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
import {
  ASKS_MAX,
  answerCorrection,
  askableAdult,
  askNamed,
  liveAskLink,
  makeAskLink,
  nobodyToAsk,
  refuseChild,
  takeAskLink,
} from '../lib/family-asks';
import { answerGuardianAsk, releaseModerated } from '../lib/family-moderate';
import { guardianAskViews, setModerates } from '../lib/family-moderation';
import { countryNameIn } from '../lib/geo';
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
        .selectFrom('guardianships as g')
        .innerJoin('users as c', 'c.id', 'g.child_id')
        .select([
          'g.child_id',
          'g.asked_at',
          'g.consented_at',
          'g.began',
          'g.asked_born_on',
          'g.asked_country',
          'g.correction_asked_at',
          'g.moderates',
          'c.birth_date',
        ])
        .where('g.guardian_id', '=', me)
        .where('g.ended_at', 'is', null)
        .orderBy('g.asked_at')
        .execute(),
      openFamilyLinks(ctx, me),
      ctx.db
        .selectFrom('guardianships')
        .select([
          'guardian_id',
          'consented_at',
          'asked_at',
          'began',
          'asks',
          'ask_expires_at',
          'correction_asked_at',
          'moderates',
        ])
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
    // While my own account waits, how many said no to it (never who).
    const refusals =
      mine && !mine.consented_at
        ? await ctx.db
            .selectFrom('family_refusals')
            .select((eb) => eb.fn.countAll<string>().as('n'))
            .where('child_id', '=', me)
            .executeTakeFirstOrThrow()
        : null;
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
      const asked = !c.consented_at;
      return [
        {
          person,
          state: asked ? 'asked' : 'agreed',
          how: c.began === 'link' ? 'link' : 'named',
          askedAt: c.asked_at.toISOString(),
          agreedAt: c.consented_at?.toISOString() ?? null,
          // The day of birth they gave, for the parent to vouch for as they agree (R122 (2)).
          birthDate: asked ? c.birth_date : null,
          supervised: supervised.has(c.child_id),
          moderates: c.moderates,
          connections: sides
            .filter((s) => s.owner_id === c.child_id)
            .flatMap((s) => {
              const p = people.get(s.other_id);
              return p ? [p] : [];
            }),
          correction:
            c.correction_asked_at && !asked
              ? {
                  birthDate: c.asked_born_on,
                  fromBirthDate: c.asked_born_on ? c.birth_date : null,
                  country: c.asked_country,
                  countryName: c.asked_country
                    ? countryNameIn(c.asked_country, currentTranslator().language)
                    : null,
                  askedAt: c.correction_asked_at.toISOString(),
                }
              : null,
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
    const wait: FamilyWaitView | null =
      mine && !mine.consented_at
        ? {
            began: mine.began,
            asked: guardian,
            linkUntil:
              mine.ask_expires_at && mine.ask_expires_at.getTime() > now.getTime()
                ? mine.ask_expires_at.toISOString()
                : null,
            asksLeft: mine.began === 'link' ? 0 : Math.max(0, ASKS_MAX - mine.asks),
            refusals: Number(refusals?.n ?? 0),
            deletesAt: new Date(mine.asked_at.getTime() + CONSENT_DAYS * 86_400_000).toISOString(),
          }
        : null;
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
              correctionAsked: Boolean(mine.correction_asked_at),
              moderates: mine.moderates && mySupervisor === mine.guardian_id,
              waitingAsks:
                mine.moderates && mySupervisor === mine.guardian_id
                  ? await guardianAskViews(ctx, me, { childId: me })
                  : [],
            }
          : null,
      wait,
      asks: await guardianAskViews(ctx, me, { guardianId: me }),
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
    const { moderates } = parse(ConsentBody, req.body ?? {});
    await consentFor(ctx, me, childId, { moderates });
    return { ok: true };
  });

  // Moderate turned on or off for a child the parent looks after (R122 (2)); turned off, what
  // waited on them goes on at once.
  app.patch('/me/family/children/:childId', async (req): Promise<OkResponse> => {
    const me = requireAuth(req).userId;
    const { childId } = parse(ChildParams, req.params);
    const { moderates } = parse(ModerateBody, req.body);
    if (moderates && (await supervisorOf(ctx.db, childId, ctx.now())) !== me)
      throw notFound(tr('That child'));
    if (await setModerates(ctx, me, childId, moderates)) {
      await audit(ctx.db, {
        actorId: me,
        action: 'family.moderate_changed',
        target: childId,
        metadata: { moderates },
      });
      if (!moderates) await releaseModerated(ctx, childId);
    }
    return { ok: true };
  });

  // What Moderate put before this parent: done as their child would have, or let go.
  app.post('/me/family/asks/:id/:answer', async (req): Promise<OkResponse> => {
    const me = requireAuth(req).userId;
    const { id, answer } = parse(
      z.object({ id: z.string().uuid(), answer: z.enum(['allow', 'decline']) }),
      req.params,
    );
    await answerGuardianAsk(ctx, me, id, answer === 'allow');
    return { ok: true };
  });

  // "That isn't my child": what their link made is deleted; an ask the child made ends there.
  app.post('/me/family/children/:childId/refuse', async (req): Promise<OkResponse> => {
    const me = requireAuth(req).userId;
    const { childId } = parse(ChildParams, req.params);
    await refuseChild(ctx, me, childId);
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

  // A child's correction (a day of birth, where they live) that waits on this parent's yes.
  app.post('/me/family/children/:childId/correction/:answer', async (req): Promise<OkResponse> => {
    const me = requireAuth(req).userId;
    const { childId, answer } = parse(
      z.object({ childId: z.string().uuid(), answer: z.enum(['agree', 'decline']) }),
      req.params,
    );
    await answerCorrection(ctx, me, childId, answer === 'agree');
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

  // Who a handle is, for a waiting child to see before asking them (R122 (2)): someone who may be
  // asked, as their profile shows them to anyone; one refusal for everyone else.
  app.get('/me/family/parent', async (req): Promise<FamilyParentResponse> => {
    const me = requireAuth(req).userId;
    const { handle } = parse(z.object({ handle: Handle }), {
      handle: String((req.query as { handle?: unknown }).handle ?? '')
        .trim()
        .replace(/^@/, '')
        .toLowerCase(),
    });
    ctx.limiter.hit(`family-parent:${me}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    const adult = await askableAdult(ctx.db, { handle }, me, ctx.now());
    if (!adult) throw nobodyToAsk();
    const parent = (await personViewsFor(ctx, me, [adult.id], { sharesConversation: false })).get(
      adult.id,
    );
    if (!parent) throw nobodyToAsk();
    return { parent };
  });

  // The waiting child asks the one they saw.
  app.post('/me/family/parent', async (req): Promise<OkResponse> => {
    const me = requireAuth(req).userId;
    const { handle } = parse(FamilyParentBody, req.body);
    ctx.limiter.hit(`family-ask:${me}`, ctx.config.isTest ? 1000 : 10, 86_400_000);
    await askNamed(ctx, me, handle);
    return { ok: true };
  });

  // A link the waiting child sends a parent not on Caime yet: its address this once.
  app.post('/me/family/parent-link', async (req, reply): Promise<FamilyAskLinkResponse> => {
    const me = requireAuth(req).userId;
    ctx.limiter.hit(`family-ask-link:${me}`, ctx.config.isTest ? 1000 : 10, 86_400_000);
    const made = await makeAskLink(ctx, me);
    reply.status(201);
    return { url: made.url, expiresAt: made.expiresAt.toISOString() };
  });

  // An adult who opened a child's link, signed in: they're the one asked now, on Family. The token
  // comes in the body, so no address of it reaches a log.
  app.post('/me/family/asks', async (req): Promise<FamilyAskTakenResponse> => {
    const me = requireAuth(req).userId;
    const { token } = parse(FamilyTakeAskBody, req.body);
    ctx.limiter.hit(`family-take:${me}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    const childId = await takeAskLink(ctx, me, token);
    const child = (await personViewsFor(ctx, me, [childId])).get(childId);
    if (!child) throw notFound(tr('That child'));
    return { child };
  });

  // A link's own page, for the sign-up and sign-in screens: whose link it is and for whom (a
  // parent's), or whose ask it is (a child's); nothing else.
  app.get('/family/:token', async (req): Promise<FamilyLinkPublicResponse> => {
    const { token } = parse(z.object({ token: z.string().max(80) }), req.params);
    ctx.limiter.hit(`family-open:${req.ip}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    const now = ctx.now();
    const link = await liveFamilyLink(ctx.db, token, now);
    if (link) return { kind: 'link', guardianName: link.guardian_name, childName: link.child_name };
    const ask = await liveAskLink(ctx.db, token, now);
    if (ask) return { kind: 'ask', guardianName: null, childName: ask.childName };
    throw familyLinkGone();
  });
}
