import type { FileView } from '@caime/core/api';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { mediaHeaders, mediaUrl } from '@/api/client';

export type OpenableFile = Pick<FileView, 'id' | 'url' | 'name' | 'mime'> &
  Partial<Pick<FileView, 'viewUrl'>>;

/** A name the file system takes: letters, digits and a few marks, nothing hidden, not too long. */
function safeName(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N} ._()-]/gu, '_').replace(/^\.+/, '');
  return (cleaned || 'file').slice(-120);
}

/**
 * A file someone sent, opened on a phone (R88): a phone's browser has no session, so the file
 * is fetched here with it, kept in the cache under its id (opened twice, fetched once), and
 * handed to the system's sheet, which previews it (Quick Look, a viewer app; an Office file
 * too, so a phone takes the file itself, never the server's page of it) and saves or shares it
 * from there. The web's is openFile.web.ts.
 */
export async function openFile(f: OpenableFile, _opts: { save?: boolean } = {}): Promise<void> {
  const url = mediaUrl(f.url);
  if (!url) return;
  const file = await (fetching.get(f.id) ?? fetched(f, url));
  await Sharing.shareAsync(file.uri, { mimeType: f.mime || undefined, dialogTitle: f.name });
}

/** Files being fetched, by id: a second tap waits for the first one's download. */
const fetching = new Map<string, Promise<File>>();

function fetched(f: OpenableFile, url: string): Promise<File> {
  const done = (async () => {
    const dir = new Directory(Paths.cache, 'files', f.id);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, safeName(f.name));
    if (!file.exists) await File.downloadFileAsync(url, file, { headers: mediaHeaders() });
    return file;
  })().finally(() => fetching.delete(f.id));
  fetching.set(f.id, done);
  return done;
}
