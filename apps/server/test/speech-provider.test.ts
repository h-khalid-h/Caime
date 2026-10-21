/**
 * ElevenLabs' Scribe, production's speech provider (M17 F8a): a call's notes are heard clean
 * (`no_verbatim`, no fillers or false starts) while a voice note keeps its words as said, and what
 * the provider keeps of every transcript by default is deleted once the words are Caime's, by a
 * job that asks again when the provider is away.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Config } from '../src/config';
import { AiError } from '../src/lib/ai';
import { runDueJobs } from '../src/lib/jobs';
import { speechFor } from '../src/lib/speech';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

type Heard = { status: number; json: unknown };
/** What each transcription is answered, in turn; else words with an id. */
const answers: Heard[] = [];
/** What each delete is answered, in turn; else 200. */
const deletes: number[] = [];
/** The fields of each transcription asked (the file left out), and each id deleted. */
const asked: Array<Record<string, string>> = [];
const deleted: string[] = [];
let n = 0;
let stub: Server;
let base: string;
let t: TestApp;
let noor: Client;
let sam: Client;
let noorSam: string;

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const url = req.url ?? '';
    if (req.method === 'DELETE' && url.startsWith('/v1/speech-to-text/transcripts/')) {
      deleted.push(decodeURIComponent(url.slice('/v1/speech-to-text/transcripts/'.length)));
      const status = deletes.shift() ?? 200;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status === 200 ? { status: 'ok' } : { detail: 'no' }));
      return;
    }
    if (req.method === 'POST' && url === '/v1/speech-to-text') {
      const form = await new Request('http://stub/', {
        method: 'POST',
        headers: { 'content-type': String(req.headers['content-type']) },
        body: Buffer.concat(chunks),
      }).formData();
      const fields: Record<string, string> = {};
      for (const [k, v] of form.entries()) if (typeof v === 'string') fields[k] = v;
      asked.push(fields);
      const r = answers.shift() ?? {
        status: 200,
        json: { text: 'Hello from the call.', language_code: 'eng', transcription_id: `tr_${++n}` },
      };
      res.writeHead(r.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.json));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  t = await createTestApp({
    SPEECH_PROVIDER: 'elevenlabs',
    SPEECH_API_KEY: 'test-speech-key',
    SPEECH_BASE_URL: base,
  });
  noor = await signup(t, { displayName: 'Noor Scribe' });
  sam = await signup(t, { displayName: 'Sam Scribe' });
  const r = await noor.post('/v1/connections/requests', { toUserId: sam.user.id });
  noorSam = (await sam.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
  await noor.patch('/v1/me', { aiEnabled: true });
});
afterAll(async () => {
  await t.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

function wav(seconds = 1.2, rate = 16_000): Buffer {
  const samples = Math.round(rate * seconds);
  const data = Buffer.alloc(samples * 2, 0);
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

function multipart(name: string, data: Buffer) {
  const boundary = `----caime${uuidv4()}`;
  return {
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: audio/wav\r\n\r\n`,
      ),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

const work = async () => {
  await t.ctx.flush();
  await runDueJobs(t.ctx);
};

const scribe = () =>
  speechFor({
    SPEECH_PROVIDER: 'elevenlabs',
    SPEECH_API_KEY: 'test-speech-key',
    SPEECH_BASE_URL: base,
  } as Config)!;

describe('ElevenLabs’ Scribe (M17 F8a)', () => {
  it('hears clean words only when asked, and says what it kept', async () => {
    const speech = scribe();
    const input = { bytes: wav(), mime: 'audio/wav', name: 'a.wav', languageHints: [] };
    const clean = await speech.transcribe({ ...input, clean: true });
    expect(asked.at(-1)).toMatchObject({
      model_id: 'scribe_v2',
      tag_audio_events: 'false',
      no_verbatim: 'true',
    });
    expect(clean.value).toMatchObject({ text: 'Hello from the call.', language: 'eng' });
    expect(clean.value.ref).toMatch(/^tr_/);
    await speech.transcribe(input);
    expect(asked.at(-1)?.no_verbatim).toBeUndefined();
  });

  it('forgets a transcript with no words at once, and a delete of one already gone is done', async () => {
    const speech = scribe();
    answers.push({
      status: 200,
      json: { text: '', language_code: 'eng', transcription_id: 'tr_blank' },
    });
    await expect(
      speech.transcribe({ bytes: wav(), mime: 'audio/wav', name: 'a.wav', languageHints: [] }),
    ).rejects.toBeInstanceOf(AiError);
    expect(deleted).toContain('tr_blank');
    deletes.push(404);
    await expect(speech.forget('tr_gone')).resolves.toBeUndefined();
    deletes.push(500);
    await expect(speech.forget('tr_later')).rejects.toThrow(/500/);
  });

  it('a call’s notes are heard clean, and the provider’s copy of each is deleted', async () => {
    const ring = await noor.req('POST', `/v1/conversations/${noorSam}/calls`, {
      kind: 'voice',
      deviceId: 'noor-tab-1',
    });
    const callId = ring.json().call.id as string;
    expect(
      (
        await noor.req('POST', `/v1/calls/${callId}/notes`, {
          deviceId: 'noor-tab-1',
          canRecord: true,
        })
      ).statusCode,
    ).toBe(200);
    const answered = await sam.req('POST', `/v1/calls/${callId}/accept`, {
      deviceId: 'sam-phone-1',
      notes: 'yes',
      canRecord: false,
    });
    expect(answered.json().call.notes.state).toBe('on');
    const before = deleted.length;
    const body = multipart('utterance.wav', wav());
    const sent = await t.app.inject({
      method: 'POST',
      url: `/v1/calls/${callId}/notes/lines?deviceId=noor-tab-1&speakerId=${noor.user.id}&at=${Date.now()}`,
      payload: body.payload,
      headers: { ...body.headers, authorization: `Bearer ${noor.token}` },
    });
    expect(sent.statusCode, sent.body).toBe(200);
    await work();
    expect(asked.at(-1)?.no_verbatim).toBe('true');
    const notes = await noor.get(`/v1/calls/${callId}/notes`);
    expect(notes.lines.map((l: { text: string | null }) => l.text)).toEqual([
      'Hello from the call.',
    ]);
    // The delete is a job of its own: run, it reaches the provider once.
    await work();
    expect(deleted.length).toBe(before + 1);
    expect(deleted.at(-1)).toMatch(/^tr_/);
  });

  it('a voice note keeps its words as said, and its transcript is deleted there too, again if the provider was away', async () => {
    const upload = multipart('note.wav', wav(2));
    const file = await t.app.inject({
      method: 'POST',
      url: '/v1/files?durationMs=2000',
      payload: upload.payload,
      headers: { ...upload.headers, authorization: `Bearer ${noor.token}` },
    });
    expect(file.statusCode, file.body).toBe(201);
    answers.push({
      status: 200,
      json: {
        text: 'Uh, I will, I will send it.',
        language_code: 'eng',
        transcription_id: 'tr_note',
      },
    });
    deletes.push(503);
    await noor.post(`/v1/conversations/${noorSam}/messages`, {
      clientId: uuidv4(),
      kind: 'voice',
      fileIds: [file.json().file.id],
      payload: { durationMs: 2000 },
    });
    await work();
    expect(asked.at(-1)?.no_verbatim).toBeUndefined();
    // Away the first time: the job asks again, and the copy goes.
    await work();
    await t.ctx.db
      .updateTable('jobs')
      .set({ run_at: t.ctx.now() })
      .where('kind', '=', 'speech.forget')
      .where('done_at', 'is', null)
      .execute();
    await work();
    expect(deleted.filter((id) => id === 'tr_note')).toEqual(['tr_note', 'tr_note']);
  });
});
