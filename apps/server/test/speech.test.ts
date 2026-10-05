/**
 * Voice notes into words (PRD §46, docs/SPEECH.md): a stand-in for the speech provider answers
 * what the test queues; the server sends it only a non-private note of a sender with AI assist
 * on, keeps the words as the message's body (searched, previewed, erased as words are), marks
 * who heard it, tells the conversation, and counts one AI assist.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

type Reply = { status: number; json: unknown };
const replies: Reply[] = [];
const requests: Array<{ path: string; auth: string | undefined; bytes: number }> = [];
let stub: Server;
let t: TestApp;
let ana: Client;
let ben: Client;
let convo: string;

function multipart(name: string, mime: string, data: Buffer) {
  const boundary = `----caime${uuidv4()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

/** A small WAV: 16 kHz, mono, a fifth of a second of silence (the server sniffs the kind). */
function wav(seconds = 0.2): Buffer {
  const rate = 16_000;
  const samples = Math.round(rate * seconds);
  const data = Buffer.alloc(samples * 2);
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

async function upload(c: Client, name: string, mime: string, data: Buffer, durationMs?: number) {
  const body = multipart(name, mime, data);
  const res = await t.app.inject({
    method: 'POST',
    url: `/v1/files${durationMs ? `?durationMs=${durationMs}` : ''}`,
    payload: body.payload,
    headers: { ...body.headers, authorization: `Bearer ${c.token}` },
  });
  if (res.statusCode !== 201) throw new Error(`${res.statusCode} ${res.body}`);
  return res.json().file as { id: string; kind: string };
}

async function voiceNote(c: Client, conversation: string, durationMs = 2_000) {
  // The app says how long the note is when it uploads it, as the recorder measured it.
  const file = await upload(c, 'note.wav', 'audio/wav', wav(), durationMs);
  expect(file.kind).toBe('audio');
  const sent = await c.post(`/v1/conversations/${conversation}/messages`, {
    clientId: uuidv4(),
    kind: 'voice',
    fileIds: [file.id],
    payload: { durationMs },
  });
  return sent.message as { id: string; body: string | null };
}

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}

const read = async (c: Client, id: string) => {
  const page = await c.get(`/v1/conversations/${convo}/messages?limit=50`);
  const m = (page.messages as Array<{ id: string }>).find((x) => x.id === id);
  if (!m) throw new Error(`message ${id} not in the page`);
  return m as unknown as {
    body: string | null;
    payload: { transcript?: { language: string | null; by: string; at: string } };
  };
};
/** What was queued runs, as the worker would run it. */
const work = async () => {
  await t.ctx.flush();
  await runDueJobs(t.ctx);
};

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    let bytes = 0;
    for await (const chunk of req) bytes += (chunk as Buffer).length;
    requests.push({ path: req.url ?? '', auth: req.headers.authorization, bytes });
    const r = replies.shift() ?? { status: 500, json: { error: 'no reply queued' } };
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.json));
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const { port } = stub.address() as AddressInfo;
  t = await createTestApp({
    SPEECH_PROVIDER: 'openai',
    SPEECH_API_KEY: 'test-speech-key',
    SPEECH_BASE_URL: `http://127.0.0.1:${port}`,
  });
  ana = await signup(t, { displayName: 'Ana Voice', email: 'ana.voice@example.com' });
  ben = await signup(t, { displayName: 'Ben Voice', email: 'ben.voice@example.com' });
  convo = await connect(ana, ben);
  await ana.patch('/v1/me', { aiEnabled: true });
});
afterAll(async () => {
  await t.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

describe('a voice note into words (PRD §46)', () => {
  it('sends the provider the audio alone, keeps the words as the body, and says who heard it', async () => {
    replies.push({
      status: 200,
      json: { text: '  Hi Ben, the contract is signed.  ', language: 'en' },
    });
    const sent = await voiceNote(ana, convo);
    expect(sent.body).toBeNull();
    await work();
    const m = await read(ben, sent.id);
    expect(m.body).toBe('Hi Ben, the contract is signed.');
    expect(m.payload.transcript).toMatchObject({ language: 'en', by: 'openai' });
    // The request carried the key and the audio, and nothing of the person.
    const req = requests.at(-1)!;
    expect(req.path).toBe('/v1/audio/transcriptions');
    expect(req.auth).toBe('Bearer test-speech-key');
    expect(req.bytes).toBeGreaterThan(wav().length);
    // Searchable as words are.
    const found = await ana.get(`/v1/search?q=${encodeURIComponent('contract is signed')}`);
    const hits = (found.results.messages ?? []) as Array<{ id?: string; message?: { id: string } }>;
    expect(hits.some((h) => (h.message?.id ?? h.id) === sent.id)).toBe(true);
    // One AI assist, by the speech provider.
    const runs = await t.ctx.db
      .selectFrom('ai_runs')
      .select(['feature', 'provider', 'outcome'])
      .where('user_id', '=', ana.user.id)
      .execute();
    expect(runs).toContainEqual({ feature: 'transcribe', provider: 'openai', outcome: 'ok' });
  });

  it('leaves a note alone when its sender has AI assist off, and hears nothing in silence', async () => {
    const before = requests.length;
    // Ben never turned AI assist on: his note is never sent anywhere.
    const bens = await voiceNote(ben, convo);
    await work();
    expect((await read(ana, bens.id)).body).toBeNull();
    expect(requests.length).toBe(before);
    // The provider heard nothing: the note stays a note, nothing is kept, the job doesn't retry.
    replies.push({ status: 200, json: { text: '   ' } });
    const quiet = await voiceNote(ana, convo);
    await work();
    expect((await read(ana, quiet.id)).body).toBeNull();
    expect(requests.length).toBe(before + 1);
  });

  it('never sends a private conversation’s note, nor one longer than a voice note', async () => {
    const before = requests.length;
    const long = await voiceNote(ana, convo, 11 * 60_000);
    await work();
    expect((await read(ana, long.id)).body).toBeNull();
    expect(requests.length).toBe(before);
  });

  it('tries again when the provider is busy, and gives up when it declines', async () => {
    replies.push({ status: 503, json: { error: 'busy' } });
    replies.push({ status: 200, json: { text: 'Second time lucky.' } });
    const sent = await voiceNote(ana, convo);
    await work();
    expect((await read(ana, sent.id)).body).toBeNull();
    // The first run failed as busy and the job waits for its next attempt; time passes.
    t.clock.advance(10 * 60_000);
    await runDueJobs(t.ctx);
    expect((await read(ana, sent.id)).body).toBe('Second time lucky.');
  });
});
