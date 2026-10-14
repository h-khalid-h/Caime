import * as ImagePicker from 'expo-image-picker';
import type { LocalFile } from '@/api/upload';
import { PHOTO_MAX_EDGE } from './photoSize';

export type PickOptions = ImagePicker.ImagePickerOptions;
export type PickResult = ImagePicker.ImagePickerResult;

/** Photos (and videos) from the device's library. On the web it's photos.web.ts. */
export function pickFromLibrary(options: PickOptions): Promise<PickResult> {
  return ImagePicker.launchImageLibraryAsync(options);
}

/**
 * A picked photo as the file to upload, shrunk on the device when it's bigger than a
 * conversation shows; the shrinking loads when there's a photo to shrink (photoShrink.ts).
 */
export async function photoToUpload(
  a: ImagePicker.ImagePickerAsset,
  fallbackName: string,
  maxEdge = PHOTO_MAX_EDGE,
): Promise<LocalFile> {
  return (await import('./photoShrink')).shrinkPhoto(a, fallbackName, maxEdge);
}
