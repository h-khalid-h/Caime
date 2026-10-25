/**
 * Cai joins in a call (R114 (3), M17 I13g): asked with the notes as "Answer, Cai joins in", it
 * introduces itself aloud once everyone said yes, answers a line that calls it by name from the
 * notes on the light model, says what's one person's own to them in writing alone, keeps what
 * it's asked to keep and says so, drops a microphone's echo of its own words, and serves the
 * sound of what it said to the recorder's device alone; everything counted on the asker's
 * allowance, the sound swept after an hour, the words kept as Cai's lines in the notes. Asked
 * about the screen (M17 I13h), it looks at the recorder's picture of it first, answers once, and
 * says when it can't see one.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv4 } from '@caime/core';
import { CAI_ID } from '@caime/core/system-ids';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { FRAME_WAIT_MS } from '../src/lib/cai-interact';
import { runDueJobs, runPeriodic } from '../src/lib/jobs';
import { storageFor } from '../src/lib/storage';
import { type Client, createTestApp, signup, type TestApp, until } from './helpers';

/** What the speech stand-in hears, in turn. */
const replies: Array<{ status: number; json: unknown }> = [];
/** What the model answers, in turn; every request as sent. */
const said: Array<{ status: number; json: unknown }> = [];
const asked: string[] = [];
/** What the voice stand-in was asked to say, in turn, and what it was asked to forget. */
const spoken: Array<{ text: string; language_code?: string }> = [];
const forgotten: string[] = [];
const modelSays = (text: string) =>
  said.push({
    status: 200,
    json: {
      id: 'msg_stub',
      type: 'message',
      role: 'assistant',
      model: 'claude-test',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  });
let stub: Server;
let t: TestApp;
let noor: Client;
let sam: Client;
let noorSam: string;

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}

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

/** One thing said, sent as the recorder sends it, at the test clock's time. */
async function line(callId: string, speakerId: string, at = t.clock.now.getTime()) {
  const boundary = `----caime${uuidv4()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="utterance.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
    ),
    wav(),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return t.app.inject({
    method: 'POST',
    url: `/v1/calls/${callId}/notes/lines?deviceId=noor-tab-1&speakerId=${speakerId}&at=${at}`,
    payload,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${noor.token}`,
    },
  });
}

/** Heard by the stand-in as these words, then whatever follows (a call to Cai answered). */
async function heard(callId: string, speakerId: string, text: string, at?: number) {
  replies.push({ status: 200, json: { text, language: 'en' } });
  expect((await line(callId, speakerId, at)).statusCode).toBe(200);
  // The line is heard in one job, Cai's answer in the next.
  await work();
  await work();
}

const work = async () => {
  await t.ctx.flush();
  await runDueJobs(t.ctx);
};

const events: BusMessage[] = [];
const spokenEvents = () => events.filter((m) => m.event.type === 'call.cai');
const writtenEvents = () => events.filter((m) => m.event.type === 'call.cai.written');
const frameAsks = () => events.filter((m) => m.event.type === 'call.cai.frame');

/** The recorder's picture of the screen, for the line Cai asked about it for (M17 I13h). */
const caiFrame = (callId: string, deviceId: string, lineId: string, bytes: Buffer) =>
  t.app.inject({
    method: 'POST',
    url: `/v1/calls/${callId}/cai/frame?deviceId=${deviceId}&lineId=${lineId}`,
    payload: bytes,
    headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${noor.token}` },
  });

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const url = req.url ?? '';
    const body = Buffer.concat(chunks).toString('utf8');
    if (url.startsWith('/v1/text-to-speech/')) {
      const json = JSON.parse(body) as { text: string; language_code?: string };
      spoken.push({ text: json.text, language_code: json.language_code });
      res.writeHead(200, {
        'content-type': 'audio/mpeg',
        'history-item-id': `hist-${spoken.length}`,
      });
      res.end(wav(0.3));
      return;
    }
    if (url.startsWith('/v1/history/') && req.method === 'DELETE') {
      forgotten.push(url.slice('/v1/history/'.length));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"status":"ok"}');
      return;
    }
    if (url.startsWith('/v1/voices/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    const model = url.startsWith('/v1/messages');
    if (model) asked.push(body);
    const r = model
      ? (said.shift() ?? { status: 500, json: { type: 'error', error: { type: 'api_error' } } })
      : (replies.shift() ?? {
          status: 200,
          json: { text: 'Hello from the call.', language: 'en' },
        });
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.json));
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const { port } = stub.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  t = await createTestApp({
    SPEECH_PROVIDER: 'openai',
    SPEECH_API_KEY: 'test-speech-key',
    SPEECH_BASE_URL: base,
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: base,
    TTS_PROVIDER: 'elevenlabs',
    TTS_API_KEY: 'test-voice-key',
    TTS_VOICE_ID: 'voice-1',
    TTS_BASE_URL: base,
  });
  t.ctx.bus.subscribe((m) => {
    if (
      m.event.type === 'call.cai' ||
      m.event.type === 'call.cai.written' ||
      m.event.type === 'call.cai.frame'
    )
      events.push(m);
  });
  noor = await signup(t, { displayName: 'Noor Voice' });
  sam = await signup(t, { displayName: 'Sam Voice' });
  noorSam = await connect(noor, sam);
  await noor.patch('/v1/me', { aiEnabled: true });
  await sam.patch('/v1/me', { aiEnabled: true });
});
afterAll(async () => {
  await t.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

describe('Cai joins in a call (R114 (3), M17 I13g)', () => {
  let callId: string;
  let utteranceId: string;

  it('asked as the third mode and agreed, Cai introduces itself aloud once', async () => {
    const rung = await noor.req('POST', `/v1/conversations/${noorSam}/calls`, {
      kind: 'voice',
      deviceId: 'noor-tab-1',
    });
    expect(rung.statusCode).toBe(201);
    callId = rung.json().call.id;
    const askedRes = await noor.req('POST', `/v1/calls/${callId}/notes`, {
      deviceId: 'noor-tab-1',
      canRecord: true,
      interacts: true,
    });
    expect(askedRes.statusCode).toBe(200);
    expect(askedRes.json().notes).toMatchObject({
      state: 'asking',
      interacts: true,
      records: false,
    });
    const answered = await sam.req('POST', `/v1/calls/${callId}/accept`, {
      deviceId: 'sam-phone-1',
      notes: 'yes',
      canRecord: false,
    });
    expect(answered.statusCode).toBe(200);
    expect(answered.json().call.notes).toMatchObject({
      state: 'on',
      interacts: true,
      recorderDevice: 'noor-tab-1',
    });
    await work();
    await until(() => spoken.length >= 1, 5_000, 'the introduction spoken');
    expect(spoken[0]!.text).toContain('Cai');
    expect(spoken[0]!.language_code).toBe('en');
    // Told to both; the words are in the notes as Cai's own line.
    await until(() => spokenEvents().length >= 1, 5_000, 'the introduction told');
    const told = spokenEvents()[0]!;
    expect([...told.userIds].sort()).toEqual([noor.user.id, sam.user.id].sort());
    const data = told.event.data as { callId: string; utteranceId: string; text: string };
    expect(data.callId).toBe(callId);
    expect(data.text).toBe(spoken[0]!.text);
    utteranceId = data.utteranceId;
    const notes = await sam.get(`/v1/calls/${callId}/notes`);
    expect(notes.lines).toHaveLength(1);
    expect(notes.lines[0]).toMatchObject({
      speaker: expect.objectContaining({ id: CAI_ID }),
      text: spoken[0]!.text,
      mine: false,
    });
    // Once: the jobs run again say nothing more.
    await work();
    expect(spoken).toHaveLength(1);
  });

  it('serves the sound to the recorder’s device alone', async () => {
    const mine = await t.app.inject({
      method: 'GET',
      url: `/v1/calls/${callId}/cai/${utteranceId}?deviceId=noor-tab-1`,
      headers: { authorization: `Bearer ${noor.token}` },
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.headers['content-type']).toBe('audio/mpeg');
    expect(mine.rawPayload.length).toBeGreaterThan(40);
    const otherDevice = await t.app.inject({
      method: 'GET',
      url: `/v1/calls/${callId}/cai/${utteranceId}?deviceId=noor-tab-2`,
      headers: { authorization: `Bearer ${noor.token}` },
    });
    expect(otherDevice.statusCode).toBe(403);
    const sams = await t.app.inject({
      method: 'GET',
      url: `/v1/calls/${callId}/cai/${utteranceId}?deviceId=sam-phone-1`,
      headers: { authorization: `Bearer ${sam.token}` },
    });
    expect(sams.statusCode).toBe(403);
  });

  it('answers a line that calls it by name, aloud, from the notes on the light model', async () => {
    // Something said that isn't for Cai: heard, nothing answered.
    await heard(callId, sam.user.id, 'We agreed on four hundred for the venue.');
    expect(spoken).toHaveLength(1);
    expect(asked).toHaveLength(0);
    modelSays(
      JSON.stringify({ answer: 'You agreed on four hundred for the venue.', sources: [2] }),
    );
    await heard(callId, noor.user.id, 'Cai, what did we decide on the price?');
    await until(() => spoken.length >= 2, 5_000, 'the answer spoken');
    expect(spoken[1]!.text).toBe('You agreed on four hundred for the venue.');
    // The model read the notes as Cai in the call, and the question without the name.
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('four hundred');
    expect(asked[0]).toContain('what did we decide on the price?');
    expect(asked[0]).toContain('joined a call');
    // Counted on the asker's allowance: the model's call, and the voice by its characters.
    const runs = await t.ctx.db
      .selectFrom('ai_runs')
      .select(['feature', 'provider', 'user_id', 'input_tokens', 'model'])
      .where('feature', 'in', ['interact', 'speak'])
      .orderBy('feature')
      .execute();
    expect(runs.filter((r) => r.feature === 'interact')).toHaveLength(1);
    expect(runs.find((r) => r.feature === 'interact')).toMatchObject({
      provider: 'anthropic',
      user_id: noor.user.id,
    });
    const speaks = runs.filter((r) => r.feature === 'speak');
    expect(speaks).toHaveLength(2);
    expect(speaks[1]).toMatchObject({
      provider: 'elevenlabs',
      user_id: noor.user.id,
      model: 'eleven_flash_v2_5',
      input_tokens: 'You agreed on four hundred for the venue.'.length,
    });
    // Everyone was told; Cai's answer is in the notes after the question.
    const notes = await sam.get(`/v1/calls/${callId}/notes`);
    const texts = notes.lines.map((l: { text: string }) => l.text);
    expect(texts).toEqual([
      spoken[0]!.text,
      'We agreed on four hundred for the venue.',
      'Cai, what did we decide on the price?',
      'You agreed on four hundred for the venue.',
    ]);
    // What the voice provider kept of each exchange is forgotten.
    await work();
    await until(() => forgotten.length >= 2, 5_000, 'the voice forgotten');
    expect(forgotten).toEqual(expect.arrayContaining(['hist-1', 'hist-2']));
  });

  it('says what is one person’s own to them in writing alone', async () => {
    await heard(callId, sam.user.id, 'Cai, what am I waiting on?');
    await until(() => writtenEvents().length >= 1, 5_000, 'written to Sam');
    const written = writtenEvents()[0]!;
    expect(written.userIds).toEqual([sam.user.id]);
    expect((written.event.data as { text: string }).text).toContain('not waiting');
    // Aloud, only that it was written; the model wasn't asked.
    expect(spoken.at(-1)!.text).toBe('I’ve written that to you.');
    expect(asked).toHaveLength(1);
  });

  it('keeps what it’s asked to keep and says so', async () => {
    await heard(callId, sam.user.id, 'Cai, remind me to send the contract tomorrow');
    await until(() => writtenEvents().length >= 2, 5_000, 'the keep written to Sam');
    const written = writtenEvents()[1]!;
    expect(written.userIds).toEqual([sam.user.id]);
    expect((written.event.data as { open: string | null }).open).toBe('cai');
    expect(spoken.at(-1)!.text).toBe('Saved to your actions.');
    const task = await t.ctx.db
      .selectFrom('tasks')
      .select(['title', 'owner_id'])
      .where('owner_id', '=', sam.user.id)
      .executeTakeFirstOrThrow();
    expect(task.title.toLowerCase()).toContain('send the contract');
  });

  it('drops an echo of its own words heard through a microphone', async () => {
    const before = spoken.length;
    await heard(callId, sam.user.id, 'you agreed on four hundred for the venue');
    const dropped = await t.ctx.db
      .selectFrom('call_note_lines')
      .select(['state', 'body'])
      .orderBy('spoken_at', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow();
    expect(dropped).toMatchObject({ state: 'unheard', body: null });
    expect(spoken).toHaveLength(before);
  });

  it('asked about the screen, looks at the recorder’s picture of it before answering (M17 I13h)', async () => {
    const storage = storageFor(t.ctx.config);
    const picture = await sharp({
      create: { width: 640, height: 360, channels: 3, background: { r: 30, g: 60, b: 200 } },
    })
      .jpeg()
      .toBuffer();
    // The recorder's device is asked for a picture, to it alone, and nothing is answered yet.
    const before = spoken.length;
    await heard(callId, sam.user.id, "Cai, what's on the screen?");
    expect(frameAsks()).toHaveLength(1);
    const ask = frameAsks()[0]!;
    expect([...ask.userIds]).toEqual([noor.user.id]);
    expect(ask.event.data).toMatchObject({ callId, deviceId: 'noor-tab-1' });
    const { lineId } = ask.event.data as { lineId: string };
    expect(spoken).toHaveLength(before);
    // Not from the recorder's device.
    expect((await caiFrame(callId, 'sam-tab-1', lineId, picture)).statusCode).toBe(403);
    // The recorder's picture: the model is asked with it beside the notes, and Cai answers.
    modelSays(JSON.stringify({ answer: 'A slide titled Budget 2027.', sources: [] }));
    const sent = await caiFrame(callId, 'noor-tab-1', lineId, picture);
    expect(sent.statusCode, sent.body).toBe(200);
    expect(sent.json()).toEqual({ taken: true });
    await work();
    await until(() => spoken.length > before, 5_000, 'the screen answered');
    expect(spoken[before]!.text).toBe('A slide titled Budget 2027.');
    const req = JSON.parse(asked.at(-1)!) as {
      messages: Array<{ content: Array<{ type: string; source?: { media_type: string } }> }>;
    };
    expect(req.messages[0]!.content.map((b) => b.type)).toEqual(['image', 'text']);
    expect(req.messages[0]!.content[0]?.source?.media_type).toBe('image/jpeg');
    // The picture went with the answer; the wait, when its time comes, answers nothing more.
    expect(await storage.size(`cai/frames/${callId}/${lineId}.jpg`)).toBeNull();
    t.clock.advance(FRAME_WAIT_MS + 1_000);
    await work();
    expect(spoken).toHaveLength(before + 1);
    // A picture for a line answered already is let go.
    expect((await caiFrame(callId, 'noor-tab-1', lineId, picture)).json()).toEqual({
      taken: false,
    });
  });

  it('says it can’t see a screen when the recorder has none, or doesn’t answer in time', async () => {
    const before = spoken.length;
    const askedBefore = asked.length;
    await heard(callId, noor.user.id, 'Cai, what does this chart show?');
    const ask = frameAsks().at(-1)!.event.data as { lineId: string };
    expect(
      (
        await noor.req('POST', `/v1/calls/${callId}/cai/frame/none`, {
          deviceId: 'noor-tab-1',
          lineId: ask.lineId,
        })
      ).json(),
    ).toEqual({ taken: true });
    await work();
    await until(() => spoken.length > before, 5_000, 'no screen said');
    expect(spoken[before]!.text).toBe('I can’t see a screen right now.');
    // No model asked for it.
    expect(asked).toHaveLength(askedBefore);
    // Nothing from the device: the wait answers the same once FRAME_WAIT_MS has passed.
    await heard(callId, sam.user.id, 'Cai, can you read this slide?');
    expect(spoken).toHaveLength(before + 1);
    t.clock.advance(FRAME_WAIT_MS + 1_000);
    await work();
    await until(() => spoken.length > before + 1, 5_000, 'the wait answered');
    expect(spoken[before + 1]!.text).toBe('I can’t see a screen right now.');
    expect(asked).toHaveLength(askedBefore);
  });

  it('lets the sound go after an hour; Cai’s words stay in the notes', async () => {
    const kept = await t.ctx.db.selectFrom('call_cai_utterances').select('storage_key').execute();
    expect(kept.length).toBeGreaterThanOrEqual(3);
    const storage = storageFor(t.ctx.config);
    expect(await storage.size(kept[0]!.storage_key as string)).not.toBeNull();
    t.clock.advance(61 * 60_000);
    await runPeriodic(t.ctx);
    expect(await t.ctx.db.selectFrom('call_cai_utterances').select('id').execute()).toEqual([]);
    expect(await storage.size(kept[0]!.storage_key as string)).toBeNull();
    const notes = await noor.get(`/v1/calls/${callId}/notes`);
    expect(
      notes.lines.filter((l: { speaker: { id: string } }) => l.speaker.id === CAI_ID).length,
    ).toBeGreaterThanOrEqual(3);
  });
});
