/**
 * A video's hidden details taken out without decoding it (M16 E4b). A phone's video keeps where it
 * was filmed in its movie box beside the camera's make and model: Android's in a `udta` box
 * (`©xyz`), an iPhone's as QuickTime metadata in a `meta` box
 * (`com.apple.quicktime.location.ISO6709`), and either may sit in a track too. Every `udta` and
 * `meta` box in the movie and in its tracks becomes a `free` box of the same size, its bytes
 * zeroed: players skip a `free` box, and since nothing moves, every offset in the file stays true
 * and the picture and the sound are untouched. A file whose boxes can't be read for certain is
 * said (`unsure`), and the caller keeps nothing that came that way, as for a HEIC (`heif.ts`).
 */
import { open } from 'node:fs/promises';
import { boxesIn } from './boxes';

/** The movie box is read whole; a long phone video's is a few megabytes. */
const MOOV_MAX = 64 * 1024 * 1024;
const ZEROS = Buffer.alloc(64 * 1024);
/** What holds details rather than the picture or the sound. */
const DETAILS = new Set(['udta', 'meta']);
/** What holds boxes where details are kept. */
const HOLDERS = new Set(['moov', 'trak']);
/** XMP beside the movie, as an editing app writes it: a `uuid` box of this kind. */
const XMP_UUID = 'be7acfcb97a942e89c71999491e3afac';

/** Every details box from `from` to `to` in `buf` made a zeroed `free` box: how many, or null. */
export function clearDetails(buf: Buffer, from: number, to: number): number | null {
  const boxes = boxesIn(buf, from, to);
  if (!boxes) return null;
  let cleared = 0;
  for (const b of boxes) {
    if (DETAILS.has(b.type)) {
      buf.write('free', b.start + 4, 'latin1');
      buf.fill(0, b.body, b.end);
      cleared++;
    } else if (HOLDERS.has(b.type)) {
      const inside = clearDetails(buf, b.body, b.end);
      if (inside === null) return null;
      cleared += inside;
    }
  }
  return cleared;
}

/**
 * Takes a video's details out where they are (an MP4 or a QuickTime file, or an MPEG-4 audio
 * file): `cleared` boxes, or `unsure` when the file isn't laid out as one for certain.
 */
export async function stripVideoDetails(
  path: string,
): Promise<{ cleared: number; unsure: boolean }> {
  const unsure = { cleared: 0, unsure: true };
  const fh = await open(path, 'r+');
  try {
    const size = (await fh.stat()).size;
    const head = Buffer.alloc(24);
    let at = 0;
    let cleared = 0;
    let movie = false;
    while (at + 8 <= size) {
      const { bytesRead } = await fh.read(head, 0, 24, at);
      if (bytesRead < 8) return unsure;
      let boxSize = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      let body = 8;
      if (boxSize === 1) {
        if (bytesRead < 16) return unsure;
        boxSize = Number(head.readBigUInt64BE(8));
        body = 16;
      } else if (boxSize === 0) {
        boxSize = size - at;
      }
      if (boxSize < body || at + boxSize > size) return unsure;
      if (type === 'moov') {
        if (boxSize > MOOV_MAX) return unsure;
        const moov = Buffer.alloc(boxSize);
        await fh.read(moov, 0, boxSize, at);
        const inside = clearDetails(moov, body, boxSize);
        if (inside === null) return unsure;
        if (inside) await fh.write(moov, 0, boxSize, at);
        cleared += inside;
        movie = true;
      } else if (
        DETAILS.has(type) ||
        (type === 'uuid' && body === 8 && head.toString('hex', 8, 24) === XMP_UUID)
      ) {
        // Beside the movie rather than in it: the same, without reading it whole.
        await fh.write(Buffer.from('free', 'latin1'), 0, 4, at + 4);
        for (let done = body; done < boxSize; done += ZEROS.length) {
          await fh.write(ZEROS, 0, Math.min(ZEROS.length, boxSize - done), at + done);
        }
        cleared++;
      }
      at += boxSize;
    }
    // Without a movie box it isn't a video Caime can say anything certain of.
    return movie && at === size ? { cleared, unsure: false } : unsure;
  } catch {
    return unsure;
  } finally {
    await fh.close();
  }
}
