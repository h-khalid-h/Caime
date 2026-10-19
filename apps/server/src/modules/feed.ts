/**
 * A person's feed (M16 G5): what reached them, newest first, or in order after the cursor it
 * gave. A token reaches it with `messages:read` (lib/access.ts), the bridges' trigger.
 */
import { FeedQuery, type FeedResponse } from '@caime/core';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { personFeed } from '../lib/feed';
import { orgsClosedToApps } from '../lib/member-apps';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function feedRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/feed', async (req): Promise<FeedResponse> => {
    const auth = requireAuth(req);
    const q = parse(FeedQuery, req.query);
    // A poller asks every minute or so; this is room for several, never a loop.
    ctx.limiter.hit(`feed:${auth.userId}`, ctx.config.isTest ? 10_000 : 60, 60_000);
    return personFeed(ctx, auth.userId, {
      after: q.after ?? null,
      limit: q.limit,
      conversationId: q.conversation ?? null,
      mine: q.mine === '1',
      closed: await orgsClosedToApps(ctx, auth),
    });
  });
}
