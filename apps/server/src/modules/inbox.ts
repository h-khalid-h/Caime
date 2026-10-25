/**
 * The inbox's routes (R88, M16 D1): one list, every conversation with its section and rank, which
 * the app sections itself; the builder is `lib/inbox.ts`, shared with what someone missed (M17 I3).
 */
import type { InboxAllResponse, InboxResponse } from '@caime/core';
import { InboxQuery } from '@caime/core';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { buildInbox } from '../lib/inbox';
import { orgsClosedToApps } from '../lib/member-apps';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function inboxRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/inbox', async (req): Promise<InboxResponse | InboxAllResponse> => {
    const auth = requireAuth(req);
    const { view } = parse(InboxQuery, req.query);
    const inbox = await buildInbox(ctx, auth.userId, await orgsClosedToApps(ctx, auth));
    // `all` is every conversation, each with its section and rank: the app sections them and
    // makes its All list itself (core `inboxSections`, `inboxAllList`), so one request serves both.
    if (view === 'all')
      return { conversations: inbox.conversations, counts: inbox.counts, headline: inbox.headline };
    return { sections: inbox.sections, counts: inbox.counts, headline: inbox.headline };
  });
}
