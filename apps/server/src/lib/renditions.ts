/**
 * An image as each place draws it, sharp on the densest screens (R70): the thumbnail for what's
 * drawn small (a grid's tile, a list's face, a logo), the preview for what's drawn large (a photo
 * in a message, an item's sheet and page, a link's card), and the cleaned original for a viewer
 * that zooms. A picture no bigger than the thumbnail is its own preview.
 */
import { RENDITION_EDGES } from '@caime/core/renditions';
import sharp from 'sharp';
import type { AppContext } from '../context';
import { enqueue, registerJob } from './jobs';
import { type Storage, storageFor } from './storage';

export const RENDITIONS = {
  /** A 160-point face or tile on a 3x screen. */
  thumb: { edge: RENDITION_EDGES.thumb, quality: 80 },
  /** The largest a photo is drawn: across a phone (390 points, 1170 px at 3x), and a 1200-px card. */
  preview: { edge: RENDITION_EDGES.preview, quality: 82 },
} as const;

const resized = (input: string, edge: number, quality: number, out: string) =>
  sharp(input)
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toFile(out);

/** Both renditions of an image waiting at `tempKey`, kept where files are kept. */
export async function makeRenditions(
  storage: Storage,
  tempKey: string,
  id: string,
  width: number | null,
  height: number | null,
): Promise<{ thumbKey: string; previewKey: string }> {
  const thumbKey = `thumbs/${id}.webp`;
  await resized(
    storage.path(tempKey),
    RENDITIONS.thumb.edge,
    RENDITIONS.thumb.quality,
    storage.path(`${tempKey}.thumb`),
  );
  await storage.moveFrom(`${tempKey}.thumb`, thumbKey);
  if (Math.max(width ?? 0, height ?? 0) <= RENDITIONS.thumb.edge)
    return { thumbKey, previewKey: thumbKey };
  const previewKey = `previews/${id}.webp`;
  await resized(
    storage.path(tempKey),
    RENDITIONS.preview.edge,
    RENDITIONS.preview.quality,
    storage.path(`${tempKey}.preview`),
  );
  await storage.moveFrom(`${tempKey}.preview`, previewKey);
  return { thumbKey, previewKey };
}

const BACKFILL_JOB = 'files.previews';
const BACKFILL_BATCH = 25;

/** Images kept before previews were made: the oldest first, from `after` on. */
const needing = (ctx: AppContext, after: string | null, limit: number) => {
  let q = ctx.db
    .selectFrom('files')
    .select(['id', 'storage_key', 'thumb_key', 'width', 'height'])
    .where('preview_key', 'is', null)
    .where('thumb_key', 'is not', null)
    .orderBy('id')
    .limit(limit);
  if (after) q = q.where('id', '>', after);
  return q.execute();
};

/**
 * A batch of older images gets its preview, read from where it's kept through a temporary copy
 * (nothing reads a durable key by path), then the next batch is queued; one that can't be read
 * keeps its thumbnail as its preview, so it isn't tried again.
 */
async function backfill(ctx: AppContext, payload: unknown): Promise<void> {
  const after = (payload as { after?: string | null } | null)?.after ?? null;
  const rows = await needing(ctx, after, BACKFILL_BATCH);
  const storage = storageFor(ctx.config);
  for (const f of rows) {
    const temp = `tmp/preview-${f.id}`;
    let previewKey: string | null = f.thumb_key;
    try {
      await storage.write(temp, storage.read(f.storage_key));
      previewKey = (await makeRenditions(storage, temp, f.id, f.width, f.height)).previewKey;
    } catch (err) {
      ctx.log.warn({ err, fileId: f.id }, 'preview backfill failed');
    } finally {
      await storage.remove(temp);
    }
    await ctx.db
      .updateTable('files')
      .set({ preview_key: previewKey })
      .where('id', '=', f.id)
      .execute();
  }
  const last = rows.at(-1);
  if (rows.length === BACKFILL_BATCH && last)
    await enqueue(ctx, BACKFILL_JOB, { after: last.id }, { dedupeKey: `previews:${last.id}` });
}

export function registerPreviewJob(): void {
  registerJob(BACKFILL_JOB, backfill);
}

/** At start: if any image still has no preview, the backfill begins (once, whichever instance). */
export async function startPreviewBackfill(ctx: AppContext): Promise<void> {
  const [first] = await needing(ctx, null, 1);
  if (first)
    await enqueue(ctx, BACKFILL_JOB, { after: null }, { dedupeKey: `previews:from:${first.id}` });
}
