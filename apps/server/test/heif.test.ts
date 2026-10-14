import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stripHeifDetails } from '../src/lib/heif';
import { HEIF_EXIF, HEIF_PICTURE, HEIF_XMP, heif } from './heif-fixture';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'caime-heif-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const zeros = (n: number) => Buffer.alloc(n);

async function stripped(file: Buffer, name: string) {
  const path = join(dir, name);
  await writeFile(path, file);
  const result = await stripHeifDetails(path);
  return { result, after: await readFile(path) };
}

describe('a HEIC’s hidden details, cleared where they sit (R88)', () => {
  it('zeroes the Exif and the XMP items and leaves the picture and every offset as they were', async () => {
    const h = heif();
    expect(h.file.includes('GPSLatitude')).toBe(true);
    const { result, after } = await stripped(h.file, 'mdat.heic');
    expect(result).toEqual({ cleared: 2, unsure: false });
    expect(after.length).toBe(h.file.length);
    expect(after.includes('GPSLatitude')).toBe(false);
    expect(after.subarray(h.exif, h.exif + HEIF_EXIF.length)).toEqual(zeros(HEIF_EXIF.length));
    expect(after.subarray(h.xmp, h.xmp + HEIF_XMP.length)).toEqual(zeros(HEIF_XMP.length));
    expect(after.subarray(h.picture, h.picture + HEIF_PICTURE.length)).toEqual(HEIF_PICTURE);
    // Everything else, byte for byte.
    const rest = (b: Buffer) =>
      Buffer.concat([b.subarray(0, h.exif), b.subarray(h.xmp + HEIF_XMP.length)]);
    expect(rest(after)).toEqual(rest(h.file));
  });

  it('finds an Exif item kept inside the container’s own data box', async () => {
    const h = heif({ exifIn: 'idat' });
    const { result, after } = await stripped(h.file, 'idat.heic');
    expect(result).toEqual({ cleared: 2, unsure: false });
    expect(after.includes('GPSLatitude')).toBe(false);
    expect(after.subarray(h.picture, h.picture + HEIF_PICTURE.length)).toEqual(HEIF_PICTURE);
  });

  it('is unsure, and touches nothing, when an item’s place can’t be told', async () => {
    const h = heif({ dropExifLocation: true });
    const { result, after } = await stripped(h.file, 'lost.heic');
    expect(result.unsure).toBe(true);
    expect(after).toEqual(h.file);
  });

  it('is unsure of a container cut short', async () => {
    const h = heif();
    const { result } = await stripped(h.file.subarray(0, 60), 'cut.heic');
    expect(result.unsure).toBe(true);
  });
});
