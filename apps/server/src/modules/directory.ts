/**
 * Discover (R74): the apps people can connect to Caime, a page at a time. Caime's own built-ins
 * come first on the first page; the rest are developers' listed apps, the most connected first.
 * Connecting one is the app's own doing (`connectUrl`, its sign-in, which asks Caime for a grant
 * through OAuth), so nothing here writes.
 */
import {
  canManageOrg,
  type DirectoryAppView,
  DirectoryQuery,
  isBridge,
  isBuiltinApp,
} from '@caime/core';
import type { DirectoryAppResponse, DirectoryResponse, OrgListingsResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { builtinApps, directoryApp, discoverPage, orgListings } from '../lib/app-directory';
import { forbidden, notFound } from '../lib/errors';
import { orgById, orgSeat } from '../lib/orgs';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

/** Does a built-in answer the search and the category, as a listed app would? */
function builtinMatches(b: DirectoryAppView, q: string | undefined, category: string | undefined) {
  if (category && b.category !== category) return false;
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return !needle || `${b.name} ${b.tagline ?? ''}`.toLowerCase().includes(needle);
}

/** Apps act for people over 18 (R29): under it, Discover shows what exists and offers no Connect. */
async function withoutConnectForMinors(
  ctx: AppContext,
  userId: string,
  apps: DirectoryAppView[],
): Promise<DirectoryAppView[]> {
  const me = await ctx.db
    .selectFrom('users')
    .select(['birth_date', 'time_zone', 'age_minor_until'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  if (!minorOf(me, ctx.now())) return apps;
  return apps.map((a) => (a.kind === 'oauth' ? { ...a, connectUrl: null } : a));
}

export async function directoryRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/directory', async (req): Promise<DirectoryResponse> => {
    const auth = requireAuth(req);
    const query = parse(DirectoryQuery, req.query);
    const page = await discoverPage(ctx, auth.userId, query);
    if (query.before)
      return { ...page, apps: await withoutConnectForMinors(ctx, auth.userId, page.apps) };
    // The first page opens with Caime's own, each as the viewer has it.
    const own = (await builtinApps(ctx, auth.userId))
      .filter((b) => builtinMatches(b, query.q, query.category))
      .map(({ on: _on, ...view }) => view);
    return {
      apps: await withoutConnectForMinors(ctx, auth.userId, [...own, ...page.apps]),
      nextBefore: page.nextBefore,
    };
  });

  // The apps published under an organization, with where each listing stands (M10): its owner
  // and admins, who may publish under it, see them on the setup screen.
  app.get('/orgs/:id/listings', async (req): Promise<OrgListingsResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await orgById(ctx.db, id);
    const seat = await orgSeat(ctx.db, auth.userId, id);
    if (!seat) throw notFound(tr('That organization'));
    if (!canManageOrg(seat.role))
      throw forbidden(tr('Only the organization’s owner and admins can.'));
    return { apps: await orgListings(ctx, id) };
  });

  app.get('/directory/:id', async (req): Promise<DirectoryAppResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    if (isBuiltinApp(id) || isBridge(id)) {
      const b = (await builtinApps(ctx, auth.userId)).find((a) => a.id === id);
      if (!b) throw notFound(tr('That app'));
      const { on: _on, ...view } = b;
      return { app: view };
    }
    if (!z.string().uuid().safeParse(id).success) throw notFound(tr('That app'));
    const found = await directoryApp(ctx, auth.userId, id);
    if (!found) throw notFound(tr('That app'));
    const [app] = await withoutConnectForMinors(ctx, auth.userId, [found]);
    return { app: app as DirectoryAppView };
  });
}
