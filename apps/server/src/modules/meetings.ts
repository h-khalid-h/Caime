/**
 * Meetings (R83, R84): inviting a guest by address, or by a link to send (H6). The space and the mail are
 * `lib/meeting-guests.ts`'s; this is the route. A guest's way in, which makes a session, is
 * with the other ways in, in `auth.ts`.
 */
import type { MeetingGuestResponse } from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { inviteGuest, inviteGuestByLink } from '../lib/meeting-guests';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const Params = z.object({ id: z.string().uuid() });
/** By address (mailed), or by link (`link: true`, a name alone; the link comes back this once). */
const Body = z.union([
  z.object({
    email: z.string().trim().min(3).max(254),
    name: z.string().trim().max(80).nullish(),
  }),
  z.object({ link: z.literal(true), name: z.string().trim().min(1).max(80) }).strict(),
]);

export async function meetingRoutes(app: FastifyInstance, ctx: AppContext) {
  /** Invite someone by address to an accepted meeting held on Caime (R84). */
  app.post('/messages/:id/guests', async (req, reply): Promise<MeetingGuestResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(Params, req.params);
    const body = parse(Body, req.body);
    reply.status(201);
    if ('link' in body) {
      const { link, ...space } = await inviteGuestByLink(ctx, auth.userId, id, body);
      return { space, link };
    }
    return { space: await inviteGuest(ctx, auth.userId, id, body), link: null };
  });
}
