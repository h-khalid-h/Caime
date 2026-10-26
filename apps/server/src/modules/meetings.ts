/**
 * Meetings (R83, R84): inviting a guest by address, or by a link to send (H6). The space and the mail are
 * `lib/meeting-guests.ts`'s; this is the route. A guest's way in, which makes a session, is
 * with the other ways in, in `auth.ts`. A meeting's short address (M16 F6d) is opened here too,
 * for someone in its conversation (`lib/meeting-codes.ts`).
 */
import type { MeetingGuestResponse, MeetingLinkResponse } from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { meetingByCode } from '../lib/meeting-codes';
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

  /** Where a meeting's short address leads (M16 F6d): its card, for someone in its conversation. */
  app.get('/meeting-links/:code', async (req): Promise<MeetingLinkResponse> => {
    const auth = requireAuth(req);
    const { code } = parse(z.object({ code: z.string().max(20) }), req.params);
    return meetingByCode(ctx, auth.userId, code);
  });
}
