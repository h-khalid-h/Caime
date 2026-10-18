/**
 * Link previews (M16 E4c, `lib/link-previews.ts`): the composer's card before a text is sent,
 * read through the same cache the sent message's card is, and Caime's copy of a page's picture,
 * so the reader's device never asks the site for anything.
 */
import { assessLink } from '@caime/core';
import type { LinkPreviewResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { LinkPreviewQuery } from '@caime/core/schemas';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { notFound } from '../lib/errors';
import { languageOfRequest } from '../lib/i18n';
import { previewUrl, previewView } from '../lib/link-preview-views';
import { previewFor } from '../lib/link-previews';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function linkRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  /**
   * The page behind a link being written, for the composer's card: only for a conversation
   * that isn't private (the app never asks for one that is), never for a suspicious link.
   */
  app.get('/links/preview', async (req): Promise<LinkPreviewResponse> => {
    const auth = requireAuth(req);
    const query = parse(LinkPreviewQuery, req.query);
    ctx.limiter.hit(`link-preview:${auth.userId}`, ctx.config.isTest ? 1000 : 30, 60_000);
    const url = previewUrl(query.url);
    if (!ctx.config.LINK_PREVIEWS || !url || assessLink(url).suspicious) return { preview: null };
    const got = await previewFor(ctx, url, languageOfRequest(req));
    return { preview: got?.row.status === 'ready' ? previewView(got.row, url) : null };
  });

  /** Caime's copy of a page's picture: to anyone signed in, by the preview's id alone. */
  app.get('/links/:id/image', async (req, reply): Promise<FastifyReply> => {
    requireAuth(req);
    const { id } = parse(z.object({ id: z.string().regex(/^[0-9a-f]{64}$/) }), req.params);
    const row = await ctx.db
      .selectFrom('link_previews')
      .select('image')
      .where('id', '=', id)
      .where('status', '=', 'ready')
      .executeTakeFirst();
    if (!row?.image) throw notFound(tr('That photo'));
    return reply
      .header('content-type', 'image/webp')
      .header('cache-control', 'private, max-age=86400')
      .send(row.image);
  });
}
