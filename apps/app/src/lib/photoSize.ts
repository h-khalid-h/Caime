/**
 * How big a photo goes out from a device (docs/RESOURCES.md, R70): a phone's 12-megapixel shot
 * is 4,032 pixels across, more than any screen shows; a conversation draws a 1,280-pixel preview
 * the server makes, and the photo itself is opened full screen or zoomed (a QHD desktop shows
 * 2,560 across, a phone zoomed twice about 2,340), so it's shrunk on the device to 3,072 before
 * it's uploaded. The server still caps at 4,096 and strips every hidden detail. Pure, so tested.
 */
export const PHOTO_MAX_EDGE = 3072;
/** The JPEG quality a shrunk photo is saved at: no blocks in skies or skin, even zoomed. */
export const PHOTO_QUALITY = 0.9;
/** A profile photo or a logo shows at 104 px at most; 1,024 leaves room for sharp screens. */
export const AVATAR_MAX_EDGE = 1024;
/** Formats that go as they are: animation, vectors, and what a browser can't re-encode. */
const AS_IS = new Set(['image/gif', 'image/svg+xml', 'image/heic', 'image/heif', 'image/avif']);

/** The size to shrink to, or null when the photo goes as it came. */
export function shrinkTo(
  photo: { mime?: string | null; width?: number; height?: number },
  maxEdge = PHOTO_MAX_EDGE,
): { width: number; height: number } | null {
  const mime = (photo.mime ?? '').toLowerCase();
  if (!mime.startsWith('image/') || AS_IS.has(mime)) return null;
  const w = photo.width ?? 0;
  const h = photo.height ?? 0;
  if (!w || !h) return null;
  const edge = Math.max(w, h);
  if (edge <= maxEdge) return null;
  const scale = maxEdge / edge;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** What the shrunk photo is saved as: PNG stays PNG (screenshots, transparency); the rest JPEG. */
export function shrunkFormat(mime?: string | null): 'png' | 'jpeg' {
  return (mime ?? '').toLowerCase() === 'image/png' ? 'png' : 'jpeg';
}

/** The file's name with the extension the saved format takes. */
export function shrunkName(name: string, format: 'png' | 'jpeg'): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '') || 'photo';
  return `${base}.${format === 'png' ? 'png' : 'jpg'}`;
}
