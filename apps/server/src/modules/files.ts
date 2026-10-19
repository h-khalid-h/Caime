/**
 * Files (PRD §26, §46, §79; ADR-13): uploads (single request or resumable chunks), thumbnails,
 * authorized downloads with byte ranges, and avatars under the owner's privacy rules.
 *
 * Photos are re-encoded without metadata, so a picture never reveals where it was taken.
 */

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { canSee, uuidv7, viewable, viewKindOf } from '@caime/core';
import type { FileResponse, UploadChunkResponse, UploadStartResponse } from '@caime/core/api';
import { currentTranslator, tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { USER_COLUMNS } from '../db/schema';
import { isPublicItem, itemsFor, orgHost, personHost } from '../lib/booking';
import { AppError, badRequest, notFound } from '../lib/errors';
import { INLINE_TYPES, largeOf, streamFile } from '../lib/file-stream';
import { VIEW_CSP, viewBodyOf, viewPage } from '../lib/file-views';
import { finalizeFile, storeFile } from '../lib/files';
import { asReader } from '../lib/i18n';
import { fileView } from '../lib/messages';
import { requireOperator } from '../lib/operator';
import { orgSeat } from '../lib/orgs';
import { shellFaces } from '../lib/page-style';
import { assertStorage, lockStorage } from '../lib/plans';
import { NOBODY } from '../lib/public-pages';
import { viewerRelation } from '../lib/relations';
import { storageFor } from '../lib/storage';
import { minorOf, privacyOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const MAX_BYTES = 100 * 1024 * 1024;

/** Asked for, and let through: what the marketplace and Discover show (R74, R80). */
const isListed = (c: {
  listed_at: Date | null;
  reviewed_at: Date | null;
  declined_reason: string | null;
}) => Boolean(c.listed_at && c.reviewed_at && !c.declined_reason);
export async function canReadFile(
  ctx: AppContext,
  userId: string,
  fileId: string,
): Promise<boolean> {
  const row = await ctx.db
    .selectFrom('files')
    .select('owner_id')
    .where('id', '=', fileId)
    .executeTakeFirst();
  if (!row) return false;
  if (row.owner_id === userId) return true;
  const shared = await ctx.db
    .selectFrom('message_files as mf')
    .innerJoin('messages as m', 'm.id', 'mf.message_id')
    .innerJoin('participants as p', (j) =>
      j.onRef('p.conversation_id', '=', 'm.conversation_id').on('p.user_id', '=', userId),
    )
    .select('mf.file_id')
    .where('mf.file_id', '=', fileId)
    .where('m.deleted_at', 'is', null)
    .where('p.left_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  if (shared) return true;
  // Or in an album in a conversation they're in (PRD §41), while the album is there.
  const inAlbum = await ctx.db
    .selectFrom('album_photos as a')
    .innerJoin('messages as m', 'm.id', 'a.message_id')
    .innerJoin('participants as p', (j) =>
      j.onRef('p.conversation_id', '=', 'm.conversation_id').on('p.user_id', '=', userId),
    )
    .select('a.file_id')
    .where('a.file_id', '=', fileId)
    .where('m.deleted_at', 'is', null)
    .where('p.left_at', 'is', null)
    .limit(1)
    .executeTakeFirst();
  return Boolean(inAlbum);
}

export async function fileRoutes(app: FastifyInstance, ctx: AppContext) {
  const storage = storageFor(ctx.config);

  app.addContentTypeParser('application/offset+octet-stream', (_req, payload, done) =>
    done(null, payload),
  );

  app.post('/files', async (req, reply): Promise<FileResponse> => {
    const auth = requireAuth(req);
    ctx.limiter.hit(`upload:${auth.userId}`, ctx.config.isTest ? 10_000 : 300, 3_600_000);
    const part = await req.file({ limits: { fileSize: MAX_BYTES } });
    if (!part) throw badRequest(tr('Attach a file.'));
    const q = parse(
      z.object({
        durationMs: z.coerce
          .number()
          .int()
          .min(0)
          .max(4 * 3_600_000)
          .optional(),
      }),
      req.query,
    );
    // Nothing more once the plan's storage is full; the file's own size is checked below.
    await assertStorage(ctx, auth.userId, 1);
    const id = uuidv7();
    const tempKey = `tmp/${id}`;
    const hash = createHash('sha256');
    let bytes = 0;
    // Hash in-line: a 'data' listener would start the stream flowing before the writer attaches.
    const hasher = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        bytes += chunk.length;
        cb(null, chunk);
      },
    });
    await storage.write(tempKey, part.file.pipe(hasher));
    if (part.file.truncated) {
      await storage.remove(tempKey);
      throw new AppError(413, 'too_large', tr('That file is over 100 MB.'));
    }
    try {
      await assertStorage(ctx, auth.userId, bytes);
    } catch (err) {
      await storage.remove(tempKey);
      throw err;
    }
    const name = (part.filename || 'file').slice(0, 200);
    const file = await storeFile(ctx, storage, {
      id,
      ownerId: auth.userId,
      tempKey,
      mime: part.mimetype,
      name,
      durationMs: q.durationMs ?? null,
      sha256: hash.digest('hex'),
    });
    reply.status(201);
    return { file: fileView(file) };
  });

  // --- Resumable uploads (tus-style): create, append chunks at an offset, resume after a drop ---

  app.post('/uploads', async (req, reply): Promise<UploadStartResponse> => {
    const auth = requireAuth(req);
    const body = parse(
      z.object({
        name: z.string().min(1).max(200),
        mime: z.string().max(120),
        size: z.number().int().min(1).max(MAX_BYTES),
        durationMs: z.number().int().min(0).optional(),
      }),
      req.body,
    );
    const id = uuidv7();
    // Counted and added one at a time for each person (M16 H1): two at once never both fit.
    await ctx.db.transaction().execute(async (trx) => {
      await lockStorage(trx, auth.userId);
      await assertStorage(ctx, auth.userId, body.size, trx);
      await trx
        .insertInto('files')
        .values({
          id,
          owner_id: auth.userId,
          storage_key: `tmp/${id}`,
          name: body.name,
          mime: body.mime,
          size: body.size,
          kind: 'other',
          duration_ms: body.durationMs ?? null,
          status: 'uploading',
          created_at: ctx.now(),
        })
        .execute();
    });
    reply.status(201).header('upload-offset', '0');
    return { id, offset: 0 };
  });

  app.head('/uploads/:id', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const f = await ctx.db
      .selectFrom('files')
      .selectAll()
      .where('id', '=', id)
      .where('owner_id', '=', auth.userId)
      .executeTakeFirst();
    if (!f) throw notFound(tr('That upload'));
    reply
      .header('upload-offset', String(f.upload_offset))
      .header('upload-length', String(f.size))
      .header('cache-control', 'no-store');
    return reply.send();
  });

  app.patch(
    '/uploads/:id',
    { bodyLimit: 16 * 1024 * 1024 },
    async (req): Promise<UploadChunkResponse> => {
      const auth = requireAuth(req);
      const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
      const offset = Number(req.headers['upload-offset']);
      // The chunk lands in a file of its own first: the row's lock and the transaction are held
      // only while it's appended from disk, never while a slow phone is still sending (review
      // 2026-10-17 §4 H4: twenty such uploads held every connection in the pool).
      const spool = join(tmpdir(), `caime-chunk-${randomUUID()}`);
      await pipeline(req.body as Readable, createWriteStream(spool));
      // One chunk at a time: the row is locked while the chunk is appended and the offset moves,
      // so two chunks sent at once (a retry racing its original) never interleave their bytes;
      // the second waits, finds the offset moved, and is told where to resume.
      const { f, written } = await ctx.db
        .transaction()
        .execute(async (trx) => {
          const f = await trx
            .selectFrom('files')
            .selectAll()
            .where('id', '=', id)
            .where('owner_id', '=', auth.userId)
            .forUpdate()
            .executeTakeFirst();
          if (!f) throw notFound(tr('That upload'));
          if (f.status !== 'uploading')
            throw new AppError(409, 'upload_complete', tr('This upload is already complete.'));
          if (!Number.isInteger(offset) || offset !== Number(f.upload_offset)) {
            throw new AppError(409, 'offset_mismatch', tr('Resume from the server’s offset.'), {
              offset: Number(f.upload_offset),
            });
          }
          const written = await storage.append(f.storage_key, createReadStream(spool));
          if (written > Number(f.size)) {
            await storage.remove(f.storage_key);
            await trx.updateTable('files').set({ status: 'failed' }).where('id', '=', id).execute();
            throw badRequest(tr('More bytes than declared.'));
          }
          await trx
            .updateTable('files')
            .set({ upload_offset: written })
            .where('id', '=', id)
            .execute();
          return { f, written };
        })
        .finally(() => rm(spool, { force: true }));
      if (written < Number(f.size)) return { id, offset: written, complete: false };
      const done = await finalizeFile(
        ctx,
        storage,
        id,
        f.storage_key,
        f.mime,
        f.name,
        f.duration_ms,
      ).catch(async (err) => {
        await ctx.db.updateTable('files').set({ status: 'failed' }).where('id', '=', id).execute();
        throw err;
      });
      const updated = await ctx.db
        .updateTable('files')
        .set({
          storage_key: done.key,
          mime: done.sniffed.mime,
          kind: done.sniffed.kind,
          size: done.size,
          width: done.width,
          height: done.height,
          thumb_key: done.thumbKey,
          preview_key: done.previewKey,
          upload_offset: done.size,
          status: 'ready',
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return { id, offset: done.size, complete: true, file: fileView(updated) };
    },
  );

  // --- Reading ---------------------------------------------------------------------------------

  app.get('/files/:id', async (req, reply): Promise<FastifyReply> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (!(await canReadFile(ctx, auth.userId, id))) throw notFound(tr('That file'));
    const f = await ctx.db
      .selectFrom('files')
      .selectAll()
      .where('id', '=', id)
      .where('status', '=', 'ready')
      .executeTakeFirst();
    if (!f) throw notFound(tr('That file'));
    const { download } = parse(z.object({ download: z.enum(['1', 'true']).optional() }), req.query);
    return streamFile(req, reply, storage, f, INLINE_TYPES.has(f.mime) && !download);
  });

  /**
   * What a Word document, a workbook, a deck, a list of values or plain words holds, as a page
   * (M16 H6): what a browser opens in place of the download, in the reader's words. Nothing on it
   * runs or loads but the shell's fonts.
   */
  const faces = shellFaces(ctx.config.WEB_DIR);
  app.get('/files/:id/view', async (req, reply): Promise<FastifyReply> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (!(await canReadFile(ctx, auth.userId, id))) throw notFound(tr('That file'));
    const f = await ctx.db
      .selectFrom('files')
      .select(['id', 'name', 'mime', 'size', 'storage_key'])
      .where('id', '=', id)
      .where('status', '=', 'ready')
      .executeTakeFirst();
    const kind = f ? viewKindOf(f.mime, f.name) : null;
    if (!f || !kind || !viewable(f.mime, f.name, Number(f.size))) throw notFound(tr('That file'));
    const html = await asReader(ctx, auth.userId, async () => {
      const language = currentTranslator().language;
      const body = await viewBodyOf(storage, f, kind, language);
      ctx.metrics.fileViews.inc({ kind, outcome: body ? 'shown' : 'unreadable' });
      return viewPage({
        name: f.name,
        kind,
        size: Number(f.size),
        body,
        download: `/v1/files/${f.id}?download=1`,
        faces,
        lang: language,
        rtl: language === 'ar',
      });
    });
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('content-security-policy', VIEW_CSP)
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'no-referrer')
      .header('x-robots-tag', 'noindex')
      .header('cache-control', 'private, no-store')
      .send(html);
  });

  app.get('/files/:id/thumb', async (req, reply): Promise<FastifyReply> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (!(await canReadFile(ctx, auth.userId, id))) throw notFound(tr('That file'));
    const f = await ctx.db
      .selectFrom('files')
      .select(['thumb_key', 'name'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!f?.thumb_key) throw notFound(tr('That thumbnail'));
    const size = (await storage.size(f.thumb_key)) ?? 0;
    return streamFile(
      req,
      reply,
      storage,
      { name: `${f.name}.webp`, mime: 'image/webp', size, storage_key: f.thumb_key },
      true,
    );
  });

  /**
   * What's drawn large (R70): the preview, or for an older image the backfill hasn't reached yet,
   * the cleaned original, never the thumbnail stretched.
   */
  app.get('/files/:id/preview', async (req, reply): Promise<FastifyReply> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (!(await canReadFile(ctx, auth.userId, id))) throw notFound(tr('That file'));
    const f = await ctx.db
      .selectFrom('files')
      .select(['preview_key', 'thumb_key', 'storage_key', 'mime', 'name', 'size'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!f?.thumb_key) throw notFound(tr('That photo'));
    return streamFile(req, reply, storage, await largeOf(storage, f), true);
  });

  /** An organization's logo: on its public page (R44), so anyone may see it. */
  app.get('/orgs/:id/avatar', async (req, reply): Promise<FastifyReply> => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const org = await ctx.db
      .selectFrom('organizations')
      .select('avatar_file_id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!org?.avatar_file_id) throw notFound(tr('That logo'));
    const f = await ctx.db
      .selectFrom('files')
      .selectAll()
      .where('id', '=', org.avatar_file_id)
      .executeTakeFirst();
    if (!f) throw notFound(tr('That logo'));
    const key = f.thumb_key ?? f.storage_key;
    const size = (await storage.size(key)) ?? Number(f.size);
    reply.header('cache-control', 'private, max-age=3600');
    return streamFile(
      req,
      reply,
      storage,
      { name: 'logo.webp', mime: f.thumb_key ? 'image/webp' : f.mime, size, storage_key: key },
      true,
    );
  });

  /**
   * A person's photo, as their privacy shows it to the viewer; to nobody signed in, only a
   * photo shown to everyone by someone who can be found by handle (their public page, R44).
   */
  app.get('/users/:id/avatar', async (req, reply): Promise<FastifyReply> => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const user = await ctx.db
      .selectFrom('users')
      .select(USER_COLUMNS)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!user?.avatar_file_id) throw notFound(tr('That avatar'));
    const privacy = privacyOf(user, ctx.now());
    const relation = req.auth
      ? await viewerRelation(ctx.db, id, req.auth.userId)
      : privacy.discoverByHandle && !minorOf(user, ctx.now())
        ? NOBODY
        : null;
    if (!relation || !canSee(privacy, 'profilePhoto', relation)) throw notFound(tr('That avatar'));
    const f = await ctx.db
      .selectFrom('files')
      .selectAll()
      .where('id', '=', user.avatar_file_id)
      .executeTakeFirst();
    if (!f) throw notFound(tr('That avatar'));
    const key = f.thumb_key ?? f.storage_key;
    const size = (await storage.size(key)) ?? Number(f.size);
    reply.header('cache-control', 'private, max-age=3600');
    return streamFile(
      req,
      reply,
      storage,
      { name: 'avatar.webp', mime: f.thumb_key ? 'image/webp' : f.mime, size, storage_key: key },
      true,
    );
  });

  /**
   * An item's photo (R63): to anyone where the item is public (on a public page), else to whoever
   * its audience lets see it, as the catalog shows it to them. Nothing of an item they can't see.
   */
  const itemPhoto = async (
    kind: 'orgs' | 'people',
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    const { id, itemId } = parse(
      z.object({ id: z.string().uuid(), itemId: z.string().max(40) }),
      req.params,
    );
    const missing = () => notFound(tr('That photo'));
    let fileId: string | null = null;
    if (kind === 'orgs') {
      const org = await ctx.db
        .selectFrom('organizations')
        .select(['id', 'booking', 'booking_items', 'ordering', 'collections', 'archived_at'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!org || org.archived_at) throw missing();
      const host = orgHost(org);
      const item = host.items.find((i) => i.id === itemId);
      if (!item?.photoFileId) throw missing();
      const seat = req.auth ? await orgSeat(ctx.db, req.auth.userId, id) : null;
      const seen =
        isPublicItem(host, item) ||
        (req.auth &&
          itemsFor(host, {
            isSelf: Boolean(seat),
            isConnected: true,
            spheres: [],
            adult: true,
          }).some((i) => i.id === itemId));
      if (!seen) throw missing();
      fileId = item.photoFileId;
    } else {
      const user = await ctx.db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .where('suspended_at', 'is', null)
        .executeTakeFirst();
      if (user?.kind !== 'human') throw missing();
      const host = personHost(user);
      const item = host.items.find((i) => i.id === itemId);
      if (!item?.photoFileId) throw missing();
      const relation = req.auth
        ? await viewerRelation(ctx.db, id, req.auth.userId)
        : privacyOf(user, ctx.now()).discoverByHandle && !minorOf(user, ctx.now())
          ? NOBODY
          : null;
      const seen =
        relation &&
        !relation.blocked &&
        (isPublicItem(host, item) ||
          itemsFor(host, {
            isSelf: relation.isSelf,
            isConnected: relation.isConnected,
            spheres: relation.ownerSpheresForViewer,
            adult: true,
          }).some((i) => i.id === itemId));
      if (!seen) throw missing();
      fileId = item.photoFileId;
    }
    const f = await ctx.db
      .selectFrom('files')
      .selectAll()
      .where('id', '=', fileId)
      .executeTakeFirst();
    // A re-encoded image only (its renditions say so): never an original with its metadata.
    if (f?.kind !== 'image' || !f.thumb_key) throw missing();
    reply.header('cache-control', 'private, max-age=3600');
    return streamFile(
      req,
      reply,
      storage,
      { ...(await largeOf(storage, f)), name: 'item.webp' },
      true,
    );
  };
  app.get('/orgs/:id/items/:itemId/photo', (req, reply) => itemPhoto('orgs', req, reply));
  app.get('/people/:id/items/:itemId/photo', (req, reply) => itemPhoto('people', req, reply));

  /**
   * An app's icon in Discover (R74): a listed app's for anyone signed in, else its owner's own
   * (a developer sees their listing before it's let through); drawn at its size through the
   * same renditions as any image. The address changes with the file (`appIconPath`), so it's
   * cached as any file is.
   */
  const appIcon = async (
    req: FastifyRequest,
    reply: FastifyReply,
    id: string,
    allowed: (c: {
      owner_id: string;
      listed_at: Date | null;
      reviewed_at: Date | null;
      declined_reason: string | null;
    }) => boolean,
  ) => {
    const missing = () => notFound(tr('That app'));
    const c = await ctx.db
      .selectFrom('oauth_clients')
      .select(['owner_id', 'icon_file_id', 'listed_at', 'reviewed_at', 'declined_reason'])
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (!c?.icon_file_id || !allowed(c)) throw missing();
    const f = await ctx.db
      .selectFrom('files')
      .selectAll()
      .where('id', '=', c.icon_file_id)
      .executeTakeFirst();
    // A re-encoded image only (its renditions say so): never an original with its metadata.
    if (f?.kind !== 'image' || !f.thumb_key) throw missing();
    return streamFile(
      req,
      reply,
      storage,
      { ...(await largeOf(storage, f)), name: 'icon.webp' },
      true,
    );
  };
  app.get('/directory/:id/icon', async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    // Listed, to anyone (the marketplace shows it to visitors, R80); else the owner's own, or
    // one the viewer let in (Connected shows it either way, M8).
    const userId = req.auth?.userId ?? null;
    const granted = userId
      ? await ctx.db
          .selectFrom('oauth_grants')
          .select('id')
          .where('client_id', '=', id)
          .where('user_id', '=', userId)
          .where('revoked_at', 'is', null)
          .executeTakeFirst()
      : undefined;
    return appIcon(
      req,
      reply,
      id,
      (c) => isListed(c) || c.owner_id === userId || granted !== undefined,
    );
  });

  /**
   * A listing's screenshot (R80), by its place, from its preview rendition (R70): a listed app's
   * to anyone, as its marketplace page is; else its owner's, who sees it before it's let through.
   */
  const appScreenshot = async (
    req: FastifyRequest,
    reply: FastifyReply,
    allowed: (c: Parameters<typeof isListed>[0] & { owner_id: string }) => boolean,
  ) => {
    const { id, n } = parse(
      z.object({ id: z.string().uuid(), n: z.coerce.number().int().min(0).max(9) }),
      req.params,
    );
    const missing = () => notFound(tr('That screenshot'));
    const c = await ctx.db
      .selectFrom('oauth_clients')
      .select(['owner_id', 'screenshot_ids', 'listed_at', 'reviewed_at', 'declined_reason'])
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    const fileId = c?.screenshot_ids[n];
    if (!c || !fileId || !allowed(c)) throw missing();
    const f = await ctx.db
      .selectFrom('files')
      .selectAll()
      .where('id', '=', fileId)
      .executeTakeFirst();
    if (f?.kind !== 'image' || !f.thumb_key) throw missing();
    return streamFile(
      req,
      reply,
      storage,
      { ...(await largeOf(storage, f)), name: `screenshot-${n + 1}.webp` },
      true,
    );
  };
  app.get('/directory/:id/screenshots/:n', (req, reply) =>
    appScreenshot(req, reply, (c) => isListed(c) || c.owner_id === req.auth?.userId),
  );
  app.get('/admin/listings/:id/screenshots/:n', (req, reply) => {
    requireOperator(ctx, req, ctx.config.ADMIN_TOKEN, ctx.config.OPERATOR_TOKENS);
    return appScreenshot(req, reply, (c) => c.listed_at !== null);
  });
  /** The operator sees what they're asked to let through, before it's listed. */
  app.get('/admin/listings/:id/icon', async (req, reply) => {
    requireOperator(ctx, req, ctx.config.ADMIN_TOKEN, ctx.config.OPERATOR_TOKENS);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    return appIcon(req, reply, id, (c) => c.listed_at !== null);
  });
}
