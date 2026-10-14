import * as ImagePicker from 'expo-image-picker';
import type { LocalFile } from '@/api/upload';
import { PHOTO_MAX_EDGE } from './photoSize';

export type PickOptions = ImagePicker.ImagePickerOptions;
export type PickResult = ImagePicker.ImagePickerResult;

/**
 * Photos (and videos) from the device's library. On the web it's photos.web.ts. An iPhone hands
 * over a JPEG rather than its HEIC (R88): every screen draws one, and the server can take every
 * hidden detail out of it.
 */
export function pickFromLibrary(options: PickOptions): Promise<PickResult> {
  return ImagePicker.launchImageLibraryAsync({
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    ...options,
  });
}

/** Whether this device has a camera to take a photo with here: every phone does. */
export const canTakePhoto = (): boolean => true;

/**
 * A photo taken now with the camera (R88), asking for the camera first: what NSCameraUsageDescription
 * promises ("when you take a photo to send"). Refused, it's as if nothing was taken.
 */
export async function takePhoto(): Promise<PickResult> {
  const allowed = await ImagePicker.requestCameraPermissionsAsync();
  if (!allowed.granted) return { canceled: true, assets: null };
  return ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
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
