/**
 * Files (PRD §26, §46, §79; ADR-13): uploads (single request or resumable chunks), thumbnails,
 * authorized downloads with byte ranges, and avatars under the owner's privacy rules.
 *
 * Photos are re-encoded without metadata, so a picture never reveals where it was taken.
 */
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type Readable, Transform } from 'node:stream';
import { canSee, uuidv7 } from '@caime/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import sharp from 'sharp';
import { z } from 'zod';
import type { AppContext } from '../context';
import { AppError, badRequest, notFound } from '../lib/errors';
import { fileView } from '../lib/messages';
import { assertStorage } from '../lib/plans';
import { viewerRelation } from '../lib/relations';
import { sniffFile } from '../lib/sniff';
import { diskStorage, type Storage } from '../lib/storage';
import { privacyOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const MAX_BYTES = 100 * 1024 * 1024;
const REENCODE = new Set(['image/jpeg', 'image/png', 'image/webp']);

function keyFor(id: string, now: Date): string {
  return `files/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
}

async function finalize(
  ctx: AppContext,
  storage: Storage,
  id: string,
  tempKey: string,
  declaredMime: string,
  name: string,
  durationMs: number | null,
) {
  const now = ctx.now();
  const key = keyFor(id, now);
  const sniffed = await sniffFile(storage.path(tempKey), declaredMime, name);
  let width: number | null = null;
  let height: number | null = null;
  let thumbKey: string | null = null;
  let cleaned = false;
  if (sniffed.kind === 'image' && sniffed.mime !== 'image/gif' && sniffed.mime !== 'image/heic') {
    try {
      const input = storage.path(tempKey);
      if (REENCODE.has(sniffed.mime)) {
        // Rotate by EXIF, cap the size, and drop every metadata block (GPS included).
        const out = storage.path(`${tempKey}.clean`);
        const pipeline = sharp(input, { failOn: 'truncated' })
          .rotate()
          .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true });
        const encoded =
          sniffed.mime === 'image/png'
            ? pipeline.png()
            : sniffed.mime === 'image/webp'
              ? pipeline.webp({ quality: 88 })
              : pipeline.jpeg({ quality: 88, mozjpeg: true });
        await encoded.toFile(out);
        await storage.remove(tempKey);
        await storage.moveFrom(`${tempKey}.clean`, tempKey);
        cleaned = true;
      }
      const meta = await sharp(storage.path(tempKey)).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
      thumbKey = `thumbs/${id}.webp`;
      await mkdir(dirname(storage.path(thumbKey)), { recursive: true });
      await sharp(storage.path(tempKey))
        .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 72 })
        .toFile(storage.path(thumbKey));
    } catch (err) {
      ctx.log.warn({ err }, 'image processing failed');
      thumbKey = null;
      // A photo whose hidden details (where it was taken among them) couldn't be taken out is
      // never kept as it came.
      if (REENCODE.has(sniffed.mime) && !cleaned) {
        await storage.remove(tempKey);
        await storage.remove(`${tempKey}.clean`);
        throw badRequest('That photo couldn’t be read, so it wasn’t sent. Try another.');
      }
    }
  }
  await storage.moveFrom(tempKey, key);
  const size = (await storage.size(key)) ?? 0;
  return { key, size, sniffed, width, height, thumbKey, durationMs };
}

function contentDisposition(name: string, inline: boolean): string {
  const safe = name.replace(/[\r\n"]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${safe.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

async function streamFile(
  req: FastifyRequest,
  reply: FastifyReply,
  storage: Storage,
  file: { name: string; mime: string; size: string | number; storage_key: string },
  inline: boolean,
) {
  const size = Number(file.size);
  reply
    .header(
      'content-type',
      inline ? file.mime : file.mime === 'application/pdf' ? file.mime : 'application/octet-stream',
    )
    .header('content-disposition', contentDisposition(file.name, inline))
    .header('cache-control', 'private, max-age=31536000, immutable')
    .header('x-content-type-options', 'nosniff')
    .header('content-security-policy', "default-src 'none'; sandbox")
    .header('accept-ranges', 'bytes');
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return reply.status(416).header('content-range', `bytes */${size}`).send();
    reply
      .status(206)
      .header('content-range', `bytes ${start}-${end}/${size}`)
      .header('content-length', String(end - start + 1));
    return reply.send(storage.read(file.storage_key, { start, end }));
  }
  reply.header('content-length', String(size));
  return reply.send(storage.read(file.storage_key));
}

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
  const storage = diskStorage(ctx.config.DATA_DIR);

  app.addContentTypeParser('application/offset+octet-stream', (_req, payload, done) =>
    done(null, payload),
  );

  app.post('/files', async (req, reply) => {
    const auth = requireAuth(req);
    ctx.limiter.hit(`upload:${auth.userId}`, ctx.config.isTest ? 10_000 : 300, 3_600_000);
    const part = await req.file({ limits: { fileSize: MAX_BYTES } });
    if (!part) throw badRequest('Attach a file.');
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
      throw new AppError(413, 'too_large', 'That file is over 100 MB.');
    }
    try {
      await assertStorage(ctx, auth.userId, bytes);
    } catch (err) {
      await storage.remove(tempKey);
      throw err;
    }
    const name = (part.filename || 'file').slice(0, 200);
    const done = await finalize(
      ctx,
      storage,
      id,
      tempKey,
      part.mimetype,
      name,
      q.durationMs ?? null,
    );
    const row: Parameters<typeof fileView>[0] = {
      id,
      name,
      mime: done.sniffed.mime,
      size: done.size,
      kind: done.sniffed.kind,
      width: done.width,
      height: done.height,
      duration_ms: done.durationMs,
      thumb_key: done.thumbKey,
    };
    await ctx.db
      .insertInto('files')
      .values({
        id,
        owner_id: auth.userId,
        storage_key: done.key,
        name,
        mime: done.sniffed.mime,
        size: done.size,
        kind: done.sniffed.kind,
        width: done.width,
        height: done.height,
        duration_ms: done.durationMs,
        sha256: hash.digest('hex'),
        thumb_key: done.thumbKey,
        status: 'ready',
        created_at: ctx.now(),
      })
      .execute();
    reply.status(201);
    return { file: fileView(row) };
  });

  // --- Resumable uploads (tus-style): create, append chunks at an offset, resume after a drop ---

  app.post('/uploads', async (req, reply) => {
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
    await assertStorage(ctx, auth.userId, body.size);
    const id = uuidv7();
    await ctx.db
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
    if (!f) throw notFound('That upload');
    reply
      .header('upload-offset', String(f.upload_offset))
      .header('upload-length', String(f.size))
      .header('cache-control', 'no-store');
    return reply.send();
  });

  app.patch('/uploads/:id', { bodyLimit: 16 * 1024 * 1024 }, async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const f = await ctx.db
      .selectFrom('files')
      .selectAll()
      .where('id', '=', id)
      .where('owner_id', '=', auth.userId)
      .executeTakeFirst();
    if (!f) throw notFound('That upload');
    if (f.status !== 'uploading')
      throw new AppError(409, 'upload_complete', 'This upload is already complete.');
    const offset = Number(req.headers['upload-offset']);
    if (!Number.isInteger(offset) || offset !== Number(f.upload_offset)) {
      throw new AppError(409, 'offset_mismatch', 'Resume from the server’s offset.', {
        offset: Number(f.upload_offset),
      });
    }
    const written = await storage.append(f.storage_key, req.body as Readable);
    if (written > Number(f.size)) {
      await storage.remove(f.storage_key);
      await ctx.db.updateTable('files').set({ status: 'failed' }).where('id', '=', id).execute();
      throw badRequest('More bytes than declared.');
    }
    if (written < Number(f.size)) {
      await ctx.db
        .updateTable('files')
        .set({ upload_offset: written })
        .where('id', '=', id)
        .execute();
      return { id, offset: written, complete: false };
    }
    const done = await finalize(
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
        upload_offset: done.size,
        status: 'ready',
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { id, offset: done.size, complete: true, file: fileView(updated) };
  });

  // --- Reading ---------------------------------------------------------------------------------

  app.get('/files/:id', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (!(await canReadFile(ctx, auth.userId, id))) throw notFound('That file');
    const f = await ctx.db
      .selectFrom('files')
      .selectAll()
      .where('id', '=', id)
      .where('status', '=', 'ready')
      .executeTakeFirst();
    if (!f) throw notFound('That file');
    const sniffedInline = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'audio/mpeg',
      'audio/mp4',
      'audio/ogg',
      'audio/webm',
      'audio/wav',
      'application/pdf',
    ].includes(f.mime);
    const { download } = parse(z.object({ download: z.enum(['1', 'true']).optional() }), req.query);
    return streamFile(req, reply, storage, f, sniffedInline && !download);
  });

  app.get('/files/:id/thumb', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (!(await canReadFile(ctx, auth.userId, id))) throw notFound('That file');
    const f = await ctx.db
      .selectFrom('files')
      .select(['thumb_key', 'name'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!f?.thumb_key) throw notFound('That thumbnail');
    const size = (await storage.size(f.thumb_key)) ?? 0;
    return streamFile(
      req,
      reply,
      storage,
      { name: `${f.name}.webp`, mime: 'image/webp', size, storage_key: f.thumb_key },
      true,
    );
  });

  app.get('/users/:id/avatar', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const user = await ctx.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!user?.avatar_file_id) throw notFound('That avatar');
    const relation = await viewerRelation(ctx.db, id, auth.userId);
    if (!canSee(privacyOf(user, ctx.now()), 'profilePhoto', relation))
      throw notFound('That avatar');
    const f = await ctx.db
      .selectFrom('files')
      .selectAll()
      .where('id', '=', user.avatar_file_id)
      .executeTakeFirst();
    if (!f) throw notFound('That avatar');
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
}
