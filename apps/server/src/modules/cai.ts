/**
 * Cai's own routes (R68): Settings · Cai (what it follows up and what it has learned, to
 * forget), and sending the follow-up it offered, or what it offered to do (M16 G14), on the
 * person's tap. The work is `lib/cai.ts` and `lib/cai-acts.ts`.
 */
import { CaiAnswerBody, CaiForgetBody } from '@caime/core';
import type {
  CaiAnswerChosenResponse,
  CaiResponse,
  FollowUpSentResponse,
  OfferDoneResponse,
} from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { caiSettings, forgetLearned, sendFollowUp } from '../lib/cai';
import { carryOutOffer } from '../lib/cai-acts';
import { caiAnsweringView, chooseCaiAnswer } from '../lib/cai-answers';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function caiRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/cai', async (req): Promise<CaiResponse> => {
    const auth = requireAuth(req);
    return caiSettings(ctx, auth.userId);
  });

  app.post('/cai/forget', async (req): Promise<CaiResponse> => {
    const auth = requireAuth(req);
    const body = parse(CaiForgetBody, req.body ?? {});
    await forgetLearned(ctx, auth.userId, body.kind);
    return caiSettings(ctx, auth.userId);
  });

  /**
   * The stranger's choice on Cai's first line when it answers for someone (R116, M17 I16a): their
   * message left as it was, or a talk with Cai now on their own allowance. Theirs alone, once.
   */
  app.post('/conversations/:id/cai-answer', async (req): Promise<CaiAnswerChosenResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { choice } = parse(CaiAnswerBody, req.body);
    await chooseCaiAnswer(ctx, auth.userId, id, choice);
    return { caiAnswering: await caiAnsweringView(ctx, id, auth.userId) };
  });

  app.post('/messages/:id/follow-up', async (req): Promise<FollowUpSentResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    ctx.limiter.hit(`send:${auth.userId}`, ctx.config.isTest ? 10_000 : 120, 60_000);
    return sendFollowUp(ctx, auth.userId, id);
  });

  // What Cai offered to do, as theirs (G14): into the chat it named, or the one the app just
  // opened with whom it's for.
  app.post('/messages/:id/offer', async (req): Promise<OfferDoneResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(
      z.object({
        conversationId: z.string().uuid().nullable().optional(),
        instead: z.boolean().optional(),
      }),
      req.body ?? {},
    );
    ctx.limiter.hit(`send:${auth.userId}`, ctx.config.isTest ? 10_000 : 120, 60_000);
    return carryOutOffer(ctx, auth.userId, id, body.conversationId ?? null, body.instead ?? false);
  });
}
