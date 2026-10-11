/**
 * A file kept by Caime (PRD §26; ADR-13): an upload finished, or one the server took in itself
 * (a mail's attachment, R75). Photos are re-encoded without their metadata, so a picture never
 * reveals where it was taken, and images get their renditions (R70). One path for every file
 * that lands, whoever brought it.
 */
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { uuidv7 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { Selectable } from 'kysely';
import sharp from 'sharp';
import type { AppContext } from '../context';
import type { FilesTable } from '../db/schema';
import { badRequest } from './errors';
import { makeRenditions } from './renditions';
import { sniffFile } from './sniff';
import type { Storage } from './storage';

export type FileRow = Selectable<FilesTable>;

const REENCODE = new Set(['image/jpeg', 'image/png', 'image/webp']);

function keyFor(id: string, now: Date): string {
  return `files/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
}

/**
 * What a file written to a `tmp/` key becomes: sniffed for what it is, a photo cleaned and given
 * its renditions, then moved to where files are kept. The row is the caller's to write or update.
 */
export async function finalizeFile(
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
  let previewKey: string | null = null;
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
      // Made beside the upload, then kept where files are kept.
      ({ thumbKey, previewKey } = await makeRenditions(storage, tempKey, id, width, height));
    } catch (err) {
      ctx.log.warn({ err }, 'image processing failed');
      thumbKey = null;
      previewKey = null;
      // A photo whose hidden details (where it was taken among them) couldn't be taken out is
      // never kept as it came.
      if (REENCODE.has(sniffed.mime) && !cleaned) {
        await storage.remove(tempKey);
        await storage.remove(`${tempKey}.clean`);
        throw badRequest(tr('That photo couldn’t be read, so it wasn’t sent. Try another.'));
      }
    }
  }
  await storage.moveFrom(tempKey, key);
  const size = (await storage.size(key)) ?? 0;
  return { key, size, sniffed, width, height, thumbKey, previewKey, durationMs };
}

/** A file written to a `tmp/` key becomes a kept one with its row: the single-request upload's path. */
export async function storeFile(
  ctx: AppContext,
  storage: Storage,
  file: {
    id: string;
    ownerId: string;
    tempKey: string;
    mime: string;
    name: string;
    durationMs: number | null;
    sha256: string;
  },
): Promise<FileRow> {
  const done = await finalizeFile(
    ctx,
    storage,
    file.id,
    file.tempKey,
    file.mime,
    file.name,
    file.durationMs,
  );
  return ctx.db
    .insertInto('files')
    .values({
      id: file.id,
      owner_id: file.ownerId,
      storage_key: done.key,
      name: file.name,
      mime: done.sniffed.mime,
      size: done.size,
      kind: done.sniffed.kind,
      width: done.width,
      height: done.height,
      duration_ms: done.durationMs,
      sha256: file.sha256,
      thumb_key: done.thumbKey,
      preview_key: done.previewKey,
      status: 'ready',
      created_at: ctx.now(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Bytes the server holds (a mail's attachment) become a kept file, as an upload would. */
export async function storeBytes(
  ctx: AppContext,
  storage: Storage,
  file: { ownerId: string; bytes: Buffer; mime: string; name: string },
): Promise<FileRow> {
  const id = uuidv7();
  const tempKey = `tmp/${id}`;
  await storage.write(tempKey, Readable.from(file.bytes));
  try {
    return await storeFile(ctx, storage, {
      id,
      ownerId: file.ownerId,
      tempKey,
      mime: file.mime,
      name: file.name.slice(0, 200) || 'attachment',
      durationMs: null,
      sha256: createHash('sha256').update(file.bytes).digest('hex'),
    });
  } catch (err) {
    await storage.remove(tempKey).catch(() => undefined);
    throw err;
  }
}
