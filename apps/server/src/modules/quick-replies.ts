/**
 * An organization's quick replies (M16 H2): its team reads them, in the composer of a customer's
 * conversation; its owner and admins keep them, saving the whole list from the setup screen.
 */
import { QuickRepliesBody, type QuickRepliesResponse } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { teamOf } from '../lib/business';
import { notFound } from '../lib/errors';
import { quickReplies, saveQuickReplies } from '../lib/org-replies';
import { managerSeat, orgSeat } from '../lib/orgs';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function quickReplyRoutes(app: FastifyInstance, ctx: AppContext) {
  const orgParam = z.object({ id: z.string().uuid() });

  app.get('/orgs/:id/quick-replies', async (req): Promise<QuickRepliesResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(orgParam, req.params);
    // A seat on its team (a closed organization's seats ended as it closed).
    if (!(await orgSeat(ctx.db, auth.userId, id))) throw notFound(tr('That organization'));
    return { replies: await quickReplies(ctx, id) };
  });

  app.put('/orgs/:id/quick-replies', async (req): Promise<QuickRepliesResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(orgParam, req.params);
    const body = parse(QuickRepliesBody, req.body);
    await managerSeat(ctx.db, auth.userId, id);
    const replies = await saveQuickReplies(ctx, id, auth.userId, body.replies);
    // The rest of the team's composers ask again (their list is kept a while otherwise).
    await ctx.bus.publish(await teamOf(ctx.db, id), {
      type: 'business.updated',
      data: { orgId: id, quickReplies: true },
    });
    return { replies };
  });
}
