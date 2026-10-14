import { useEffect } from 'react';
import { lazyPart, useOpened } from '@/ui/Lazy';
import { closePhotos, usePhotoViewer } from './viewer';

/** The full-screen viewer, loaded the first time a photo is opened (R88). */
const PhotoViewer = lazyPart(() => import('./PhotoViewer').then((m) => m.PhotoViewer));

/**
 * Where photos opened with `showPhotos(…, host)` are drawn: a screen's (`screen`, the default)
 * or a sheet's own, inside it. Photos opened here are put away with it.
 */
export function PhotoViewerHost({ host = 'screen' }: { host?: string }) {
  const here = usePhotoViewer((s) => s.host === host && s.files.length > 0);
  const opened = useOpened(here);
  useEffect(
    () => () => {
      if (usePhotoViewer.getState().host === host) closePhotos();
    },
    [host],
  );
  return opened ? <PhotoViewer host={host} /> : null;
}
