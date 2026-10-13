/**
 * Meetings (R83, R84): inviting a guest by address. The space and the mail are
 * `lib/meeting-guests.ts`'s; this is the route.
 */
import type { MeetingGuestResponse } from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { inviteGuest } from '../lib/meeting-guests';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const Params = z.object({ id: z.string().uuid() });
const Body = z.object({
  email: z.string().trim().min(3).max(254),
  name: z.string().trim().max(80).nullish(),
});

export async function meetingRoutes(app: FastifyInstance, ctx: AppContext) {
  /** Invite someone by address to an accepted meeting held on Caime (R84). */
  app.post('/messages/:id/guests', async (req, reply): Promise<MeetingGuestResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(Params, req.params);
    const body = parse(Body, req.body);
    const space = await inviteGuest(ctx, auth.userId, id, body);
    reply.status(201);
    return { space };
  });
}
