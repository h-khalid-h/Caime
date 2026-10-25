/**
 * How long a recording is, read from its own bytes (M16 G12): what a speech provider hears and
 * charges for, so what bounds a voice note before it's sent, never the length a device says.
 * Counted as a decoder plays it, not as a header claims: Opus by each packet's own table of
 * contents (RFC 6716 §3.1) wherever it's carried (a WebM's blocks, an Ogg stream's packets, an
 * MP4's samples), AAC by its frames (1,024 samples each at its stream's rate), PCM by its bytes.
 * Anything else, or anything that doesn't read through to its end, is null, and isn't sent.
 */
import { type Box, boxesIn } from './boxes';

// ---- Opus ------------------------------------------------------------------------------------

/** One Opus packet's length in microseconds from its first bytes, or null when it isn't one. */
export function opusPacketUs(buf: Buffer, at: number, end: number): number | null {
  if (end - at < 1) return null;
  const toc = buf[at]!;
  const config = toc >> 3;
  const frameUs =
    config < 12
      ? [10_000, 20_000, 40_000, 60_000][config % 4]!
      : config < 16
        ? [10_000, 20_000][config % 2]!
        : [2_500, 5_000, 10_000, 20_000][config % 4]!;
  const code = toc & 3;
  let frames = code === 0 ? 1 : 2;
  if (code === 3) {
    if (end - at < 2) return null;
    frames = buf[at + 1]! & 0x3f;
    if (frames === 0) return null;
  }
  const us = frames * frameUs;
  // A packet holds at most 120 ms (RFC 6716 §3.2.5).
  return us <= 120_000 ? us : null;
}

// ---- WebM (Matroska) -------------------------------------------------------------------------

const EBML_HEADER = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const TRACK_NUMBER = 0xd7;
const TRACK_TYPE = 0x83;
const CODEC_ID = 0x86;
const CLUSTER = 0x1f43b675;
const SIMPLE_BLOCK = 0xa3;
const BLOCK_GROUP = 0xa0;
const BLOCK = 0xa1;
/** What may follow a cluster in a segment: a cluster of unknown size ends where one starts. */
const SEGMENT_LEVEL = new Set([
  0x114d9b74,
  0x1549a966,
  TRACKS,
  CLUSTER,
  0x1c53bb6b,
  0x1254c367,
  0x1043a770,
  0x1941a469,
]);

interface Element {
  id: number;
  body: number;
  /** Where it ends, or null when its size is unknown (a live recording's segment and clusters). */
  end: number | null;
}

/** A variable-length integer: its value (the marker taken off) and its length, or null. */
function vint(buf: Buffer, at: number, keepMarker = false) {
  const first = buf[at];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 23;
  if (at + length > buf.length) return null;
  const mask = 0xff >> length;
  let value = keepMarker ? first : first & mask;
  let unknown = (first & mask) === mask;
  for (let i = 1; i < length; i++) {
    const b = buf[at + i]!;
    value = value * 256 + b;
    if (b !== 0xff) unknown = false;
  }
  return { value, length, unknown };
}

function element(buf: Buffer, at: number, limit: number): Element | null {
  const id = vint(buf, at, true);
  if (!id || id.length > 4) return null;
  const size = vint(buf, at + id.length);
  if (!size) return null;
  const body = at + id.length + size.length;
  if (size.unknown) return { id: id.value, body, end: null };
  const end = body + size.value;
  return end <= limit ? { id: id.value, body, end } : null;
}

/** The children of an element of known size laid end to end, or null when they aren't. */
function children(buf: Buffer, from: number, to: number): Element[] | null {
  const out: Element[] = [];
  for (let at = from; at < to; ) {
    const el = element(buf, at, to);
    if (!el || el.end === null) return null;
    out.push(el);
    at = el.end;
  }
  return out;
}

function uint(buf: Buffer, from: number, to: number): number {
  let v = 0;
  for (let i = from; i < to; i++) v = v * 256 + buf[i]!;
  return v;
}

/** The Opus tracks a WebM's track list names, or null when it holds a sound of another kind. */
function opusTracks(buf: Buffer, tracks: Element): Set<number> | null {
  const entries = children(buf, tracks.body, tracks.end!);
  if (!entries) return null;
  const opus = new Set<number>();
  for (const entry of entries) {
    if (entry.id !== TRACK_ENTRY) continue;
    const fields = children(buf, entry.body, entry.end!);
    if (!fields) return null;
    let number = 0;
    let type = 0;
    let codec = '';
    for (const f of fields) {
      if (f.id === TRACK_NUMBER) number = uint(buf, f.body, f.end!);
      else if (f.id === TRACK_TYPE) type = uint(buf, f.body, f.end!);
      else if (f.id === CODEC_ID) codec = buf.toString('latin1', f.body, f.end!);
    }
    if (type === 1) return null; // A picture: a video, never a voice note.
    if (codec === 'A_OPUS') opus.add(number);
    else if (type === 2 || codec.startsWith('A_')) return null;
  }
  return opus.size ? opus : null;
}

/** A block's frames, each one Opus packet: its length, 0 for another track's, or null. */
function blockUs(buf: Buffer, from: number, to: number, tracks: Set<number>): number | null {
  const track = vint(buf, from);
  if (!track) return null;
  const head = from + track.length + 3; // the track, a 16-bit time and the flags
  if (head > to) return null;
  if (!tracks.has(track.value)) return 0;
  const lacing = (buf[head - 1]! >> 1) & 3;
  if (lacing === 0) return opusPacketUs(buf, head, to);
  // Laced: how many frames, then their sizes (RFC 9559 §10.3), the last's what's left.
  const count = buf[head]! + 1;
  let at = head + 1;
  const sizes: number[] = [];
  if (lacing === 1) {
    for (let i = 0; i < count - 1; i++) {
      let size = 0;
      for (;;) {
        const b = buf[at++];
        if (b === undefined) return null;
        size += b;
        if (b < 255) break;
      }
      sizes.push(size);
    }
  } else if (lacing === 3) {
    const first = vint(buf, at);
    if (!first) return null;
    at += first.length;
    sizes.push(first.value);
    for (let i = 1; i < count - 1; i++) {
      const diff = vint(buf, at);
      if (!diff) return null;
      at += diff.length;
      sizes.push(sizes[i - 1]! + diff.value - (2 ** (7 * diff.length - 1) - 1));
    }
  } else {
    const each = (to - at) / count;
    if (!Number.isInteger(each)) return null;
    for (let i = 0; i < count - 1; i++) sizes.push(each);
  }
  let us = 0;
  for (const size of sizes) {
    if (size < 1 || at + size > to) return null;
    const one = opusPacketUs(buf, at, at + size);
    if (one === null) return null;
    us += one;
    at += size;
  }
  const last = opusPacketUs(buf, at, to);
  return last === null ? null : us + last;
}

export function webmLengthUs(buf: Buffer): number | null {
  const head = element(buf, 0, buf.length);
  if (!head || head.id !== EBML_HEADER || head.end === null) return null;
  const segment = element(buf, head.end, buf.length);
  if (!segment || segment.id !== SEGMENT) return null;
  const end = segment.end ?? buf.length;
  let tracks: Set<number> | null = null;
  let us = 0;
  for (let at = segment.body; at < end; ) {
    const el = element(buf, at, end);
    if (!el) return null;
    if (el.id === TRACKS) {
      if (el.end === null) return null;
      tracks = opusTracks(buf, el);
      if (!tracks) return null;
      at = el.end;
      continue;
    }
    if (el.id !== CLUSTER) {
      if (el.end === null) return null;
      at = el.end;
      continue;
    }
    // A cluster's blocks: a cluster before the tracks are named can't be read.
    if (!tracks) return null;
    const stop = el.end ?? end;
    let inner = el.body;
    while (inner < stop) {
      const child = element(buf, inner, stop);
      if (!child) return null;
      // An unknown-sized cluster ends where the segment's next element starts.
      if (el.end === null && SEGMENT_LEVEL.has(child.id)) break;
      if (child.end === null) return null;
      if (child.id === SIMPLE_BLOCK) {
        const one = blockUs(buf, child.body, child.end, tracks);
        if (one === null) return null;
        us += one;
      } else if (child.id === BLOCK_GROUP) {
        const parts = children(buf, child.body, child.end);
        if (!parts) return null;
        for (const p of parts) {
          if (p.id !== BLOCK) continue;
          const one = blockUs(buf, p.body, p.end!, tracks);
          if (one === null) return null;
          us += one;
        }
      }
      inner = child.end;
    }
    at = inner;
  }
  return tracks ? us : null;
}

// ---- Ogg -------------------------------------------------------------------------------------

/** An Ogg Opus stream's length: its packets after the two headers, or null. */
export function oggLengthUs(buf: Buffer): number | null {
  let serial: number | null = null;
  let packet: number[] = [];
  let packets = 0;
  let us = 0;
  let at = 0;
  const done = () => {
    const bytes = Buffer.from(packet);
    if (packets === 0 && bytes.toString('latin1', 0, 8) !== 'OpusHead') return false;
    if (packets >= 2) {
      const one = opusPacketUs(bytes, 0, bytes.length);
      if (one === null) return false;
      us += one;
    }
    packets++;
    packet = [];
    return true;
  };
  while (at < buf.length) {
    if (buf.toString('latin1', at, at + 4) !== 'OggS' || at + 27 > buf.length) return null;
    const pageSerial = buf.readUInt32LE(at + 14);
    if (serial === null) serial = pageSerial;
    else if (pageSerial !== serial) return null; // one stream alone
    const segments = buf[at + 26]!;
    let body = at + 27 + segments;
    if (body > buf.length) return null;
    for (let i = 0; i < segments; i++) {
      const lace = buf[at + 27 + i]!;
      if (body + lace > buf.length) return null;
      // Only a packet's first bytes are needed: its table of contents, or the header's name.
      for (let j = 0; j < lace && packet.length < 8; j++) packet.push(buf[body + j]!);
      body += lace;
      if (lace < 255 && !done()) return null;
    }
    at = body;
  }
  return packets >= 2 ? us : null;
}

// ---- MP4 -------------------------------------------------------------------------------------

const inside = (buf: Buffer, box: Box) => boxesIn(buf, box.body, box.end);
const find = (boxes: Box[] | null, type: string) => boxes?.find((b) => b.type === type) ?? null;

interface SoundTrack {
  id: number;
  codec: 'aac' | 'opus';
  /** AAC's stream rate, from its decoder's own configuration. */
  rate: number;
  /** Where each sample is and how big, in the order they play. */
  samples: Array<[at: number, size: number]>;
}

/** The AAC stream's sample rate from its `esds` box (ISO 14496-3 AudioSpecificConfig), or null. */
function aacRate(buf: Buffer, esds: Box): number | null {
  let at = esds.body + 4;
  const descriptor = (tag: number) => {
    if (buf[at] !== tag) return false;
    at++;
    for (let i = 0; i < 4; i++) {
      const b = buf[at++];
      if (b === undefined) return false;
      if (!(b & 0x80)) break;
    }
    return true;
  };
  if (!descriptor(0x03)) return null;
  const flags = buf[at + 2] ?? 0;
  const depends = flags & 0x80 ? 2 : 0;
  const url = flags & 0x40 ? 1 + (buf[at + 3 + depends] ?? 0) : 0;
  at += 3 + depends + url + (flags & 0x20 ? 2 : 0);
  if (!descriptor(0x04)) return null;
  at += 13;
  if (!descriptor(0x05) || at + 2 > esds.end) return null;
  const bits = (buf[at]! << 8) | buf[at + 1]!;
  let objectType = bits >> 11;
  let index = (bits >> 7) & 0xf;
  if (objectType === 31) {
    objectType = 32 + ((bits >> 5) & 0x3f);
    index = (bits >> 1) & 0xf;
  }
  const RATES = [
    96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
  ];
  return RATES[index] ?? null;
}

function soundTrack(buf: Buffer, trak: Box): SoundTrack | 'other' | null {
  const parts = inside(buf, trak);
  const tkhd = find(parts, 'tkhd');
  const mdia = find(parts, 'mdia');
  if (!tkhd || !mdia) return null;
  const id = buf.readUInt32BE(tkhd.body + (buf[tkhd.body] === 1 ? 20 : 12));
  const media = inside(buf, mdia);
  const hdlr = find(media, 'hdlr');
  if (!hdlr) return null;
  if (buf.toString('latin1', hdlr.body + 8, hdlr.body + 12) !== 'soun') return 'other';
  const stbl = find(inside(buf, find(media, 'minf') ?? hdlr), 'stbl');
  if (!stbl) return null;
  const table = inside(buf, stbl);
  const stsd = find(table, 'stsd');
  if (!stsd) return null;
  const entries = boxesIn(buf, stsd.body + 8, stsd.end);
  const entry = entries?.[0];
  if (!entry || entries.length !== 1) return null;
  let codec: SoundTrack['codec'];
  let rate = 0;
  if (entry.type === 'mp4a') {
    codec = 'aac';
    // An audio sample entry's own boxes start 28 bytes in (ISO 14496-12 §12.2.3).
    const esds = find(boxesIn(buf, entry.body + 28, entry.end), 'esds');
    const r = esds ? aacRate(buf, esds) : null;
    if (!r) return null;
    rate = r;
  } else if (entry.type === 'Opus') codec = 'opus';
  else return null;
  // Samples laid out in chunks (a phone's recording), or none until its fragments (a browser's).
  const stsz = find(table, 'stsz');
  const stsc = find(table, 'stsc');
  const offsets = find(table, 'stco') ?? find(table, 'co64');
  if (!stsz || !stsc || !offsets) return null;
  const count = buf.readUInt32BE(stsz.body + 8);
  const fixed = buf.readUInt32BE(stsz.body + 4);
  const samples: SoundTrack['samples'] = [];
  if (count) {
    const chunks = buf.readUInt32BE(offsets.body + 4);
    const wide = offsets.type === 'co64';
    const runs = buf.readUInt32BE(stsc.body + 4);
    let sample = 0;
    for (let r = 0; r < runs; r++) {
      const at = stsc.body + 8 + r * 12;
      const first = buf.readUInt32BE(at);
      const perChunk = buf.readUInt32BE(at + 4);
      const next = r + 1 < runs ? buf.readUInt32BE(at + 12) : chunks + 1;
      for (let c = first; c < next && c <= chunks; c++) {
        let pos = wide
          ? Number(buf.readBigUInt64BE(offsets.body + 8 + (c - 1) * 8))
          : buf.readUInt32BE(offsets.body + 8 + (c - 1) * 4);
        for (let s = 0; s < perChunk && sample < count; s++, sample++) {
          const size = fixed || buf.readUInt32BE(stsz.body + 12 + sample * 4);
          samples.push([pos, size]);
          pos += size;
        }
      }
    }
    if (sample !== count) return null;
  }
  return { id, codec, rate, samples };
}

/** Each fragment's samples for the track (ISO 14496-12 §8.8), added to what the movie held. */
function fragmentSamples(buf: Buffer, moof: Box, track: SoundTrack, defaults: { size: number }) {
  for (const traf of inside(buf, moof)?.filter((b) => b.type === 'traf') ?? []) {
    const parts = inside(buf, traf);
    const tfhd = find(parts, 'tfhd');
    if (!tfhd) return false;
    const flags = buf.readUInt32BE(tfhd.body) & 0xffffff;
    if (buf.readUInt32BE(tfhd.body + 4) !== track.id) continue;
    let at = tfhd.body + 8;
    let base = moof.start;
    if (flags & 0x1) {
      base = Number(buf.readBigUInt64BE(at));
      at += 8;
    } else if (!(flags & 0x20000)) return false;
    if (flags & 0x2) at += 4;
    if (flags & 0x8) at += 4;
    const size = flags & 0x10 ? buf.readUInt32BE(at) : defaults.size;
    for (const trun of parts?.filter((b) => b.type === 'trun') ?? []) {
      const rflags = buf.readUInt32BE(trun.body) & 0xffffff;
      const count = buf.readUInt32BE(trun.body + 4);
      let p = trun.body + 8;
      let pos = base;
      if (rflags & 0x1) {
        pos = base + buf.readInt32BE(p);
        p += 4;
      } else return false;
      if (rflags & 0x4) p += 4;
      for (let i = 0; i < count; i++) {
        if (rflags & 0x100) p += 4;
        let s = size;
        if (rflags & 0x200) {
          s = buf.readUInt32BE(p);
          p += 4;
        }
        if (rflags & 0x400) p += 4;
        if (rflags & 0x800) p += 4;
        if (p > trun.end || !s) return false;
        track.samples.push([pos, s]);
        pos += s;
      }
    }
  }
  return true;
}

export function mp4LengthUs(buf: Buffer): number | null {
  const top = boxesIn(buf, 0, buf.length);
  const moov = find(top, 'moov');
  if (!top || !moov) return null;
  const movie = inside(buf, moov);
  let track: SoundTrack | null = null;
  for (const trak of movie?.filter((b) => b.type === 'trak') ?? []) {
    const t = soundTrack(buf, trak);
    // One sound and nothing else: a picture is a video, a second sound isn't a voice note.
    if (t === null || t === 'other' || track) return null;
    track = t;
  }
  if (!track) return null;
  const trex = find(inside(buf, find(movie, 'mvex') ?? moov), 'trex');
  const defaults = { size: trex ? buf.readUInt32BE(trex.body + 16) : 0 };
  for (const moof of top.filter((b) => b.type === 'moof'))
    if (!fragmentSamples(buf, moof, track, defaults)) return null;
  // Every sample is in the file, or the table says more than it holds.
  if (track.samples.some(([at, size]) => at + size > buf.length)) return null;
  if (track.codec === 'aac')
    return Math.ceil((track.samples.length * 1024 * 1_000_000) / track.rate);
  let us = 0;
  for (const [at, size] of track.samples) {
    const one = opusPacketUs(buf, at, at + size);
    if (one === null) return null;
    us += one;
  }
  return us;
}

// ---- WAV -------------------------------------------------------------------------------------

/**
 * A PCM WAV's length by the frames it holds after its data chunk starts, at its sample rate:
 * what a decoder plays, never the chunk's size or the header's byte rate.
 */
export function wavLengthUs(buf: Buffer): number | null {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE')
    return null;
  let rate = 0;
  let frameBytes = 0;
  for (let at = 12; at + 8 <= buf.length; ) {
    const id = buf.toString('latin1', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'fmt ') {
      const format = buf.readUInt16LE(at + 8);
      // PCM, float or the extensible form's: anything compressed is counted some other way.
      if (format !== 1 && format !== 3 && format !== 0xfffe) return null;
      rate = buf.readUInt32LE(at + 12);
      frameBytes = buf.readUInt16LE(at + 20);
      // A rate no recording has (a telephone's 8 kHz to a studio's 384 kHz) isn't one.
      if (rate < 8_000 || rate > 384_000 || !frameBytes) return null;
    } else if (id === 'data') {
      if (!rate) return null;
      const frames = Math.floor((buf.length - (at + 8)) / frameBytes);
      return Math.ceil((frames * 1_000_000) / rate);
    }
    at += 8 + size + (size & 1);
  }
  return null;
}

// ---- MP3 -------------------------------------------------------------------------------------

/** Layer III's bitrates in kbit/s by index: MPEG-1's, then MPEG-2's and 2.5's. */
const MP3_KBPS = [
  [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
] as const;
/** Sample rates by version bits (`00` 2.5, `10` 2, `11` 1) and index. */
const MP3_RATES: Record<number, readonly number[]> = {
  0: [11_025, 12_000, 8_000],
  2: [22_050, 24_000, 16_000],
  3: [44_100, 48_000, 32_000],
};

/**
 * An MP3's length by the Layer III frames it holds, each a fixed number of samples at its rate
 * (Cai's spoken answers, M17 I14a): never the bitrate times the size, which a variable rate or an
 * ID3 tag would throw off. A Xing or Info frame (the encoder's own header) holds no sound.
 */
export function mp3LengthUs(buf: Buffer): number | null {
  let at = 0;
  // An ID3v2 tag first: ten bytes, then its size in seven-bit bytes (and a footer when flagged).
  if (buf.length >= 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const size =
      ((buf[6]! & 0x7f) << 21) |
      ((buf[7]! & 0x7f) << 14) |
      ((buf[8]! & 0x7f) << 7) |
      (buf[9]! & 0x7f);
    at = 10 + size + (buf[5]! & 0x10 ? 10 : 0);
  }
  let us = 0;
  let frames = 0;
  while (at + 4 <= buf.length) {
    const h = buf.readUInt32BE(at);
    // Frame sync, then Layer III (`01`).
    if ((h & 0xffe00000) >>> 0 !== 0xffe00000 || ((h >>> 17) & 3) !== 1) break;
    const version = (h >>> 19) & 3;
    const rates = MP3_RATES[version];
    const kbps = MP3_KBPS[version === 3 ? 0 : 1][(h >>> 12) & 15];
    const rate = rates?.[(h >>> 10) & 3];
    if (!rates || !kbps || !rate) return null;
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor(((samples / 8) * kbps * 1000) / rate) + ((h >>> 9) & 1);
    if (at + length > buf.length) break;
    const head = buf.toString('latin1', at + 4, Math.min(at + 4 + 40, at + length));
    if (!(frames === 0 && (head.includes('Xing') || head.includes('Info'))))
      us += (samples * 1_000_000) / rate;
    frames += 1;
    at += length;
  }
  return us > 0 ? Math.round(us) : null;
}

/** How long a recording is, in milliseconds, read from its bytes; null when it can't be. */
export function audioLengthMs(bytes: Buffer, mime: string): number | null {
  let us: number | null;
  try {
    us =
      mime === 'audio/webm'
        ? webmLengthUs(bytes)
        : mime === 'audio/ogg'
          ? oggLengthUs(bytes)
          : mime === 'audio/mp4'
            ? mp4LengthUs(bytes)
            : mime === 'audio/wav'
              ? wavLengthUs(bytes)
              : mime === 'audio/mpeg'
                ? mp3LengthUs(bytes)
                : null;
  } catch {
    // A box or an element that says it runs past the file: not a recording read for certain.
    return null;
  }
  return us === null ? null : Math.ceil(us / 1000);
}
