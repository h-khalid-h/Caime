/**
 * Cai hears and answers aloud (M17 I14a): a voice note to Cai is put into words by the one
 * transcription path and answered as typed words are; when it was spoken to, a short answer comes
 * back as Cai's voice note with its words under it, and a long one is written. A note it can't hear
 * (assist off, no speech provider, a provider that fails) is answered with why, never silence.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CAI_ID, uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  letGoOfSpoken,
  SPOKEN_KEPT_DAYS,
  SPOKEN_REPLY_MAX,
  speakReply,
  spokenText,
} from '../src/lib/cai-voice';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const heardReplies: Array<{ status: number; json: unknown }> = [];
const spoken: Array<{ text: string; language_code?: string }> = [];
let stub: Server;
let t: TestApp;
let hassan: Client;
let mona: Client;

/** A WAV of silence, as a phone's voice note would be sent. */
function wav(seconds = 0.5, rate = 16_000): Buffer {
  const data = Buffer.alloc(Math.round(rate * seconds) * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** What the voice provider sends back: MPEG-2 Layer III frames of 576 samples at 22,050 Hz. */
function mp3(frames: number): Buffer {
  const frame = () => {
    const f = Buffer.alloc(104);
    f.writeUInt32BE(0xfff340c0, 0);
    return f;
  };
  return Buffer.concat(Array.from({ length: frames }, frame));
}

async function upload(c: Client, data: Buffer) {
  const boundary = `----caime${uuidv4()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/files?durationMs=500',
    payload,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${c.token}`,
    },
  });
  if (res.statusCode !== 201) throw new Error(`${res.statusCode} ${res.body}`);
  return res.json().file as { id: string };
}

const caiChat = async (c: Client) =>
  (await c.post('/v1/conversations', { kind: 'direct', userId: CAI_ID })).conversation.id as string;
const messages = async (c: Client, conversationId: string) =>
  (await c.get(`/v1/conversations/${conversationId}/messages`)).messages as any[];

/** A voice note to Cai, heard and answered as the workers would. */
async function speakTo(c: Client, conversationId: string) {
  const file = await upload(c, wav());
  await c.post(`/v1/conversations/${conversationId}/messages`, {
    clientId: uuidv4(),
    kind: 'voice',
    fileIds: [file.id],
    payload: { durationMs: 500 },
  });
  for (let i = 0; i < 2; i++) {
    await t.ctx.flush();
    t.clock.advance(1000);
    await runDueJobs(t.ctx);
  }
  await t.ctx.flush();
  return (await messages(c, conversationId)).at(-1);
}

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const url = req.url ?? '';
    if (url.startsWith('/v1/text-to-speech/')) {
      const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      spoken.push({ text: json.text, language_code: json.language_code });
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'history-item-id': `h-${spoken.length}` });
      res.end(mp3(100));
      return;
    }
    if (url.startsWith('/v1/history/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    const r = heardReplies.shift() ?? { status: 500, json: { error: 'no reply queued' } };
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.json));
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  t = await createTestApp({
    SPEECH_PROVIDER: 'openai',
    SPEECH_API_KEY: 'test-speech-key',
    SPEECH_BASE_URL: base,
    TTS_PROVIDER: 'elevenlabs',
    TTS_API_KEY: 'test-voice-key',
    TTS_VOICE_ID: 'voice-1',
    TTS_BASE_URL: base,
  });
  t.clock.set('2026-10-20T07:00:00Z');
  hassan = await signup(t, { displayName: 'Hassan Khalid' });
  mona = await signup(t, { displayName: 'Mona Adel' });
  await hassan.patch('/v1/me', { aiEnabled: true });
});
afterAll(async () => {
  await t.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

describe('Cai hears and answers aloud (M17 I14a)', () => {
  it('hears a voice note and answers it as typed words, aloud, its words under its voice', async () => {
    const cai = await caiChat(hassan);
    heardReplies.push({ status: 200, json: { text: 'Thank you!', language: 'en' } });
    const reply = await speakTo(hassan, cai);
    expect(reply.senderId).toBe(CAI_ID);
    expect(reply.kind).toBe('voice');
    expect(reply.body).toBe('Any time!');
    expect(reply.payload.spoken).toBe(true);
    // Its length read from the sound itself: a hundred frames of 576 samples at 22,050 Hz.
    expect(reply.payload.durationMs).toBe(Math.ceil((100 * 576 * 1000) / 22_050));
    expect(reply.files).toHaveLength(1);
    expect(spoken.at(-1)).toEqual({ text: 'Any time!', language_code: 'en' });
    // What they said is kept as their words, as any voice note's are.
    const said = (await messages(hassan, cai)).at(-2);
    expect(said.kind).toBe('voice');
    expect(said.body).toBe('Thank you!');
  });

  it('lets the sound go after its days, the answer staying as its words', async () => {
    const cai = await caiChat(hassan);
    const said = (await messages(hassan, cai)).filter((m) => m.payload.spoken === true);
    expect(said.length).toBeGreaterThan(0);
    const fileId = said[0].files[0].id as string;
    await letGoOfSpoken(t.ctx);
    expect((await messages(hassan, cai)).find((m) => m.id === said[0].id).kind).toBe('voice');
    t.clock.advance((SPOKEN_KEPT_DAYS + 1) * 86_400_000);
    await letGoOfSpoken(t.ctx);
    const after = (await messages(hassan, cai)).find((m) => m.id === said[0].id);
    expect(after.kind).toBe('text');
    expect(after.body).toBe('Any time!');
    expect(after.files).toEqual([]);
    expect(after.payload.spoken).toBeUndefined();
    const file = await t.ctx.db
      .selectFrom('files')
      .select('id')
      .where('id', '=', fileId)
      .executeTakeFirst();
    expect(file).toBeUndefined();
    expect(await t.ctx.db.selectFrom('cai_spoken').select('file_id').execute()).toHaveLength(0);
  });

  it('writes what is better read, and says a list as a sentence', async () => {
    const cai = await caiChat(hassan);
    const before = spoken.length;
    const long = `${'A long answer. '.repeat(30)}`.trim();
    expect(long.length).toBeGreaterThan(SPOKEN_REPLY_MAX);
    expect(await speakReply(t.ctx, CAI_ID, cai, hassan.user.id, long, 'en')).toBe(false);
    expect(spoken.length).toBe(before);
    expect(spokenText('Coming up this week:\n• Tomorrow 11:00 · Budget review')).toBe(
      'Coming up this week: Tomorrow 11:00, Budget review',
    );
  });

  it('says why when it can’t hear: assist off, or a recording it couldn’t make out', async () => {
    const monaCai = await caiChat(mona);
    const off = await speakTo(mona, monaCai);
    expect(off.kind).toBe('text');
    expect(off.body).toBe(
      'I hear voice notes with AI assist on: Settings, then AI assist. Or write it to me.',
    );
    const cai = await caiChat(hassan);
    heardReplies.push({ status: 400, json: { error: { message: 'unreadable' } } });
    const unclear = await speakTo(hassan, cai);
    expect(unclear.kind).toBe('text');
    expect(unclear.body).toBe('I couldn’t make that one out. Try again, or write it to me.');
  });

  it('is never silent where nothing hears voice notes', async () => {
    const plain = await createTestApp();
    try {
      const sami = await signup(plain, { displayName: 'Sami Voice' });
      const cai = (await sami.post('/v1/conversations', { kind: 'direct', userId: CAI_ID }))
        .conversation.id as string;
      const boundary = `----caime${uuidv4()}`;
      const res = await plain.app.inject({
        method: 'POST',
        url: '/v1/files?durationMs=500',
        payload: Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
          ),
          wav(),
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          authorization: `Bearer ${sami.token}`,
        },
      });
      await sami.post(`/v1/conversations/${cai}/messages`, {
        clientId: uuidv4(),
        kind: 'voice',
        fileIds: [res.json().file.id],
      });
      await plain.ctx.flush();
      plain.clock.advance(1000);
      await runDueJobs(plain.ctx);
      await plain.ctx.flush();
      const reply = ((await sami.get(`/v1/conversations/${cai}/messages`)).messages as any[]).at(
        -1,
      );
      expect(reply.body).toBe(
        'I can’t hear voice notes here yet. Write it to me, and I’ll answer.',
      );
    } finally {
      await plain.close();
    }
  });
});
