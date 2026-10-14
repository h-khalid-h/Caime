import type { FileView } from '@caime/core/api';
import { create } from 'zustand';

/**
 * The photos open full screen (R88): a message's, an album's, what's shared in a conversation
 * or saved. `host` says where the viewer is drawn: on the screen, or inside the sheet the photo
 * was opened from, since on iOS a modal shows over a sheet only from inside it
 * (`PhotoViewerHost`). The viewer itself loads the first time one is opened.
 */
export const usePhotoViewer = create<{ files: FileView[]; index: number; host: string | null }>(
  () => ({ files: [], index: 0, host: null }),
);

export function showPhotos(files: FileView[], index = 0, host = 'screen'): void {
  if (!files.length) return;
  usePhotoViewer.setState({
    files,
    index: Math.min(Math.max(index, 0), files.length - 1),
    host,
  });
}

export function closePhotos(): void {
  usePhotoViewer.setState({ files: [], index: 0, host: null });
}

/** What can be drawn as a picture: one with its renditions, or a kind every screen draws. */
const DRAWN = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export function drawable(f: Pick<FileView, 'kind' | 'mime' | 'thumbUrl'>): boolean {
  return f.kind === 'image' && (f.thumbUrl !== null || DRAWN.has(f.mime));
}
