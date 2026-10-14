/**
 * Shrinking a picked photo on the device (lib/photoSize.ts), loaded the first time someone picks
 * one, with the image manipulator it needs.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type * as ImagePicker from 'expo-image-picker';
import type { LocalFile } from '@/api/upload';
import {
  needsJpeg,
  PHOTO_MAX_EDGE,
  PHOTO_QUALITY,
  shrinkTo,
  shrunkFormat,
  shrunkName,
} from './photoSize';

/**
 * A picked photo as the file to upload, shrunk on the device when it's bigger than a
 * conversation shows (lib/photoSize.ts); a video, a small photo or one that can't be re-encoded
 * goes as it is. Failing to shrink sends the original rather than nothing.
 */
export async function shrinkPhoto(
  a: ImagePicker.ImagePickerAsset,
  fallbackName: string,
  maxEdge = PHOTO_MAX_EDGE,
): Promise<LocalFile> {
  const name = a.fileName ?? fallbackName;
  const mime = a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg');
  const asIs: LocalFile = { uri: a.uri, name, mime };
  if (a.type === 'video') return asIs;
  // A HEIC becomes a JPEG at any size (R88); anything else only when it's bigger than shown.
  const convert = needsJpeg(mime);
  const size = shrinkTo(
    { mime: convert ? 'image/jpeg' : mime, width: a.width, height: a.height },
    maxEdge,
  );
  if (!size && !convert) return asIs;
  try {
    const format = convert ? 'jpeg' : shrunkFormat(mime);
    const context = ImageManipulator.manipulate(a.uri);
    const image = await (size ? context.resize(size) : context).renderAsync();
    try {
      const saved = await image.saveAsync({
        format: format === 'png' ? SaveFormat.PNG : SaveFormat.JPEG,
        compress: PHOTO_QUALITY,
      });
      return { uri: saved.uri, name: shrunkName(name, format), mime: `image/${format}` };
    } finally {
      image.release();
    }
  } catch {
    return asIs;
  }
}
