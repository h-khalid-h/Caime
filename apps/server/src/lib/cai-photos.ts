import { CAI_PHOTOS_MAX } from '@caime/core/system-ids';
import type { AppContext } from '../context';
import { base64Of } from './storage';

export type CaiPhoto = {
  data: string;
  mediaType: 'image/webp' | 'image/jpeg' | 'image/png' | 'image/gif';
};

/** Kinds the model reads as they came, for a picture without renditions (a GIF keeps its bytes). */
const AS_SENT = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
/** The largest picture sent as it came: the API's limit is 5 MB once in base64. */
const AS_SENT_MAX_BYTES = 3_500_000;

/**
 * Where each photo of a message sent to Cai is read from (M17 I14b), up to `CAI_PHOTOS_MAX` in
 * the order sent: its preview rendition (the 1280-px WebP, R70), else its thumbnail, else the
 * picture as it came where the model reads its kind and it's small enough. Kept nowhere: the
 * bytes are read when Cai answers and handed to the model alone.
 */
export async function photoKeysOf(
  ctx: AppContext,
  messageId: string,
): Promise<Array<{ key: string; mediaType: CaiPhoto['mediaType'] }>> {
  const files = await ctx.db
    .selectFrom('message_files')
    .innerJoin('files', 'files.id', 'message_files.file_id')
    .select([
      'files.kind',
      'files.mime',
      'files.size',
      'files.storage_key',
      'files.preview_key',
      'files.thumb_key',
    ])
    .where('message_files.message_id', '=', messageId)
    .where('files.kind', '=', 'image')
    .orderBy('message_files.position')
    .limit(CAI_PHOTOS_MAX)
    .execute();
  return files.flatMap((f) => {
    const rendition = f.preview_key ?? f.thumb_key;
    if (rendition) return [{ key: rendition, mediaType: 'image/webp' as const }];
    if (AS_SENT.has(f.mime) && Number(f.size) <= AS_SENT_MAX_BYTES)
      return [{ key: f.storage_key, mediaType: f.mime as CaiPhoto['mediaType'] }];
    return [];
  });
}

/** The pictures themselves, read for the model's one call. */
export function readPhotos(
  ctx: AppContext,
  keys: Array<{ key: string; mediaType: CaiPhoto['mediaType'] }>,
): Promise<CaiPhoto[]> {
  return Promise.all(
    keys.map(async (k) => ({ data: await base64Of(ctx, k.key), mediaType: k.mediaType })),
  );
}
