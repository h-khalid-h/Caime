/**
 * Content types from the bytes, not from what the client claims. Only types we can recognise are
 * served inline; everything else downloads as an attachment.
 */
import { open } from 'node:fs/promises';

export type FileKind = 'image' | 'video' | 'audio' | 'document' | 'other';

export interface Sniffed {
  mime: string;
  kind: FileKind;
  /** Safe to render inline in a browser (never HTML or SVG). */
  inline: boolean;
}

export async function sniffFile(
  path: string,
  declaredMime: string,
  name: string,
): Promise<Sniffed> {
  const fh = await open(path, 'r');
  const buf = Buffer.alloc(64);
  try {
    await fh.read(buf, 0, 64, 0);
  } finally {
    await fh.close();
  }
  const hex = buf.toString('hex');
  const ascii = buf.toString('latin1');
  const is = (sig: string, at = 0) => hex.slice(at * 2, at * 2 + sig.length) === sig;
  if (is('ffd8ff')) return { mime: 'image/jpeg', kind: 'image', inline: true };
  if (is('89504e470d0a1a0a')) return { mime: 'image/png', kind: 'image', inline: true };
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a'))
    return { mime: 'image/gif', kind: 'image', inline: true };
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP')
    return { mime: 'image/webp', kind: 'image', inline: true };
  if (ascii.slice(4, 8) === 'ftyp') {
    const brand = ascii.slice(8, 12);
    if (/heic|heix|mif1|msf1/.test(brand))
      return { mime: 'image/heic', kind: 'image', inline: false };
    if (/M4A |M4B /.test(brand)) return { mime: 'audio/mp4', kind: 'audio', inline: true };
    if (/qt {2}/.test(brand)) return { mime: 'video/quicktime', kind: 'video', inline: true };
    return { mime: 'video/mp4', kind: 'video', inline: true };
  }
  if (is('1a45dfa3')) {
    const audio = declaredMime.startsWith('audio/');
    return {
      mime: audio ? 'audio/webm' : 'video/webm',
      kind: audio ? 'audio' : 'video',
      inline: true,
    };
  }
  if (ascii.startsWith('OggS')) return { mime: 'audio/ogg', kind: 'audio', inline: true };
  if (ascii.startsWith('ID3') || is('fffb') || is('fff3') || is('fff2'))
    return { mime: 'audio/mpeg', kind: 'audio', inline: true };
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE')
    return { mime: 'audio/wav', kind: 'audio', inline: true };
  if (ascii.startsWith('#!AMR')) return { mime: 'audio/amr', kind: 'audio', inline: false };
  if (ascii.startsWith('%PDF-')) return { mime: 'application/pdf', kind: 'document', inline: true };
  if (is('504b0304')) {
    const ext = name.toLowerCase().split('.').pop() ?? '';
    const office: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      zip: 'application/zip',
    };
    return { mime: office[ext] ?? 'application/zip', kind: 'document', inline: false };
  }
  // Printable text: tab, newline, carriage return, and bytes 0x20–0x7e or 0xa0–0xff.
  let end = 64;
  while (end > 0 && buf[end - 1] === 0) end--;
  const text = [...buf.subarray(0, end)].every(
    (b) => b === 9 || b === 10 || b === 13 || (b >= 0x20 && b <= 0x7e) || b >= 0xa0,
  );
  if (text && !/<(html|svg|script|!doctype)/i.test(ascii)) {
    const csv = name.toLowerCase().endsWith('.csv');
    return { mime: csv ? 'text/csv' : 'text/plain', kind: 'document', inline: false };
  }
  return { mime: 'application/octet-stream', kind: 'other', inline: false };
}
