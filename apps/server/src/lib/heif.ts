/**
 * A HEIC's hidden details taken out without decoding it (R88). The server's image library reads
 * no HEVC, so a HEIC can't be re-encoded as a JPEG or a PNG is (`finalizeFile`); its details
 * (where it was taken among them) are items in its container instead: an `Exif` item, and XMP as
 * a `mime` item of `application/rdf+xml`. Each one's bytes are found through the `meta` box's
 * item list (`iinf`) and locations (`iloc`) and overwritten with zeros where they are, so every
 * offset in the file stays true and the picture itself is untouched. Anything that can't be
 * found for certain is said (`unsure`), and the caller keeps nothing that came that way.
 */
import { open } from 'node:fs/promises';

/** The `meta` box is read whole; a real one is a few kilobytes. */
const META_MAX = 16 * 1024 * 1024;
const ZEROS = Buffer.alloc(64 * 1024);

interface Box {
  type: string;
  /** Where the box starts, and where its contents start and end, within what was read. */
  start: number;
  body: number;
  end: number;
}

/** The boxes laid end to end in `buf` from `from` to `to`. */
function boxesIn(buf: Buffer, from: number, to: number): Box[] | null {
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

function readSized(buf: Buffer, at: number, bytes: number): number {
  if (bytes === 0) return 0;
  if (bytes === 2) return buf.readUInt16BE(at);
  if (bytes === 4) return buf.readUInt32BE(at);
  if (bytes === 8) return Number(buf.readBigUInt64BE(at));
  throw new RangeError(`a field of ${bytes} bytes`);
}

/** The ids of the items that hold hidden details: Exif, and XMP. */
function detailItems(buf: Buffer, iinf: Box): Set<number> | null {
  const version = buf.readUInt8(iinf.body);
  const first = iinf.body + 4 + (version === 0 ? 2 : 4);
  const entries = boxesIn(buf, first, iinf.end);
  if (!entries) return null;
  const ids = new Set<number>();
  for (const infe of entries) {
    if (infe.type !== 'infe') continue;
    const v = buf.readUInt8(infe.body);
    // Versions 0 and 1 carry no item type: nothing of theirs is an Exif or an XMP item.
    if (v < 2) continue;
    let at = infe.body + 4;
    const id = v === 2 ? buf.readUInt16BE(at) : buf.readUInt32BE(at);
    at += (v === 2 ? 2 : 4) + 2;
    const type = buf.toString('latin1', at, at + 4);
    at += 4;
    if (type === 'Exif') {
      ids.add(id);
      continue;
    }
    if (type !== 'mime') continue;
    // The item's name, then its content type, each ending in a zero.
    const nameEnd = buf.indexOf(0, at);
    if (nameEnd < 0 || nameEnd >= infe.end) return null;
    const typeEnd = buf.indexOf(0, nameEnd + 1);
    const contentType = buf
      .toString('latin1', nameEnd + 1, typeEnd < 0 || typeEnd > infe.end ? infe.end : typeEnd)
      .toLowerCase();
    if (contentType.includes('rdf+xml') || contentType.includes('xmp')) ids.add(id);
  }
  return ids;
}

/**
 * Where the hidden details' bytes are in the file, from a `meta` box read whole (`meta`, which
 * starts at `metaAt` in the file): `[offset, length]` pairs, or null when they can't be told.
 */
export function detailExtents(meta: Buffer, metaAt: number): Array<[number, number]> | null {
  const top = boxesIn(meta, 0, meta.length);
  const box = top?.[0];
  if (box?.type !== 'meta') return null;
  // `meta` is a full box: a version and flags before its children.
  const children = boxesIn(meta, box.body + 4, box.end);
  if (!children) return null;
  const iinf = children.find((b) => b.type === 'iinf');
  const iloc = children.find((b) => b.type === 'iloc');
  const idat = children.find((b) => b.type === 'idat');
  if (!iinf) return [];
  const wanted = detailItems(meta, iinf);
  if (!wanted) return null;
  if (!wanted.size) return [];
  if (!iloc) return null;
  const version = meta.readUInt8(iloc.body);
  let at = iloc.body + 4;
  const sizes = meta.readUInt8(at);
  const more = meta.readUInt8(at + 1);
  at += 2;
  const offsetSize = sizes >> 4;
  const lengthSize = sizes & 0x0f;
  const baseOffsetSize = more >> 4;
  const indexSize = version === 1 || version === 2 ? more & 0x0f : 0;
  const count = version < 2 ? meta.readUInt16BE(at) : meta.readUInt32BE(at);
  at += version < 2 ? 2 : 4;
  const out: Array<[number, number]> = [];
  const found = new Set<number>();
  for (let i = 0; i < count; i++) {
    const id = version < 2 ? meta.readUInt16BE(at) : meta.readUInt32BE(at);
    at += version < 2 ? 2 : 4;
    let method = 0;
    if (version === 1 || version === 2) {
      method = meta.readUInt16BE(at) & 0x0f;
      at += 2;
    }
    at += 2; // data_reference_index
    const base = readSized(meta, at, baseOffsetSize);
    at += baseOffsetSize;
    const extents = meta.readUInt16BE(at);
    at += 2;
    for (let e = 0; e < extents; e++) {
      at += indexSize;
      const offset = readSized(meta, at, offsetSize);
      at += offsetSize;
      const length = readSized(meta, at, lengthSize);
      at += lengthSize;
      if (!wanted.has(id)) continue;
      // A length of nothing (the rest of the file) or bytes another item holds: not certain.
      if (length === 0 || method === 2) return null;
      if (method === 1) {
        if (!idat || idat.body + base + offset + length > idat.end) return null;
        out.push([metaAt + idat.body + base + offset, length]);
      } else {
        out.push([base + offset, length]);
      }
      found.add(id);
    }
    if (at > iloc.end) return null;
  }
  // An item listed with nowhere said to be is one that couldn't be cleared.
  return found.size === wanted.size ? out : null;
}

/**
 * Overwrites a HEIF file's Exif and XMP items with zeros, in place: `cleared` items' extents,
 * or `unsure` when the container couldn't be read for certain.
 */
export async function stripHeifDetails(
  path: string,
): Promise<{ cleared: number; unsure: boolean }> {
  const fh = await open(path, 'r+');
  try {
    const size = (await fh.stat()).size;
    const head = Buffer.alloc(16);
    let at = 0;
    while (at + 8 <= size) {
      const { bytesRead } = await fh.read(head, 0, 16, at);
      if (bytesRead < 8) return { cleared: 0, unsure: true };
      let boxSize = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (boxSize === 1) {
        if (bytesRead < 16) return { cleared: 0, unsure: true };
        boxSize = Number(head.readBigUInt64BE(8));
      } else if (boxSize === 0) {
        boxSize = size - at;
      }
      if (boxSize < 8 || at + boxSize > size) return { cleared: 0, unsure: true };
      if (type === 'meta') {
        if (boxSize > META_MAX) return { cleared: 0, unsure: true };
        const meta = Buffer.alloc(boxSize);
        await fh.read(meta, 0, boxSize, at);
        const extents = detailExtents(meta, at);
        if (!extents) return { cleared: 0, unsure: true };
        for (const [offset, length] of extents) {
          if (offset + length > size) return { cleared: 0, unsure: true };
          for (let done = 0; done < length; done += ZEROS.length) {
            const n = Math.min(ZEROS.length, length - done);
            await fh.write(ZEROS, 0, n, offset + done);
          }
        }
        return { cleared: extents.length, unsure: false };
      }
      at += boxSize;
    }
    // No `meta` box: nothing an item could hold.
    return { cleared: 0, unsure: false };
  } catch {
    return { cleared: 0, unsure: true };
  } finally {
    await fh.close();
  }
}
