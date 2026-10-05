/**
 * Invite links (R1): made and taken back by their maker, opened by anyone with the token (the
 * page a visitor reads is lib/public-pages.ts), and accepted by whoever is signed in, who lands
 * connected in the conversation.
 */
import type { InviteAcceptView } from '@caime/core';
import { InviteBody } from '@caime/core';
import type {
  InviteOpenResponse,
  InviteResponse,
  InvitesResponse,
  OkResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { notFound } from '../lib/errors';
import { acceptInvite, inviteViews, makeInvite, openInvite, revokeInvite } from '../lib/invites';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function inviteRoutes(app: FastifyInstance, ctx: AppContext) {
  const tokenParam = z.object({ token: z.string().min(16).max(64) });

  app.post('/invites', async (req, reply): Promise<InviteResponse> => {
    const auth = requireAuth(req);
    const body = parse(InviteBody, req.body);
    ctx.limiter.hit(`invites:${auth.userId}`, ctx.config.isTest ? 1000 : 30, 86_400_000);
    reply.status(201);
    return { invite: await makeInvite(ctx, auth.userId, body) };
  });

  app.get('/invites', async (req): Promise<InvitesResponse> => {
    const auth = requireAuth(req);
    return { invites: await inviteViews(ctx, auth.userId) };
  });

  app.delete('/invites/:id', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (!(await revokeInvite(ctx, auth.userId, id))) throw notFound(tr('That invite'));
    return { ok: true };
  });

  /** Who invites, and the context they chose to show. Open to anyone with the token. */
  app.get('/invites/:token', async (req): Promise<InviteOpenResponse> => {
    const { token } = parse(tokenParam, req.params);
    ctx.limiter.hit(`invite-open:${req.ip}`, ctx.config.isTest ? 1000 : 60, 60_000);
    return { invite: await openInvite(ctx, token, req.auth?.userId ?? null) };
  });

  app.post('/invites/:token/accept', async (req): Promise<InviteAcceptView> => {
    const auth = requireAuth(req);
    const { token } = parse(tokenParam, req.params);
    ctx.limiter.hit(`invite-accept:${auth.userId}`, ctx.config.isTest ? 1000 : 30, 3_600_000);
    return acceptInvite(ctx, token, auth.userId);
  });
}
