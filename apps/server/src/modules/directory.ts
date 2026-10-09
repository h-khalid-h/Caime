/**
 * Discover (R74): the apps people can connect to Caime, a page at a time. Caime's own built-ins
 * come first on the first page; the rest are developers' listed apps, the most connected first.
 * Connecting one is the app's own doing (`connectUrl`, its sign-in, which asks Caime for a grant
 * through OAuth), so nothing here writes.
 */
import { type DirectoryAppView, DirectoryQuery, isBuiltinApp } from '@caime/core';
import type { DirectoryAppResponse, DirectoryResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { builtinApps, directoryApp, discoverPage } from '../lib/app-directory';
import { notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

/** Does a built-in answer the search and the category, as a listed app would? */
function builtinMatches(b: DirectoryAppView, q: string | undefined, category: string | undefined) {
  if (category && b.category !== category) return false;
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return !needle || `${b.name} ${b.tagline ?? ''}`.toLowerCase().includes(needle);
}

export async function directoryRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/directory', async (req): Promise<DirectoryResponse> => {
    const auth = requireAuth(req);
    const query = parse(DirectoryQuery, req.query);
    const page = await discoverPage(ctx, auth.userId, query);
    if (query.before) return page;
    // The first page opens with Caime's own, each as the viewer has it.
    const own = (await builtinApps(ctx, auth.userId))
      .filter((b) => builtinMatches(b, query.q, query.category))
      .map(({ on: _on, ...view }) => view);
    return { apps: [...own, ...page.apps], nextBefore: page.nextBefore };
  });

  app.get('/directory/:id', async (req): Promise<DirectoryAppResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    if (isBuiltinApp(id)) {
      const b = (await builtinApps(ctx, auth.userId)).find((a) => a.id === id);
      if (!b) throw notFound(tr('That app'));
      const { on: _on, ...view } = b;
      return { app: view };
    }
    if (!z.string().uuid().safeParse(id).success) throw notFound(tr('That app'));
    const found = await directoryApp(ctx, auth.userId, id);
    if (!found) throw notFound(tr('That app'));
    return { app: found };
  });
}
