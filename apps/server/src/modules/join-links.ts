/**
 * Join links (M16 C3e, review 2026-10-17 §1 H5): a group's or a space's owner or admins make a
 * link, list the open ones and take one back; a signed-in adult opens one and joins through the
 * one way into each (`addToGroup`, `addToSpace`), the link claimed under the place's lock. What a
 * visitor without an account sees is the `/g/<token>` page (`lib/public-pages.ts`).
 */

import type {
  JoinLinkAcceptResponse,
  JoinLinkMadeResponse,
  JoinLinkOpenResponse,
  JoinLinksResponse,
  OkResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { sendSystem } from '../lib/conversation-views';
import { forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
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
  revokeJoinLink,
} from '../lib/join-links';
import { addToSpace } from '../lib/space-members';
import { generalOf } from '../lib/spaces';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function joinLinkRoutes(app: FastifyInstance, ctx: AppContext) {
  const idParam = z.object({ id: z.string().uuid() });
  const linkParam = z.object({ id: z.string().uuid(), linkId: z.string().uuid() });
  const tokenParam = z.object({ token: z.string().min(1).max(64) });

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
        .select(['kind', 'display_name', 'birth_date', 'time_zone'])
        .where('id', '=', auth.userId)
        .executeTakeFirstOrThrow();
      // Whoever lets strangers in is an adult person (R29), as a guest's inviter is.
      if (me.kind !== 'human' || minorOf(me, ctx.now()))
        throw forbidden(tr('Join links are made by people 18 or over.'));
      ctx.limiter.hit(`join-link:${auth.userId}`, ctx.config.isTest ? 1000 : 30, 3_600_000);
      const { link, token } = await makeJoinLink(ctx, t, auth.userId);
      // Everyone in it knows a link lets people in from now on.
      await sendSystem(ctx, await conversationOf(t), auth.userId, 'link_made', {});
      await recordEvent(ctx.db, 'join_link.made', auth.userId, { linkId: link.id, target: kind });
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
  }

  /** What a link offers whoever opened it signed in: the place, how many are in it, who asks. */
  app.get('/join-links/:token', async (req): Promise<JoinLinkOpenResponse> => {
    const auth = requireAuth(req);
    const { token } = parse(tokenParam, req.params);
    const live = await liveJoinLink(ctx, token);
    if (!live) throw notFound(tr('That link'));
    const { people, ...opening } = await joinLinkOpening(ctx, live);
    return { link: { ...opening, member: people.includes(auth.userId) } };
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
      return { conversationId, spaceId, already: true };
    const me = await ctx.db
      .selectFrom('users')
      .select(['kind', 'birth_date', 'time_zone', 'created_at'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    // Someone let in by a link is a stranger to the people there (R29): adults alone, and the
    // same words for every reason.
    if (me.kind !== 'human' || minorOf(me, ctx.now())) {
      ctx.metrics.joinLinks.inc({ target: target.kind, outcome: 'refused' });
      throw forbidden(tr('Join links are for people 18 or over: ask someone in it to add you.'));
    }
    if (await blockedFromJoining(ctx.db, link, target, auth.userId)) {
      ctx.metrics.joinLinks.inc({ target: target.kind, outcome: 'refused' });
      throw forbidden(tr('This link can’t add you to it.'));
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
      if (err === alreadyIn) return { conversationId, spaceId, already: true };
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
    return { conversationId, spaceId, already: false };
  });
}
