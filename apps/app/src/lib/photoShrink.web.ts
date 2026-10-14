/**
 * Shrinking a picked photo in the browser (lib/photoSize.ts), loaded the first time someone picks
 * one: none of it is needed before (photos.web.ts keeps the picker, which a tap must open itself).
 */
import type { ImagePickerAsset } from 'expo-image-picker';
import type { LocalFile } from '@/api/upload';
import { PHOTO_MAX_EDGE, PHOTO_QUALITY, shrinkTo, shrunkFormat, shrunkName } from './photoSize';

/**
 * A picked photo as the file to upload, shrunk in the browser when it's bigger than a
 * conversation shows (lib/photoSize.ts), through a canvas; a video, a small photo or one the
 * browser can't decode goes as it is.
 */
export async function shrinkPhoto(
  a: ImagePickerAsset,
  fallbackName: string,
  maxEdge = PHOTO_MAX_EDGE,
): Promise<LocalFile> {
  const name = a.fileName ?? fallbackName;
  const mime = a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg');
  const file = (a as { file?: Blob }).file;
  const asIs: LocalFile = { uri: a.uri, name, mime, file };
  if (a.type === 'video' || !file) return asIs;
  const size = shrinkTo({ mime, width: a.width, height: a.height }, maxEdge);
  if (!size) return asIs;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return asIs;
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const format = shrunkFormat(mime);
    const type = `image/${format}`;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, format === 'jpeg' ? PHOTO_QUALITY : undefined),
    );
    if (!blob) return asIs;
    const shrunk = new File([blob], shrunkName(name, format), { type });
    return { uri: URL.createObjectURL(shrunk), name: shrunk.name, mime: type, file: shrunk };
  } catch {
    return asIs;
  }
}
