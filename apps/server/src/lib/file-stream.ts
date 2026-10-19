/**
 * A stored file sent to whoever may read it (PRD §26): byte ranges for a player, the name as the
 * browser saves it, and a policy that runs nothing a file holds. Shared by the routes that send
 * files: someone's own (`modules/files.ts`) and a link's (`modules/file-links.ts`, M16 H6).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Storage } from './storage';

/** What a browser shows in place rather than saves: pictures, video, sound and PDFs. */
export const INLINE_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
  'application/pdf',
]);

/** The file to send for an image drawn large: its preview, else the cleaned original. */
export async function largeOf(
  storage: Storage,
  f: {
    preview_key: string | null;
    storage_key: string;
    mime: string;
    name: string;
    size: string | number;
  },
) {
  if (!f.preview_key)
    return { name: f.name, mime: f.mime, size: f.size, storage_key: f.storage_key };
  const size = (await storage.size(f.preview_key)) ?? 0;
  return { name: `${f.name}.webp`, mime: 'image/webp', size, storage_key: f.preview_key };
}

export function contentDisposition(name: string, inline: boolean): string {
  const safe = name.replace(/[\r\n"]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${safe.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export async function streamFile(
  req: FastifyRequest,
  reply: FastifyReply,
  storage: Storage,
  file: { name: string; mime: string; size: string | number; storage_key: string },
  inline: boolean,
  /** Kept for good by the reader's browser, unless it's a link's that may be taken back. */
  cache = 'private, max-age=31536000, immutable',
) {
  const size = Number(file.size);
  reply
    .header(
      'content-type',
      inline ? file.mime : file.mime === 'application/pdf' ? file.mime : 'application/octet-stream',
    )
    .header('content-disposition', contentDisposition(file.name, inline))
    .header('cache-control', cache)
    .header('x-content-type-options', 'nosniff')
    .header('content-security-policy', "default-src 'none'; sandbox")
    .header('accept-ranges', 'bytes');
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return reply.status(416).header('content-range', `bytes */${size}`).send();
    reply
      .status(206)
      .header('content-range', `bytes ${start}-${end}/${size}`)
      .header('content-length', String(end - start + 1));
    return reply.send(storage.read(file.storage_key, { start, end }));
  }
  reply.header('content-length', String(size));
  return reply.send(storage.read(file.storage_key));
}
