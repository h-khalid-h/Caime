/**
 * Messages written now and sent later (M16 E8b, `lib/scheduled-messages.ts`): the sender keeps
 * them, lists their own in a conversation, takes one back or sends it at once. Only Caime's own
 * app reaches these: a token acting for someone sends when it sends.
 */
import { ScheduleMessageBody } from '@caime/core';
import type {
  OkResponse,
  ScheduledMessageResponse,
  ScheduledMessagesResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { badRequest } from '../lib/errors';
import {
  deleteScheduled,
  scheduledIn,
  scheduleMessage,
  sendScheduled,
} from '../lib/scheduled-messages';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const IdParam = z.object({ id: z.string().uuid() });

export async function scheduledMessageRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/conversations/:id/scheduled', async (req): Promise<ScheduledMessagesResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(IdParam, req.params);
    return { scheduled: await scheduledIn(ctx, auth.userId, id) };
  });

  app.post(
    '/conversations/:id/scheduled',
    async (req, reply): Promise<ScheduledMessageResponse> => {
      const auth = requireAuth(req);
      const { id } = parse(IdParam, req.params);
      const body = parse(ScheduleMessageBody, req.body);
      ctx.limiter.hit(`schedule:${auth.userId}`, ctx.config.isTest ? 10_000 : 30, 60_000);
      reply.status(201);
      return { scheduled: await scheduleMessage(ctx, auth.userId, id, body) };
    },
  );

  app.delete('/scheduled/:id', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(IdParam, req.params);
    await deleteScheduled(ctx, auth.userId, id);
    return { ok: true };
  });

  // Sent at once, before its time or again after it couldn't go.
  app.post('/scheduled/:id/send', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(IdParam, req.params);
    ctx.limiter.hit(`send:${auth.userId}`, ctx.config.isTest ? 10_000 : 120, 60_000);
    const sent = await sendScheduled(ctx, id, { by: auth.userId });
    if (sent && 'failure' in sent)
      throw badRequest(sent.failure || tr('That message couldn’t be sent.'));
    return { ok: true };
  });
}
