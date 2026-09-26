/**
 * @handle links (PRD §11): a shared link names a handle, and handles are one namespace, so it
 * opens a person or an organization. A person is found here exactly as search would find them.
 */
import { type HandleView, handleError, isMinor, normalizeHandle } from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { notFound } from '../lib/errors';
import { between } from '../lib/relations';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function handleRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/handles/:handle', async (req): Promise<HandleView> => {
    const auth = requireAuth(req);
    const { handle } = parse(z.object({ handle: z.string().max(60) }), req.params);
    ctx.limiter.hit(`handle-open:${auth.userId}`, ctx.config.isTest ? 1000 : 120, 60_000);
    const wanted = normalizeHandle(handle);
    // Nobody by that handle, and somebody you can't find, answer the same.
    const nobody = () => notFound('That handle');
    if (handleError(wanted)) throw nobody();

    const org = await ctx.db
      .selectFrom('organizations')
      .select(['id', 'handle'])
      .where('handle', '=', wanted)
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (org) return { kind: 'org', id: org.id, handle: org.handle };

    const user = await ctx.db
      .selectFrom('users')
      .select(['id', 'handle', 'birth_year', 'privacy'])
      .where('handle', '=', wanted)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!user) throw nobody();
    const found: HandleView = { kind: 'person', id: user.id, handle: user.handle };
    if (user.id === auth.userId) return found;
    const b = await between(ctx.db, auth.userId, user.id);
    if (b.blockedMe) throw nobody();
    // Already in touch, or blocked by you (so you can unblock): always.
    if (b.connected || b.incomingRequestId || b.outgoingRequestId || b.blockedByMe) return found;
    // Anyone else only as their privacy allows, and adults never find under-18s (R29).
    if ((user.privacy as { discoverByHandle?: boolean } | null)?.discoverByHandle === false)
      throw nobody();
    const me = await ctx.db
      .selectFrom('users')
      .select('birth_year')
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    const now = ctx.now();
    if (isMinor(user.birth_year, now) && !isMinor(me.birth_year, now)) throw nobody();
    return found;
  });
}
