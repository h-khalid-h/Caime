/**
 * A recording's length read from its own bytes (M16 G12), as a decoder plays it: a browser's
 * WebM and MP4 (recorded by Chromium's MediaRecorder for these tests, as the web app records a
 * voice note), a phone's m4a laid out in chunks, an Ogg Opus stream and a WAV. Anything cut
 * short, anything with a picture and anything of another kind is read as nothing, and a header
 * that says less than the recording holds is never what's counted.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { audioLengthMs } from '../src/lib/audio-length';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

const box = (type: string, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
};
const u32 = (...values: number[]) => {
  const b = Buffer.alloc(values.length * 4);
  for (const [i, v] of values.entries()) b.writeUInt32BE(v, i * 4);
  return b;
};

/** An AAC m4a as a phone writes it: one sound track, its samples in one chunk after the movie. */
function m4a(
  frames: number,
  opts: {
    rate?: number;
    rateIndex?: number;
    objectType?: number;
    handler?: string;
    claimed?: number;
  } = {},
) {
  const { rate = 44_100, rateIndex = 4, objectType = 2, handler = 'soun' } = opts;
  const config = Buffer.alloc(2);
  config.writeUInt16BE((objectType << 11) | (rateIndex << 7) | (1 << 3), 0);
  const specific = Buffer.concat([Buffer.from([0x05, config.length]), config]);
  const decoder = Buffer.concat([
    Buffer.from([0x04, 13 + specific.length, 0x40, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    specific,
  ]);
  const es = Buffer.concat([Buffer.from([0x03, 3 + decoder.length, 0, 1, 0]), decoder]);
  const entry = Buffer.alloc(28);
  entry.writeUInt16BE(1, 6);
  entry.writeUInt16BE(1, 16);
  entry.writeUInt16BE(16, 18);
  entry.writeUInt32BE(rate * 65_536, 24);
  const sizes = Array.from({ length: frames }, (_, i) => 100 + (i % 7));
  const data = Buffer.alloc(
    sizes.reduce((a, b) => a + b, 0),
    0x21,
  );
  const ftyp = box('ftyp', Buffer.from('M4A '), u32(0), Buffer.from('M4A isommp42'));
  const movie = (offset: number) =>
    box(
      'moov',
      box('mvhd', u32(0), Buffer.alloc(96)),
      box(
        'trak',
        box('tkhd', u32(0), Buffer.alloc(8), u32(1), Buffer.alloc(68)),
        box(
          'mdia',
          // What the header says it lasts: never what's counted.
          box('mdhd', u32(0, 0, 0, rate, opts.claimed ?? frames * 1024), Buffer.alloc(4)),
          box('hdlr', u32(0, 0), Buffer.from(handler), Buffer.alloc(13)),
          box(
            'minf',
            box('smhd', u32(0, 0)),
            box(
              'stbl',
              box('stsd', u32(0, 1), box('mp4a', entry, box('esds', u32(0), es))),
              box('stts', u32(0, 1, frames, 1024)),
              box('stsc', u32(0, 1, 1, frames, 1)),
              box('stsz', u32(0, 0, frames, ...sizes)),
              box('stco', u32(0, 1, offset)),
            ),
          ),
        ),
      ),
    );
  const moov = movie(ftyp.length + movie(0).length + 8);
  return Buffer.concat([ftyp, moov, box('mdat', data)]);
}

/** An Ogg Opus stream: its two headers, then packets of one 20 ms frame each (TOC 0xf8). */
function ogg(packets: number, toc = 0xf8) {
  const pages: Buffer[] = [];
  let sequence = 0;
  const page = (payloads: Buffer[]) => {
    const lacing: number[] = [];
    for (const p of payloads) {
      let n = p.length;
      while (n >= 255) {
        lacing.push(255);
        n -= 255;
      }
      lacing.push(n);
    }
    const head = Buffer.alloc(27);
    head.write('OggS', 0, 'latin1');
    head[5] = sequence === 0 ? 2 : 0;
    head.writeUInt32LE(0xabcdef, 14);
    head.writeUInt32LE(sequence++, 18);
    head[26] = lacing.length;
    pages.push(Buffer.concat([head, Buffer.from(lacing), ...payloads]));
  };
  const opusHead = Buffer.alloc(19);
  opusHead.write('OpusHead', 0, 'latin1');
  opusHead[8] = 1;
  opusHead[9] = 1;
  page([opusHead]);
  page([Buffer.concat([Buffer.from('OpusTags', 'latin1'), Buffer.alloc(8)])]);
  for (let i = 0; i < packets; i += 10)
    page(Array.from({ length: Math.min(10, packets - i) }, () => Buffer.from([toc, 1, 2, 3, 4])));
  return Buffer.concat(pages);
}

/** A PCM WAV of `seconds` at 8 kHz, 8 bits: `claimed` is what its data chunk says it holds. */
function wav(seconds: number, claimed = seconds) {
  const rate = 8_000;
  const data = Buffer.alloc(Math.round(rate * seconds), 0x80);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(Math.round(rate * claimed), 40);
  return Buffer.concat([header, data]);
}

/**
 * An MP3 as the voice provider sends Cai's words (M17 I14a): MPEG-2 Layer III at 22,050 Hz and
 * 32 kbit/s, 104-byte frames of 576 samples, behind an ID3 tag and the encoder's Info frame.
 */
function mp3(frames: number): Buffer {
  const frame = (fill: string) => {
    const f = Buffer.alloc(104);
    f.writeUInt32BE(0xfff340c0, 0);
    f.write(fill, 36, 'latin1');
    return f;
  };
  const tag = Buffer.concat([Buffer.from('ID3\x04\x00\x00', 'latin1'), Buffer.from([0, 0, 0, 5])]);
  return Buffer.concat([
    tag,
    Buffer.from('TALB\x00', 'latin1'),
    frame('Info'),
    ...Array.from({ length: frames }, () => frame('')),
  ]);
}

describe('a recording’s length, read from its bytes (M16 G12)', () => {
  it('reads a browser’s recordings as they play', () => {
    // Two seconds recorded; the last packet still in the encoder when it stopped.
    expect(audioLengthMs(fixture('voice-2s.webm'), 'audio/webm')).toBe(1_980);
    expect(audioLengthMs(fixture('voice-2s.mp4'), 'audio/mp4')).toBe(1_980);
  });

  it('reads a phone’s m4a by its frames, and HE-AAC by its core rate', () => {
    expect(audioLengthMs(m4a(431), 'audio/mp4')).toBe(Math.ceil((431 * 1024) / 44.1));
    expect(
      audioLengthMs(m4a(100, { rate: 48_000, rateIndex: 6, objectType: 5 }), 'audio/mp4'),
    ).toBe(Math.ceil((100 * 1024) / 24));
  });

  it('reads Ogg Opus by its packets, and a WAV by its bytes', () => {
    expect(audioLengthMs(ogg(50), 'audio/ogg')).toBe(1_000);
    expect(audioLengthMs(wav(2), 'audio/wav')).toBe(2_000);
  });

  it('reads an MP3 by its frames, past its tag and the encoder’s own frame', () => {
    expect(audioLengthMs(mp3(100), 'audio/mpeg')).toBe(Math.ceil((100 * 576 * 1000) / 22_050));
    // A frame cut short at the end isn't played.
    const whole = mp3(10);
    expect(audioLengthMs(whole.subarray(0, whole.length - 50), 'audio/mpeg')).toBe(
      Math.ceil((9 * 576 * 1000) / 22_050),
    );
  });

  it('counts what plays, never what a header says', () => {
    // A data chunk that says it holds a second of ten, and a track that says it lasts an hour.
    expect(audioLengthMs(wav(10, 1), 'audio/wav')).toBe(10_000);
    expect(audioLengthMs(m4a(431, { claimed: 3_600 * 44_100 }), 'audio/mp4')).toBe(10_008);
  });

  it('reads nothing cut short, with a picture, or of another kind', () => {
    const webm = fixture('voice-2s.webm');
    const mp4 = fixture('voice-2s.mp4');
    expect(audioLengthMs(webm.subarray(0, webm.length - 300), 'audio/webm')).toBeNull();
    expect(audioLengthMs(mp4.subarray(0, mp4.length - 300), 'audio/mp4')).toBeNull();
    expect(audioLengthMs(m4a(10, { handler: 'vide' }), 'audio/mp4')).toBeNull();
    expect(audioLengthMs(Buffer.from('ID3 not a recording Caime reads'), 'audio/mpeg')).toBeNull();
    expect(audioLengthMs(Buffer.alloc(64, 7), 'audio/webm')).toBeNull();
    expect(audioLengthMs(ogg(5).subarray(0, 40), 'audio/ogg')).toBeNull();
  });
});
