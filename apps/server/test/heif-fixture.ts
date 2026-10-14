/**
 * A HEIF container made by hand (R88): a picture item, an Exif item and an XMP item, each saying
 * where a photo was taken, laid out as a phone lays them out (in `mdat`, or the Exif in `idat`).
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
function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), latin(type), body]);
}
function full(type: string, version: number, ...parts: Buffer[]): Buffer {
  return box(type, Buffer.from([version, 0, 0, 0]), ...parts);
}

export const HEIF_PICTURE = latin('IMAGE-DATA-hvc1-the-picture-itself');
export const HEIF_EXIF = Buffer.concat([u32(6), latin('Exif\0\0MM\0*GPSLatitude 30/1 2/1 0/1 N')]);
export const HEIF_XMP = latin(
  '<x:xmpmeta><exif:GPSLatitude>30,2.0N</exif:GPSLatitude></x:xmpmeta>',
);

/** The file, and where each part of it sits. */
export function heif(opts: { exifIn?: 'mdat' | 'idat'; dropExifLocation?: boolean } = {}) {
  const inIdat = opts.exifIn === 'idat';
  const make = (offsets: { picture: number; exif: number; xmp: number }) => {
    const item = (id: number, method: number, offset: number, length: number) =>
      Buffer.concat([u16(id), u16(method), u16(0), u16(1), u32(offset), u32(length)]);
    const items = [
      item(1, 0, offsets.picture, HEIF_PICTURE.length),
      ...(opts.dropExifLocation
        ? []
        : [item(2, inIdat ? 1 : 0, inIdat ? 0 : offsets.exif, HEIF_EXIF.length)]),
      item(3, 0, offsets.xmp, HEIF_XMP.length),
    ];
    const meta = full(
      'meta',
      0,
      full('hdlr', 0, u32(0), latin('pict'), u32(0), u32(0), u32(0), latin('\0')),
      full(
        'iinf',
        0,
        u16(3),
        full('infe', 2, u16(1), u16(0), latin('hvc1'), latin('\0')),
        full('infe', 2, u16(2), u16(0), latin('Exif'), latin('\0')),
        full('infe', 2, u16(3), u16(0), latin('mime'), latin('\0application/rdf+xml\0')),
      ),
      full('iloc', 1, Buffer.from([0x44, 0x00]), u16(items.length), ...items),
      ...(inIdat ? [box('idat', HEIF_EXIF)] : []),
    );
    const ftyp = box('ftyp', latin('heic'), u32(0), latin('mif1heic'));
    const mdat = box('mdat', HEIF_PICTURE, ...(inIdat ? [] : [HEIF_EXIF]), HEIF_XMP);
    return { file: Buffer.concat([ftyp, meta, mdat]), mdatAt: ftyp.length + meta.length };
  };
  // The offsets don't change the sizes: lay it out once to learn where `mdat` starts.
  const { mdatAt } = make({ picture: 0, exif: 0, xmp: 0 });
  const picture = mdatAt + 8;
  const exif = picture + HEIF_PICTURE.length;
  const xmp = inIdat ? exif : exif + HEIF_EXIF.length;
  const { file } = make({ picture, exif, xmp });
  return { file, picture, exif: inIdat ? file.indexOf(HEIF_EXIF) : exif, xmp };
}
