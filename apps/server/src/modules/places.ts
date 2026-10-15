/**
 * Places (R92, `lib/places.ts`): a person's own (`/me/places`), an organization's set by its
 * owner and admins (`/orgs/:id/places`), and what a conversation's card may be filled from.
 */
import { PlacesBody } from '@caime/core';
import type { ConversationPlacesResponse, PlacesResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { canManageOrg } from '@caime/core/orgs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { membership } from '../lib/conversation-views';
import { forbidden, notFound } from '../lib/errors';
import { participantsOf } from '../lib/messages';
import { orgById, orgSeat } from '../lib/orgs';
import { conversationPlaces, myPlaces, savePlaces } from '../lib/places';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function placeRoutes(app: FastifyInstance, ctx: AppContext) {
  const idParam = (req: { params: unknown }) =>
    parse(z.object({ id: z.string().uuid() }), req.params).id;

  app.get('/me/places', async (req): Promise<PlacesResponse> => {
    const auth = requireAuth(req);
    return { places: await myPlaces(ctx, auth.userId) };
  });

  app.put('/me/places', async (req): Promise<PlacesResponse> => {
    const auth = requireAuth(req);
    const { places } = parse(PlacesBody, req.body);
    const me = await ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    return {
      places: await savePlaces(ctx, { userId: auth.userId, minor: minorOf(me, ctx.now()) }, places),
    };
  });

  app.put('/orgs/:id/places', async (req): Promise<PlacesResponse> => {
    const auth = requireAuth(req);
    const id = idParam(req);
    const { places } = parse(PlacesBody, req.body);
    await orgById(ctx.db, id);
    const seat = await orgSeat(ctx.db, auth.userId, id);
    if (!seat) throw notFound(tr('That organization'));
    if (!canManageOrg(seat.role))
      throw forbidden(tr('Only the organization’s owner and admins can.'));
    return { places: await savePlaces(ctx, { orgId: id }, places) };
  });

  app.get('/conversations/:id/places', async (req): Promise<ConversationPlacesResponse> => {
    const auth = requireAuth(req);
    const { conversation } = await membership(ctx, auth.userId, idParam(req));
    const others = (await participantsOf(ctx.db, conversation.id))
      .map((p) => p.user_id)
      .filter((id) => id !== auth.userId);
    const people = others.length
      ? await ctx.db
          .selectFrom('users')
          .select(['id', 'display_name', 'birth_date', 'time_zone'])
          .where('id', 'in', others)
          .where('kind', '=', 'human')
          .where('deleted_at', 'is', null)
          .execute()
      : [];
    return conversationPlaces(ctx, auth.userId, conversation, people);
  });
}
