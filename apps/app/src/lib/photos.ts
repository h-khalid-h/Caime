import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { LocalFile } from '@/api/upload';
import { PHOTO_MAX_EDGE, shrinkTo, shrunkFormat, shrunkName } from './photoSize';

export type PickOptions = ImagePicker.ImagePickerOptions;
export type PickResult = ImagePicker.ImagePickerResult;

/** Photos (and videos) from the device's library. On the web it's photos.web.ts. */
export function pickFromLibrary(options: PickOptions): Promise<PickResult> {
  return ImagePicker.launchImageLibraryAsync(options);
}

/**
 * A picked photo as the file to upload, shrunk on the device when it's bigger than a
 * conversation shows (lib/photoSize.ts); a video, a small photo or one that can't be re-encoded
 * goes as it is. Failing to shrink sends the original rather than nothing.
 */
export async function photoToUpload(
  a: ImagePicker.ImagePickerAsset,
  fallbackName: string,
  maxEdge = PHOTO_MAX_EDGE,
): Promise<LocalFile> {
  const name = a.fileName ?? fallbackName;
  const mime = a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg');
  const asIs: LocalFile = { uri: a.uri, name, mime };
  if (a.type === 'video') return asIs;
  const size = shrinkTo({ mime, width: a.width, height: a.height }, maxEdge);
  if (!size) return asIs;
  try {
    const format = shrunkFormat(mime);
    const image = await ImageManipulator.manipulate(a.uri).resize(size).renderAsync();
    try {
      const saved = await image.saveAsync({
        format: format === 'png' ? SaveFormat.PNG : SaveFormat.JPEG,
        compress: 0.85,
      });
      return { uri: saved.uri, name: shrunkName(name, format), mime: `image/${format}` };
    } finally {
      image.release();
    }
  } catch {
    return asIs;
  }
}
