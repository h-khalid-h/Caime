/**
 * A video's container made by hand (M16 E4b): a movie box holding where it was filmed as Android
 * writes it (`udta`/`©xyz`), the camera's make, a track's own name, and an iPhone's QuickTime
 * metadata (`meta` with `keys` and `ilst`), beside the picture's bytes in `mdat`.
 */
const latin = (s: string) => Buffer.from(s, 'latin1');
const u16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
export function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), latin(type), body]);
}

export const VIDEO_PICTURE = latin('VIDEO-DATA-avc1-the-picture-itself');
/** What a phone writes of where a video was filmed, and of itself. */
export const VIDEO_SECRETS = [
  '+37.7749-122.4194/',
  'Pixel 9',
  'Clip by the river',
  'com.apple.quicktime.location.ISO6709',
  '+48.8584+002.2945/',
  'GPSLatitude',
];

/** The movie box: a header, a track, and the details a phone keeps beside them. */
function moov(): Buffer {
  const where = latin(VIDEO_SECRETS[0] as string);
  const udta = box(
    'udta',
    box('\xa9xyz', u16(where.length), u16(0x15c7), where),
    box('\xa9mak', latin(VIDEO_SECRETS[1] as string)),
  );
  const trak = box(
    'trak',
    box('tkhd', Buffer.alloc(84)),
    box('udta', box('\xa9nam', latin(VIDEO_SECRETS[2] as string))),
    box('mdia', box('mdhd', Buffer.alloc(24))),
  );
  const meta = box(
    'meta',
    box('hdlr', Buffer.alloc(24)),
    box('keys', u32(0), u32(1), box('mdta', latin(VIDEO_SECRETS[3] as string))),
    box('ilst', box('\0\0\0\x01', box('data', u32(1), u32(0), latin(VIDEO_SECRETS[4] as string)))),
  );
  return box('moov', box('mvhd', Buffer.alloc(100)), trak, udta, meta);
}

/** XMP beside the movie, as an editing app writes it. */
export const XMP_BOX = box(
  'uuid',
  Buffer.from('be7acfcb97a942e89c71999491e3afac', 'hex'),
  latin(`<x:xmpmeta><exif:${VIDEO_SECRETS[5]}>37,46.5N</exif:${VIDEO_SECRETS[5]}></x:xmpmeta>`),
);

/** The file: an MP4 (or a QuickTime file, or an MPEG-4 recording), its movie first or last. */
export function video(
  opts: { brand?: 'isom' | 'qt  ' | 'M4A '; moovLast?: boolean; xmp?: boolean } = {},
): Buffer {
  const ftyp = box('ftyp', latin(opts.brand ?? 'isom'), u32(0), latin('isommp42'));
  const mdat = box('mdat', VIDEO_PICTURE);
  const parts = opts.moovLast ? [ftyp, mdat, moov()] : [ftyp, moov(), mdat];
  return Buffer.concat(opts.xmp ? [...parts, XMP_BOX] : parts);
}

/** A movie with nothing to clear: its header and a bare track. */
export function plainVideo(): Buffer {
  const ftyp = box('ftyp', latin('isom'), u32(0), latin('isommp42'));
  const trak = box(
    'trak',
    box('tkhd', Buffer.alloc(84)),
    box('mdia', box('mdhd', Buffer.alloc(24))),
  );
  return Buffer.concat([
    ftyp,
    box('moov', box('mvhd', Buffer.alloc(100)), trak),
    box('mdat', VIDEO_PICTURE),
  ]);
}
