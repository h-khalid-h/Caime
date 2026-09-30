import type { ImagePickerAsset, ImagePickerOptions, ImagePickerResult } from 'expo-image-picker';
import type { LocalFile } from '@/api/upload';
import { PHOTO_MAX_EDGE, shrinkTo, shrunkFormat, shrunkName } from './photoSize';

export type PickOptions = ImagePickerOptions;
export type PickResult = ImagePickerResult;

/** How big a photo or video is, 0 by 0 when the browser can't tell. */
function sizeOf(url: string, video: boolean): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (video) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight });
      v.onerror = () => resolve({ width: 0, height: 0 });
      v.src = url;
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

async function asset(file: File): Promise<ImagePickerAsset> {
  const uri = URL.createObjectURL(file);
  const video = file.type.startsWith('video/');
  return {
    uri,
    ...(await sizeOf(uri, video)),
    type: video ? 'video' : 'image',
    mimeType: file.type,
    fileName: file.name,
    fileSize: file.size,
    file,
  };
}

/**
 * Photos (and videos) from the device, in the browser: its file chooser, opened while the tap
 * that asked for it is still going, since a browser opens one for a tap alone. It returns what
 * expo-image-picker does on the web, without carrying its module in every screen that can pick.
 */
export function pickFromLibrary(options: PickOptions): Promise<PickResult> {
  const kinds = [options.mediaTypes ?? 'images'].flat();
  const input = document.createElement('input');
  input.type = 'file';
  input.style.display = 'none';
  input.accept =
    [
      ...(kinds.includes('images') ? ['image/*'] : []),
      ...(kinds.includes('videos') ? ['video/mp4,video/quicktime,video/x-m4v,video/*'] : []),
    ].join(',') || 'image/*';
  input.multiple = Boolean(options.allowsMultipleSelection);
  document.body.appendChild(input);
  return new Promise<PickResult>((resolve, reject) => {
    let over = false;
    const done = () => {
      if (over) return;
      over = true;
      input.remove();
      const files = [...(input.files ?? [])].filter(
        (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
      );
      const chosen = options.allowsMultipleSelection
        ? files.slice(0, options.selectionLimit || undefined)
        : files.slice(0, 1);
      if (!chosen.length) return resolve({ canceled: true, assets: null });
      Promise.all(chosen.map(asset)).then((assets) => resolve({ canceled: false, assets }), reject);
    };
    input.addEventListener('change', done, { once: true });
    input.addEventListener('cancel', done, { once: true });
    input.click();
  });
}

/**
 * A picked photo as the file to upload, shrunk in the browser when it's bigger than a
 * conversation shows (lib/photoSize.ts), through a canvas; a video, a small photo or one the
 * browser can't decode goes as it is.
 */
export async function photoToUpload(
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
      canvas.toBlob(resolve, type, format === 'jpeg' ? 0.85 : undefined),
    );
    if (!blob) return asIs;
    const shrunk = new File([blob], shrunkName(name, format), { type });
    return { uri: URL.createObjectURL(shrunk), name: shrunk.name, mime: type, file: shrunk };
  } catch {
    return asIs;
  }
}
