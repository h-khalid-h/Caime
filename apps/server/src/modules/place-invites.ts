/**
 * Invitations to a group or a space (M16 B4, `lib/place-invites.ts`): the invited person's answer.
 * Their open invitations ride on Attention (`GET /attention`), so listing them costs no request of
 * its own.
 */
import type { InvitationAnsweredResponse, OkResponse } from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { answerPlaceInvite } from '../lib/place-invites';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function placeInviteRoutes(app: FastifyInstance, ctx: AppContext) {
  const idParam = z.object({ id: z.string().uuid() });

  /** Yes: in through the place's one way in, and where they landed. */
  app.post('/invitations/:id/accept', async (req): Promise<InvitationAnsweredResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    ctx.limiter.hit(`invitation:${auth.userId}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    const t = await answerPlaceInvite(ctx, auth.userId, id, true);
    // Their parent says yes to new places first (R122 (2)): asked, and nothing more yet.
    if (t === 'asked') return { conversationId: null, spaceId: null, askedParent: true };
    return {
      conversationId: t?.kind === 'group' ? t.id : null,
      spaceId: t?.kind === 'space' ? t.id : null,
    };
  });

  /** No: done, and nobody is told. */
  app.post('/invitations/:id/decline', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await answerPlaceInvite(ctx, auth.userId, id, false);
    return { ok: true };
  });
}
