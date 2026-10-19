import type { FileView } from '@caime/core/api';
import { mediaUrl } from '@/api/client';

export type OpenableFile = Pick<FileView, 'id' | 'url' | 'name' | 'mime'> &
  Partial<Pick<FileView, 'viewUrl'>>;

/**
 * A file someone sent, opened as the browser opens one: in a tab of its own, whose session is
 * the page's, or saved (`save`, the server's `?download=1`). A Word document, a workbook, a deck
 * or words open as the server's page of what they hold (M16 H6), which offers the download. The
 * phones' is openFile.ts.
 */
export async function openFile(f: OpenableFile, opts: { save?: boolean } = {}): Promise<void> {
  const url = mediaUrl(f.url);
  if (!url) return;
  if (!opts.save) {
    window.open(mediaUrl(f.viewUrl) ?? url, '_blank', 'noopener');
    return;
  }
  const a = document.createElement('a');
  a.href = `${url}${url.includes('?') ? '&' : '?'}download=1`;
  a.download = f.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
