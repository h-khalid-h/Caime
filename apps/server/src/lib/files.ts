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
import { type Kysely, type Selectable, sql, type Transaction } from 'kysely';
import sharp from 'sharp';
import type { AppContext } from '../context';
import type { Database, FilesTable } from '../db/schema';
import { badRequest } from './errors';
import { stripHeifDetails } from './heif';
import { IMAGE_PIXELS_MAX, images, makeRenditions } from './renditions';
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
  // A HEIC can't be re-encoded here (no HEVC), so its details are cleared where they sit (R88);
  // one whose details can't be found for certain is never kept as it came.
  if (sniffed.mime === 'image/heic') {
    const { unsure } = await stripHeifDetails(storage.path(tempKey));
    if (unsure) {
      await storage.remove(tempKey);
      throw badRequest(tr('That photo couldn’t be read, so it wasn’t sent. Try another.'));
    }
  }
  if (sniffed.kind === 'image' && sniffed.mime !== 'image/gif' && sniffed.mime !== 'image/heic') {
    // One of a few at a time on this instance, and never a picture too large to decode.
    await images.run(async () => {
      try {
        const input = storage.path(tempKey);
        if (REENCODE.has(sniffed.mime)) {
          // Rotate by EXIF, cap the size, and drop every metadata block (GPS included).
          const out = storage.path(`${tempKey}.clean`);
          const pipeline = sharp(input, { failOn: 'truncated', limitInputPixels: IMAGE_PIXELS_MAX })
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
        const meta = await sharp(storage.path(tempKey), {
          limitInputPixels: IMAGE_PIXELS_MAX,
        }).metadata();
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
    });
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

/** A file's stored bytes: the original and each rendition (a small image's preview is its thumbnail). */
export type StoredKeys = Pick<FileRow, 'storage_key' | 'thumb_key' | 'preview_key'>;

/**
 * Of `ids`, the files nothing points at any more go: no message, album, asset, avatar (a
 * person's own, a group's, an organization's), catalog photo (an organization's, or its
 * uploader's own, since a catalog takes only its saver's images) or app icon or screenshot.
 * Their rows are deleted in `trx`; their bytes are the caller's to remove once it commits
 * (`removeStored`), since a rolled-back delete must still find them.
 */
export async function dropUnusedFiles(
  trx: Kysely<Database> | Transaction<Database>,
  ids: string[],
): Promise<StoredKeys[]> {
  if (!ids.length) return [];
  const gone = await sql<StoredKeys>`
    with cand as (select id, owner_id from files where id = any(${ids}::uuid[])),
    used as (
      select file_id as id from message_files where file_id in (select id from cand)
      union select file_id from album_photos where file_id in (select id from cand)
      union select file_id from assets where file_id in (select id from cand)
      union select avatar_file_id from conversations where avatar_file_id in (select id from cand)
      union select avatar_file_id from organizations where avatar_file_id in (select id from cand)
      union select icon_file_id from oauth_clients where icon_file_id in (select id from cand)
      union select s from oauth_clients, unnest(screenshot_ids) s where s in (select id from cand)
      union select c.id from cand c, users u
        where u.id = c.owner_id and (u.avatar_file_id = c.id
          or exists (select 1 from jsonb_array_elements(u.booking_items) i
            where i->>'photoFileId' = c.id::text))
      union select c.id from cand c, organizations o, jsonb_array_elements(o.booking_items) i
        where i->>'photoFileId' = c.id::text
    )
    delete from files where id in (select id from cand)
      and id not in (select id from used where id is not null)
    returning storage_key, thumb_key, preview_key`.execute(trx);
  return gone.rows;
}

/** The bytes of files whose rows are gone: each failure is logged, never silently kept. */
export async function removeStored(
  ctx: AppContext,
  storage: Storage,
  files: StoredKeys[],
  why: string,
): Promise<void> {
  const dropped = (key: string) => (err: unknown) =>
    ctx.log.warn({ err, key }, `${why}: a file was not removed`);
  for (const f of files) {
    await storage.remove(f.storage_key).catch(dropped(f.storage_key));
    if (f.thumb_key) await storage.remove(f.thumb_key).catch(dropped(f.thumb_key));
    if (f.preview_key && f.preview_key !== f.thumb_key)
      await storage.remove(f.preview_key).catch(dropped(f.preview_key));
  }
}
