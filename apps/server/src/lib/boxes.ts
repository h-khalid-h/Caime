/**
 * The boxes of an ISO base media file (MP4, QuickTime, HEIF): a size, a four-letter type and what
 * it holds, laid end to end. Read from a buffer by the cleaners that take a file's hidden details
 * out without decoding it (`heif.ts`, `video-details.ts`).
 */

export interface Box {
  type: string;
  /** Where the box starts, and where its contents start and end, within what was read. */
  start: number;
  body: number;
  end: number;
}

/** The boxes laid end to end in `buf` from `from` to `to`, or null when they don't fit exactly. */
export function boxesIn(buf: Buffer, from: number, to: number): Box[] | null {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    let body = at + 8;
    if (size === 1) {
      if (at + 16 > to) return null;
      size = Number(buf.readBigUInt64BE(at + 8));
      body = at + 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < body - at || at + size > to) return null;
    out.push({ type, start: at, body, end: at + size });
    at += size;
  }
  return at === to ? out : null;
}
