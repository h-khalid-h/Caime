/**
 * A microphone that speaks (M16 F7): Chromium's fake device plays a file in place of its beep,
 * and Cai's notes cut what's said at its pauses, so the file is a second and a half of tone and a
 * second and a half of quiet, over and over. Written once where the config loads, for the browser
 * the notes spec runs in alone.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function fakeSpeechFile(): string {
  const file = join(tmpdir(), 'caime-e2e-speech.wav');
  const rate = 16_000;
  const samples = rate * 6;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const on = t % 3 < 1.5;
    const v = on
      ? 0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.15 * Math.sin(2 * Math.PI * 440 * t)
      : 0;
    data.writeInt16LE(Math.round(v * 32_767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([head, data]));
  return file;
}
