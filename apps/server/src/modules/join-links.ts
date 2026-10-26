/**
 * Join links (M16 C3e, review 2026-10-17 §1 H5): a group's or a space's owner or admins make a
 * link, list the open ones and take one back; a signed-in adult opens one and joins through the
 * one way into each (`addToGroup`, `addToSpace`), the link claimed under the place's lock. A link
 * that asks (C3h, `lib/join-requests.ts`) takes an ask instead, which the place's owner or an
 * admin accepts (through the same ways in) or declines. What a visitor without an account sees is
 * the `/g/<token>` page (`lib/public-pages.ts`).
 */

import { JoinLinkBody } from '@caime/core';
import type {
  JoinLinkAcceptResponse,
  JoinLinkMadeResponse,
  JoinLinkOpenResponse,
  JoinLinksResponse,
  JoinRequestsResponse,
  OkResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { sendSystem } from '../lib/conversation-views';
import { forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { askGuardian, moderatorOf, parentAskedToJoin } from '../lib/family-moderation';
import { addToGroup } from '../lib/group-members';
import { NEW_ACCOUNT_MS } from '../lib/invites';
import {
  assertRunsTarget,
  blockedFromJoining,
  claimJoinLink,
  type JoinTarget,
  joinLinkOpening,
  joinLinkUrl,
  joinLinkView,
  liveJoinLink,
  makeJoinLink,
  openJoinLinks,
  peopleIn,
  nameOf as placeNameOf,
  revokeJoinLink,
} from '../lib/join-links';
import {
  askedState,
  askToJoin,
  claimJoinRequest,
  closeJoinRequest,
  minorMayAsk,
  pendingRequest,
  pendingRequests,
} from '../lib/join-requests';
import { notify } from '../lib/notify';
import { addToSpace } from '../lib/space-members';
import { generalOf } from '../lib/spaces';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function joinLinkRoutes(app: FastifyInstance, ctx: AppContext) {
  const idParam = z.object({ id: z.string().uuid() });
  const linkParam = z.object({ id: z.string().uuid(), linkId: z.string().uuid() });
  const tokenParam = z.object({ token: z.string().min(1).max(64) });
  const requestParam = z.object({ id: z.string().uuid(), requestId: z.string().uuid() });

  /** Its name, for the words someone is told (a group's title, a space's name). */
  const nameOf = (t: JoinTarget) => placeNameOf(ctx.db, t);

  /** Where a place's conversation is: the group itself, or the space's General. */
  const conversationOf = async (t: JoinTarget) =>
    t.kind === 'group' ? t.id : (await generalOf(ctx.db, t.id)).id;

  for (const kind of ['group', 'space'] as const) {
    const base = kind === 'group' ? '/conversations/:id/join-links' : '/spaces/:id/join-links';

    app.post(base, async (req, reply): Promise<JoinLinkMadeResponse> => {
      const auth = requireAuth(req);
      const { id } = parse(idParam, req.params);
      const t: JoinTarget = { kind, id };
      const me = await ctx.db
        .selectFrom('users')
        .select(['kind', 'display_name', 'birth_date', 'time_zone', 'age_minor_until'])
        .where('id', '=', auth.userId)
        .executeTakeFirstOrThrow();
      // Whoever lets strangers in is an adult person (R29), as a guest's inviter is.
      if (me.kind !== 'human' || minorOf(me, ctx.now()))
        throw forbidden(tr('Join links are made by people 18 or over.'));
      const { approval } = parse(JoinLinkBody, req.body ?? {});
      ctx.limiter.hit(`join-link:${auth.userId}`, ctx.config.isTest ? 1000 : 30, 3_600_000);
      const { link, token } = await makeJoinLink(ctx, t, auth.userId, approval);
      // Everyone in it knows a link lets people in from now on.
      await sendSystem(ctx, await conversationOf(t), auth.userId, 'link_made', {});
      await recordEvent(ctx.db, 'join_link.made', auth.userId, {
        linkId: link.id,
        target: kind,
        approval,
      });
      ctx.metrics.joinLinks.inc({ target: kind, outcome: 'made' });
      reply.status(201);
      return { link: joinLinkView(link, me.display_name), url: joinLinkUrl(ctx, token) };
    });

    app.get(base, async (req): Promise<JoinLinksResponse> => {
      const auth = requireAuth(req);
      const { id } = parse(idParam, req.params);
      const t: JoinTarget = { kind, id };
      await assertRunsTarget(ctx.db, t, auth.userId);
      return { links: await openJoinLinks(ctx, t) };
    });

    app.delete(`${base}/:linkId`, async (req): Promise<OkResponse> => {
      const auth = requireAuth(req);
      const { id, linkId } = parse(linkParam, req.params);
      const t: JoinTarget = { kind, id };
      await assertRunsTarget(ctx.db, t, auth.userId);
      if (!(await revokeJoinLink(ctx, t, linkId))) throw notFound(tr('That link'));
      return { ok: true };
    });

    const asks =
      kind === 'group' ? '/conversations/:id/join-requests' : '/spaces/:id/join-requests';

    /** Who asked through its links and waits, for its owner and admins. */
    app.get(asks, async (req): Promise<JoinRequestsResponse> => {
      const auth = requireAuth(req);
      const { id } = parse(idParam, req.params);
      const t: JoinTarget = { kind, id };
      await assertRunsTarget(ctx.db, t, auth.userId);
      return { requests: await pendingRequests(ctx, t, auth.userId) };
    });

    /**
     * Let in, by an adult who runs it (R29), through the one way in: still waiting, room for one
     * more and, for someone under 18, still a place they may join (R98 (3)), checked under its lock.
     */
    app.post(`${asks}/:requestId/accept`, async (req): Promise<OkResponse> => {
      const auth = requireAuth(req);
      const { id, requestId } = parse(requestParam, req.params);
      const t: JoinTarget = { kind, id };
      await assertRunsTarget(ctx.db, t, auth.userId);
      const me = await ctx.db
        .selectFrom('users')
        .select(['kind', 'birth_date', 'time_zone', 'age_minor_until'])
        .where('id', '=', auth.userId)
        .executeTakeFirstOrThrow();
      if (me.kind !== 'human' || minorOf(me, ctx.now()))
        throw forbidden(tr('Asks to join are answered by people 18 or over.'));
      const ask = await pendingRequest(ctx.db, t, requestId);
      // A block either way with whoever answers or owns it, or by anyone in it, keeps them out.
      if (await blockedFromJoining(ctx.db, { created_by: auth.userId }, t, ask.user_id))
        throw forbidden(tr('This link can’t add them to it.'));
      const vouch = (trx: Parameters<typeof claimJoinRequest>[0], inIt: string[]) =>
        claimJoinRequest(trx, t, requestId, auth.userId, inIt, ctx.now());
      if (kind === 'group')
        await addToGroup(ctx, id, [ask.user_id], { actorId: ask.user_id, vouch, joined: true });
      else await addToSpace(ctx, id, [ask.user_id], auth.userId, 'member', { vouch, joined: true });
      const place = await nameOf(t);
      const conversationId = await conversationOf(t);
      await notify(ctx, {
        userId: ask.user_id,
        kind: 'join_request',
        level: 'attention',
        title: () => tr('You’re in “{place}”', { place }),
        body: () => tr('Your ask to join was accepted.'),
        data: { conversationId },
      });
      // An account made for the link (when they asked) counts as its maker's to have brought.
      const [who, made] = await Promise.all([
        ctx.db
          .selectFrom('users')
          .select('created_at')
          .where('id', '=', ask.user_id)
          .executeTakeFirstOrThrow(),
        ask.link_id
          ? ctx.db
              .selectFrom('join_links')
              .select('created_by')
              .where('id', '=', ask.link_id)
              .executeTakeFirst()
          : undefined,
      ]);
      const fresh = who.created_at.getTime() > ask.created_at.getTime() - NEW_ACCOUNT_MS;
      if (fresh && made?.created_by)
        await ctx.db
          .updateTable('users')
          .set({ invited_by: made.created_by })
          .where('id', '=', ask.user_id)
          .where('invited_by', 'is', null)
          .where('invited_by_org', 'is', null)
          .execute();
      await recordEvent(ctx.db, 'join_link.joined', ask.user_id, {
        linkId: ask.link_id,
        target: kind,
        fresh,
        asked: true,
      });
      ctx.metrics.joinLinks.inc({ target: kind, outcome: 'joined' });
      await ctx.bus.publish([auth.userId], { type: 'join.asked', data: { target: kind, id } });
      return { ok: true };
    });

    /** Not let in: they aren't told by a notice, and that link takes no ask from them again. */
    app.post(`${asks}/:requestId/decline`, async (req): Promise<OkResponse> => {
      const auth = requireAuth(req);
      const { id, requestId } = parse(requestParam, req.params);
      const t: JoinTarget = { kind, id };
      await assertRunsTarget(ctx.db, t, auth.userId);
      if (!(await closeJoinRequest(ctx.db, t, requestId, auth.userId, 'declined', ctx.now())))
        throw notFound(tr('That ask'));
      ctx.metrics.joinLinks.inc({ target: kind, outcome: 'declined' });
      await ctx.bus.publish([auth.userId], { type: 'join.asked', data: { target: kind, id } });
      return { ok: true };
    });
  }

  /** What a link offers whoever opened it signed in: the place, how many are in it, who asks. */
  app.get('/join-links/:token', async (req): Promise<JoinLinkOpenResponse> => {
    const auth = requireAuth(req);
    const { token } = parse(tokenParam, req.params);
    const live = await liveJoinLink(ctx, token);
    if (!live) throw notFound(tr('That link'));
    const { people, ...opening } = await joinLinkOpening(ctx, live);
    const asked = live.link.approval
      ? ((await askedState(ctx.db, live.target, live.link.id, auth.userId)) ??
        // Their ask waits on a parent who moderates first (R122 (2)).
        ((await parentAskedToJoin(ctx.db, auth.userId, live.link.id)) ? 'parent' : null))
      : null;
    return { link: { ...opening, member: people.includes(auth.userId), asked } };
  });

  /** Their ask taken back, while it waits. */
  app.delete('/join-links/:token/ask', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { token } = parse(tokenParam, req.params);
    const live = await liveJoinLink(ctx, token);
    if (!live) throw notFound(tr('That link'));
    const { target } = live;
    const ask = await ctx.db
      .selectFrom('join_requests')
      .select('id')
      .where(target.kind === 'group' ? 'conversation_id' : 'space_id', '=', target.id)
      .where('user_id', '=', auth.userId)
      .where('decided_at', 'is', null)
      .executeTakeFirst();
    if (
      !ask ||
      !(await closeJoinRequest(ctx.db, target, ask.id, auth.userId, 'withdrawn', ctx.now()))
    )
      throw notFound(tr('That ask'));
    return { ok: true };
  });

  app.post('/join-links/:token/accept', async (req): Promise<JoinLinkAcceptResponse> => {
    const auth = requireAuth(req);
    const { token } = parse(tokenParam, req.params);
    ctx.limiter.hit(`join-link-accept:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    const live = await liveJoinLink(ctx, token);
    if (!live) throw notFound(tr('That link'));
    const { link, target } = live;
    const conversationId = await conversationOf(target);
    const spaceId = target.kind === 'space' ? target.id : null;
    if ((await peopleIn(ctx.db, target)).includes(auth.userId))
      return { asked: false, conversationId, spaceId, already: true };
    const me = await ctx.db
      .selectFrom('users')
      .select(['kind', 'birth_date', 'time_zone', 'age_minor_until', 'created_at', 'display_name'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    // Someone let in by a link is a stranger to the people there (R29): adults alone, and the
    // same words for every reason. Through a link that asks, someone under 18 may ask where the
    // place is run for them by someone they may trust (R98 (3)); an adult lets them in or not.
    const minor = minorOf(me, ctx.now());
    if (
      me.kind !== 'human' ||
      (minor && !(link.approval && (await minorMayAsk(ctx.db, target, auth.userId, ctx.now()))))
    ) {
      ctx.metrics.joinLinks.inc({ target: target.kind, outcome: 'refused' });
      throw forbidden(tr('Join links are for people 18 or over: ask someone in it to add you.'));
    }
    if (await blockedFromJoining(ctx.db, link, target, auth.userId)) {
      ctx.metrics.joinLinks.inc({ target: target.kind, outcome: 'refused' });
      throw forbidden(tr('This link can’t add you to it.'));
    }
    // A parent who moderates says yes to their child's ask first (R122 (2)): it reaches whoever
    // runs the place only once they have.
    if (link.approval && minor) {
      const parent = await moderatorOf(ctx.db, auth.userId, ctx.now());
      if (parent) {
        await askGuardian(ctx, parent, auth.userId, { kind: 'join', linkId: link.id });
        return { asked: true, state: 'parent' };
      }
    }
    if (link.approval) {
      const { state, fresh } = await askToJoin(
        ctx,
        link.id,
        target,
        { id: auth.userId, displayName: me.display_name },
        await nameOf(target),
      );
      if (fresh) {
        await recordEvent(ctx.db, 'join_link.asked', auth.userId, {
          linkId: link.id,
          target: target.kind,
        });
        ctx.metrics.joinLinks.inc({ target: target.kind, outcome: 'asked' });
      }
      return { asked: true, state };
    }
    // Two taps at once: whichever holds the place's lock second finds them in it, and the link
    // counts one join.
    const alreadyIn = new Error('already in it');
    const vouch = async (trx: Parameters<typeof claimJoinLink>[0], inIt: string[]) => {
      if (inIt.includes(auth.userId)) throw alreadyIn;
      await claimJoinLink(trx, link.id, inIt, ctx.now());
    };
    try {
      if (target.kind === 'group')
        await addToGroup(ctx, target.id, [auth.userId], {
          actorId: auth.userId,
          vouch,
          joined: true,
        });
      // Newcomers to a space are offered who they may know in it (PRD §12), as anyone added is.
      else
        await addToSpace(ctx, target.id, [auth.userId], auth.userId, 'member', {
          vouch,
          joined: true,
        });
    } catch (err) {
      if (err === alreadyIn) return { asked: false, conversationId, spaceId, already: true };
      throw err;
    }
    // An account made for this link counts as its maker's to have brought (growth, R1's rule).
    const fresh = me.created_at.getTime() > ctx.now().getTime() - NEW_ACCOUNT_MS;
    if (fresh)
      await ctx.db
        .updateTable('users')
        .set({ invited_by: link.created_by })
        .where('id', '=', auth.userId)
        .where('invited_by', 'is', null)
        .where('invited_by_org', 'is', null)
        .execute();
    await recordEvent(ctx.db, 'join_link.joined', auth.userId, {
      linkId: link.id,
      target: target.kind,
      fresh,
    });
    ctx.metrics.joinLinks.inc({ target: target.kind, outcome: 'joined' });
    return { asked: false, conversationId, spaceId, already: false };
  });
}
