#!/usr/bin/env node
/**
 * The speech-to-text bake-off (docs/SPEECH.md): every audio clip in a folder, through every
 * provider that has a key in the environment, scored against the clip's reference transcript.
 *
 *   OPENAI_API_KEY=… ELEVENLABS_API_KEY=… node scripts/speech-bakeoff.mjs clips/
 *
 * A clip is `<name>.(wav|mp3|m4a|ogg|webm)` with its reference beside it as `<name>.txt`. The
 * score is the word error rate after normalizing the way a reader hears Arabic: tashkeel
 * removed, alef forms and ya and ta marbuta unified, punctuation dropped, digits as ASCII.
 */
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { normalize, wer } from './speech-wer.mjs';

const folder = process.argv[2];
if (!folder) {
  console.error('usage: node scripts/speech-bakeoff.mjs <folder of clips with .txt references>');
  process.exit(2);
}

const MIME = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
};

const providers = [];
if (process.env.OPENAI_API_KEY)
  providers.push({
    name: `openai/${process.env.OPENAI_MODEL ?? 'gpt-4o-transcribe'}`,
    async transcribe(bytes, mime, name) {
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mime }), name);
      form.append('model', process.env.OPENAI_MODEL ?? 'gpt-4o-transcribe');
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
      });
      if (!res.ok) throw new Error(`openai ${res.status}`);
      return (await res.json()).text ?? '';
    },
  });
if (process.env.ELEVENLABS_API_KEY)
  providers.push({
    name: `elevenlabs/${process.env.ELEVENLABS_MODEL ?? 'scribe_v1'}`,
    async transcribe(bytes, mime, name) {
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mime }), name);
      form.append('model_id', process.env.ELEVENLABS_MODEL ?? 'scribe_v1');
      form.append('tag_audio_events', 'false');
      const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
        body: form,
      });
      if (!res.ok) throw new Error(`elevenlabs ${res.status}`);
      return (await res.json()).text ?? '';
    },
  });
if (!providers.length) {
  console.error('set OPENAI_API_KEY and/or ELEVENLABS_API_KEY');
  process.exit(2);
}

const files = (await readdir(folder)).filter((f) => MIME[extname(f).slice(1).toLowerCase()]);
if (!files.length) {
  console.error(`no clips in ${folder}`);
  process.exit(2);
}
const totals = Object.fromEntries(
  providers.map((p) => [p.name, { errors: 0, words: 0, failed: 0 }]),
);
console.log(`clip\t${providers.map((p) => p.name).join('\t')}`);
for (const f of files.sort()) {
  const name = basename(f, extname(f));
  const reference = await readFile(join(folder, `${name}.txt`), 'utf8').catch(() => null);
  if (reference === null) {
    console.log(`${name}\t(no ${name}.txt reference, skipped)`);
    continue;
  }
  const bytes = await readFile(join(folder, f));
  const mime = MIME[extname(f).slice(1).toLowerCase()];
  const cells = [];
  for (const p of providers) {
    try {
      const text = await p.transcribe(bytes, mime, f);
      const rate = wer(reference, text);
      const words = normalize(reference).length;
      totals[p.name].errors += rate * words;
      totals[p.name].words += words;
      cells.push(`${(rate * 100).toFixed(1)}%`);
    } catch (err) {
      totals[p.name].failed += 1;
      cells.push(`failed: ${err.message}`);
    }
  }
  console.log(`${name}\t${cells.join('\t')}`);
}
console.log(
  `all\t${providers
    .map((p) => {
      const t = totals[p.name];
      return `${t.words ? ((t.errors / t.words) * 100).toFixed(1) : '—'}%${t.failed ? ` (${t.failed} failed)` : ''}`;
    })
    .join('\t')}`,
);
