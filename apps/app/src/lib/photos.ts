import * as ImagePicker from 'expo-image-picker';

export type PickOptions = ImagePicker.ImagePickerOptions;
export type PickResult = ImagePicker.ImagePickerResult;

/** Photos (and videos) from the device's library. On the web it's photos.web.ts. */
export function pickFromLibrary(options: PickOptions): Promise<PickResult> {
  return ImagePicker.launchImageLibraryAsync(options);
}
