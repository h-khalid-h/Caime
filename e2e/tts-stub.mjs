/**
 * A stand-in for the text-to-speech provider (ElevenLabs' shape, `lib/tts.ts`), for end-to-end
 * runs: the server under test talks to it through TTS_BASE_URL. Every request for speech answers
 * a short tone as a WAV (so the recorder's browser decodes and plays it) with a `history-item-id`,
 * as the provider does; `GET /requests` lists what it was asked to say, `DELETE /requests` forgets
 * it (a serial group retried starts from nothing); a history item's delete and the voice's read
 * (the provider probe) answer ok.
 */
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 8791);
const spoken = [];
const forgotten = [];

/** A WAV of a tone, `seconds` long: what the browser plays as Cai's voice. */
function tone(seconds) {
  const rate = 16_000;
  const samples = Math.round(rate * seconds);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const fade = Math.min(1, t * 20, (seconds - t) * 20);
    data.writeInt16LE(Math.round(0.25 * fade * Math.sin(2 * Math.PI * 330 * t) * 32_767), i * 2);
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
  return Buffer.concat([head, data]);
}

createServer(async (req, res) => {
  const url = req.url ?? '';
  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok');
  }
  if (req.method === 'GET' && url === '/requests') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ spoken, forgotten }));
  }
  if (req.method === 'DELETE' && url === '/requests') {
    spoken.length = 0;
    forgotten.length = 0;
    res.writeHead(204);
    return res.end();
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (req.method === 'POST' && url.startsWith('/v1/text-to-speech/')) {
    const body = JSON.parse(raw || '{}');
    spoken.push({ text: String(body.text ?? ''), language: body.language_code ?? null });
    res.writeHead(200, {
      'content-type': 'audio/wav',
      'history-item-id': `hist-${spoken.length}`,
    });
    return res.end(tone(0.6));
  }
  if (req.method === 'DELETE' && url.startsWith('/v1/history/')) {
    forgotten.push(decodeURIComponent(url.slice('/v1/history/'.length)));
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"status":"ok"}');
  }
  if (req.method === 'GET' && url.startsWith('/v1/voices/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ voice_id: 'e2e-voice', name: 'Cai' }));
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ detail: { status: 'not_found' } }));
}).listen(port, '127.0.0.1');
