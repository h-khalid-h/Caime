import type { FileView } from '@caime/core/api';
import { Platform } from 'react-native';
import { request } from './client';

export interface LocalFile {
  uri: string;
  name: string;
  mime: string;
  /** The browser's File, when the picker gave one (web). */
  file?: Blob;
}

/**
 * Upload one file; the server strips photo metadata and makes the thumbnail. A voice note says
 * how long it is, as the recorder measured it (the server keeps it on the file).
 */
export async function uploadFile(
  f: LocalFile,
  opts: { durationMs?: number } = {},
): Promise<FileView> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = f.file ?? (await (await fetch(f.uri)).blob());
    form.append('file', blob, f.name);
  } else {
    // React Native's FormData takes a { uri, name, type } descriptor for files on disk.
    form.append('file', { uri: f.uri, name: f.name, type: f.mime } as unknown as Blob);
  }
  const query = opts.durationMs ? `?durationMs=${Math.round(opts.durationMs)}` : '';
  const res = await request<{ file: FileView }>('POST', `/files${query}`, { raw: form });
  return res.file;
}
