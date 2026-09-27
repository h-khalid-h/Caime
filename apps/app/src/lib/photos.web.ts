import type { ImagePickerAsset, ImagePickerOptions, ImagePickerResult } from 'expo-image-picker';

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
