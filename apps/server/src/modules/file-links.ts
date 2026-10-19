/**
 * Links to someone's own files (M16 H6, `lib/file-links.ts`): whoever sent a file makes a link to
 * it, lists their open ones and takes one back; whoever has a live link reads the file through it
 * (`/v1/public/files/<token>`, and its picture's preview), signed in or not as the link asks. The
 * page a link opens is `/f/<token>` (`lib/public-pages.ts`). A link's bytes are the server's to
 * send to anyone, so each link, and each network address, is held to so many an hour.
 */
import { FileLinkBody } from '@caime/core';
import type { FileLinkMadeResponse, FileLinksResponse, OkResponse } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { notFound } from '../lib/errors';
import {
  fileLinksOf,
  fileLinkUrl,
  fileLinkView,
  liveFileLink,
  makeFileLink,
  revokeFileLink,
} from '../lib/file-links';
import { INLINE_TYPES, largeOf, streamFile } from '../lib/file-stream';
import { storageFor } from '../lib/storage';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

/** What one link sends in an hour, and one network address through any links. */
export const LINK_FETCHES_AN_HOUR = 300;
export const ADDRESS_FETCHES_AN_HOUR = 120;
/** A link's bytes may be taken back at any moment: nobody's cache keeps them. */
const NOT_KEPT = 'private, no-store';

export async function fileLinkRoutes(app: FastifyInstance, ctx: AppContext) {
  const storage = storageFor(ctx.config);
  const idParam = z.object({ id: z.string().uuid() });
  const tokenParam = z.object({ token: z.string().max(64) });

  app.post('/files/:id/links', async (req, reply): Promise<FileLinkMadeResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const body = parse(FileLinkBody, req.body ?? {});
    const { link, token } = await makeFileLink(ctx, auth.userId, id, body);
    ctx.metrics.fileLinks.inc({ outcome: 'made' });
    reply.status(201);
    return { link: fileLinkView(link), url: fileLinkUrl(ctx, token) };
  });

  app.get('/files/:id/links', async (req): Promise<FileLinksResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    return { links: await fileLinksOf(ctx, auth.userId, id) };
  });

  app.delete('/file-links/:id', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    if (!(await revokeFileLink(ctx, auth.userId, id))) throw notFound(tr('That link'));
    return { ok: true };
  });

  /** The link a token stands for, open to whoever asks, within the hour's allowance. */
  const opened = async (req: FastifyRequest, linkKey: boolean) => {
    const { token } = parse(tokenParam, req.params);
    const found = await liveFileLink(ctx, token, req.auth?.userId ?? null);
    if (!found || found === 'sign-in') throw notFound(tr('That link'));
    const hour = 3_600_000;
    ctx.limiter.hit(
      `file-link:ip:${req.ip}`,
      ctx.config.isTest ? 10_000 : ADDRESS_FETCHES_AN_HOUR,
      hour,
    );
    if (linkKey)
      ctx.limiter.hit(
        `file-link:${found.link.id}`,
        ctx.config.isTest ? 10_000 : LINK_FETCHES_AN_HOUR,
        hour,
      );
    return found;
  };

  // The file itself: shown in place where a browser shows its kind, else saved; `?download=1`
  // saves it whatever it is.
  app.get('/public/files/:token', async (req, reply): Promise<FastifyReply> => {
    const { file } = await opened(req, true);
    const { download } = parse(z.object({ download: z.enum(['1', 'true']).optional() }), req.query);
    ctx.metrics.fileLinks.inc({ outcome: 'fetched' });
    return streamFile(
      req,
      reply.header('referrer-policy', 'no-referrer').header('x-robots-tag', 'noindex'),
      storage,
      file,
      INLINE_TYPES.has(file.mime) && !download,
      NOT_KEPT,
    );
  });

  // A picture drawn on the link's page (R70): its preview, else the cleaned original.
  app.get('/public/files/:token/preview', async (req, reply): Promise<FastifyReply> => {
    const { file } = await opened(req, false);
    if (!file.thumb_key) throw notFound(tr('That photo'));
    return streamFile(
      req,
      reply.header('referrer-policy', 'no-referrer').header('x-robots-tag', 'noindex'),
      storage,
      await largeOf(storage, file),
      true,
      NOT_KEPT,
    );
  });
}
