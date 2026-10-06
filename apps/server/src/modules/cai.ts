/**
 * Cai's own routes (R68): Settings · Cai (what it follows up and what it has learned, to
 * forget), and sending the follow-up it offered, on the person's tap. The work is `lib/cai.ts`.
 */
import { CaiForgetBody } from '@caime/core';
import type { CaiResponse, FollowUpSentResponse } from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { caiSettings, forgetLearned, sendFollowUp } from '../lib/cai';
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

  app.post('/messages/:id/follow-up', async (req): Promise<FollowUpSentResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    ctx.limiter.hit(`send:${auth.userId}`, ctx.config.isTest ? 10_000 : 120, 60_000);
    return sendFollowUp(ctx, auth.userId, id);
  });
}
