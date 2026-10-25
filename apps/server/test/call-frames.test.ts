/**
 * What was on a shared screen (R114 (1) and (4), M17 I13h): a frame of a shown screen lands under
 * its part from the recorder's browser alone, at the server's cadence, seen by whoever plays the
 * part; the write-up reads up to eight of them once, as lines from the screen, and cites them; and
 * they go with the recording and with the call's line.
 */
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { FRAME_MIN_MS, FRAMES_IN_NOTES, FRAMES_PER_PART_MAX } from '@caime/core';
import { sql } from 'kysely';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { framesToRead } from '../src/lib/call-frames';
import { removeStored } from '../src/lib/files';
import { runDueJobs } from '../src/lib/jobs';
import { dropErasedFiles, eraseMessagesWhere } from '../src/lib/org-data';
import { storageFor } from '../src/lib/storage';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const screen = readFileSync(join(__dirname, 'fixtures', 'screen-3s.webm'));

/** Every request the model was sent, as sent. */
const asked: Array<{ system: string; content: unknown }> = [];
/** What the model answers a frame with, and the write-up. */
const frameText = 'A slide titled Budget 2027 with a table of three rows.';
let notesJson: string | null = null;
let stub: Server;
let t: TestApp;
let noor: Client;
let sam: Client;
let omar: Client;
let noorSam: string;

async function connect(a: Client, b: Client): Promise<string> {
  const r = await a.post('/v1/connections/requests', { toUserId: b.user.id });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
}

const work = async () => {
  await t.ctx.flush();
  await runDueJobs(t.ctx);
};

/** A JPEG of a screen, `width` wide at 16:9: a flat colour with a bar across it. */
async function picture(width = 1600, colour = { r: 30, g: 60, b: 200 }): Promise<Buffer> {
  const height = Math.round((width * 9) / 16);
  return sharp({ create: { width, height, channels: 3, background: colour } })
    .composite([
      {
        input: await sharp({
          create: {
            width,
            height: Math.max(1, Math.round(height / 6)),
            channels: 3,
            background: { r: 240, g: 240, b: 240 },
          },
        })
          .png()
          .toBuffer(),
        top: Math.round(height / 3),
        left: 0,
      },
    ])
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** A 1:1 call from Noor to Sam, with Cai asked to record it before Sam answers. */
async function recordedCall(): Promise<{ callId: string; notesId: string }> {
  const rung = await noor.req('POST', `/v1/conversations/${noorSam}/calls`, {
    kind: 'voice',
    deviceId: 'noor-tab-1',
  });
  const callId = rung.json().call.id as string;
  const asked = await noor.req('POST', `/v1/calls/${callId}/notes`, {
    deviceId: 'noor-tab-1',
    canRecord: true,
    records: true,
  });
  expect(asked.statusCode, asked.body).toBe(200);
  const notesId = asked.json().notes.id as string;
  const answered = await sam.req('POST', `/v1/calls/${callId}/accept`, {
    deviceId: 'sam-tab-1',
    notes: 'yes',
    notesId,
  });
  expect(answered.json().call.notes).toMatchObject({ state: 'on', records: true });
  return { callId, notesId };
}

const startPart = (c: Client, callId: string, body: Record<string, unknown>) =>
  c.req('POST', `/v1/calls/${callId}/recording/parts`, { at: Date.now(), ...body });

/** A screen part begun by Noor's browser, with its first piece landed. */
async function screenPart(callId: string): Promise<string> {
  const partId = (
    await startPart(noor, callId, {
      deviceId: 'noor-tab-1',
      kind: 'screen',
      shownBy: noor.user.id,
      mime: 'video/webm',
    })
  ).json().partId as string;
  const res = await t.app.inject({
    method: 'PUT',
    url: `/v1/calls/${callId}/recording/parts/${partId}?deviceId=noor-tab-1&offset=0`,
    payload: screen,
    headers: {
      'content-type': 'application/offset+octet-stream',
      authorization: `Bearer ${noor.token}`,
    },
  });
  expect(res.statusCode, res.body).toBe(200);
  return partId;
}

const frame = (
  c: Client,
  callId: string,
  partId: string,
  deviceId: string,
  at: number,
  bytes: Buffer,
) =>
  t.app.inject({
    method: 'POST',
    url: `/v1/calls/${callId}/recording/parts/${partId}/frames?deviceId=${deviceId}&at=${at}`,
    payload: bytes,
    headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${c.token}` },
  });

const recordingOf = async (c: Client, callId: string) =>
  (await c.req('GET', `/v1/calls/${callId}/notes`)).json().recording;

/** One thing said, so the write-up has words beside the screen. */
async function line(callId: string, speakerId: string, at: number) {
  const boundary = `----caime-frames`;
  const samples = 16_000;
  const data = Buffer.alloc(samples * 2, 0);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="utterance.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
    ),
    header,
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await t.app.inject({
    method: 'POST',
    url: `/v1/calls/${callId}/notes/lines?deviceId=noor-tab-1&speakerId=${speakerId}&at=${at}`,
    payload,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${noor.token}`,
    },
  });
  expect(res.statusCode, res.body).toBe(200);
}

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');
    const model = (req.url ?? '').startsWith('/v1/messages');
    res.writeHead(200, { 'content-type': 'application/json' });
    if (!model)
      return res.end(JSON.stringify({ text: 'We agreed on the budget.', language: 'en' }));
    const { system, messages } = JSON.parse(body) as {
      system: string | Array<{ text: string }>;
      messages: Array<{ content: unknown }>;
    };
    const systemText = Array.isArray(system) ? system.map((b) => b.text).join('') : system;
    asked.push({ system: systemText, content: messages[0]?.content });
    const text = systemText.includes('screen someone shared')
      ? frameText
      : systemText.includes('notes of a call')
        ? (notesJson ?? '{}')
        : '{}';
    res.end(
      JSON.stringify({
        id: 'msg_stub',
        type: 'message',
        role: 'assistant',
        model: 'claude-test',
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const { port } = stub.address() as AddressInfo;
  t = await createTestApp({
    SPEECH_PROVIDER: 'openai',
    SPEECH_API_KEY: 'test-speech-key',
    SPEECH_BASE_URL: `http://127.0.0.1:${port}`,
    ANTHROPIC_API_KEY: 'test-key',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
  });
  noor = await signup(t, { displayName: 'Noor Frames' });
  sam = await signup(t, { displayName: 'Sam Frames' });
  omar = await signup(t, { displayName: 'Omar Frames' });
  noorSam = await connect(noor, sam);
  await connect(noor, omar);
  await noor.patch('/v1/me', { aiEnabled: true });
});
afterAll(async () => {
  await t.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

describe('which frames the write-up reads', () => {
  it('all of a few; of many, the first, the last and the rest spread evenly', () => {
    expect(framesToRead(0)).toEqual([]);
    expect(framesToRead(3)).toEqual([0, 1, 2]);
    expect(framesToRead(FRAMES_IN_NOTES)).toHaveLength(FRAMES_IN_NOTES);
    const picks = framesToRead(20);
    expect(picks).toHaveLength(FRAMES_IN_NOTES);
    expect(picks[0]).toBe(0);
    expect(picks.at(-1)).toBe(19);
    expect(picks).toEqual([...picks].sort((a, b) => a - b));
    expect(framesToRead(200, 4)).toEqual([0, 66, 133, 199]);
  });
});

describe('a frame of a shown screen (M17 I13h)', () => {
  it('lands under its part from the recorder alone, shrunk, at the server’s cadence, seen by who plays the part', async () => {
    const { callId } = await recordedCall();
    const partId = await screenPart(callId);
    const big = await picture(1600);
    // Not the recorder's device, nor another person.
    expect((await frame(noor, callId, partId, 'noor-tab-2', 0, big)).statusCode).toBe(403);
    expect((await frame(sam, callId, partId, 'sam-tab-1', 0, big)).statusCode).toBe(403);
    // Kept, at most 1280 wide, nothing of the device's encoding kept.
    const first = await frame(noor, callId, partId, 'noor-tab-1', 0, big);
    expect(first.statusCode, first.body).toBe(200);
    const frameId = first.json().frameId as string;
    expect(frameId).toBeTruthy();
    const row = await t.ctx.db
      .selectFrom('call_recording_frames')
      .select(['width', 'height', 'bytes', 'storage_key', 'read'])
      .where('id', '=', frameId)
      .executeTakeFirstOrThrow();
    expect(row.width).toBe(1280);
    expect(row.height).toBe(720);
    expect(row.read).toBeNull();
    expect(await storageFor(t.ctx.config).size(row.storage_key)).toBe(row.bytes);
    // Too soon after the last: not kept, not an error. Then kept again once FRAME_MIN_MS passed.
    const soon = await frame(noor, callId, partId, 'noor-tab-1', 2_000, big);
    expect(soon.statusCode).toBe(200);
    expect(soon.json().frameId).toBeNull();
    const later = await frame(noor, callId, partId, 'noor-tab-1', FRAME_MIN_MS, big);
    expect(later.json().frameId).toBeTruthy();
    // Not a picture: refused.
    expect(
      (await frame(noor, callId, partId, 'noor-tab-1', 20_000, Buffer.from('not a jpeg')))
        .statusCode,
    ).toBe(400);
    // Only a screen part has frames.
    const voices = (
      await startPart(noor, callId, { deviceId: 'noor-tab-1', kind: 'voices', mime: 'audio/webm' })
    ).json().partId;
    expect((await frame(noor, callId, voices, 'noor-tab-1', 0, big)).statusCode).toBe(400);
    // Seen by both who were in the call, with its moment and where its picture is; by nobody else.
    const view = await recordingOf(sam, callId);
    expect(view.frames).toHaveLength(2);
    expect(view.frames[0]).toMatchObject({
      id: frameId,
      partId,
      read: null,
      url: `/v1/calls/${callId}/recording/frames/${frameId}`,
    });
    expect(view.frames[0].shownBy.id).toBe(noor.user.id);
    const start = Date.parse(view.parts.find((p: { id: string }) => p.id === partId).startedAt);
    expect(Date.parse(view.frames[1].at) - start).toBe(FRAME_MIN_MS);
    const bytes = await sam.req('GET', view.frames[0].url);
    expect(bytes.statusCode).toBe(200);
    expect(bytes.headers['content-type']).toBe('image/jpeg');
    expect((await omar.req('GET', view.frames[0].url)).statusCode).toBe(404);
    expect((await omar.req('GET', `/v1/calls/${callId}/notes`)).statusCode).toBe(404);
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
  });

  it('holds a part to FRAMES_PER_PART_MAX whatever the device sends, and takes none after a no', async () => {
    const { callId } = await recordedCall();
    const partId = await screenPart(callId);
    const tiny = await picture(64);
    let kept = 0;
    for (let i = 0; i <= FRAMES_PER_PART_MAX; i++) {
      const r = await frame(noor, callId, partId, 'noor-tab-1', i * FRAME_MIN_MS, tiny);
      expect(r.statusCode, r.body).toBe(200);
      if (r.json().frameId) kept++;
    }
    expect(kept).toBe(FRAMES_PER_PART_MAX);
    await sam.req('POST', `/v1/calls/${callId}/notes/stop`, {});
    expect((await frame(noor, callId, partId, 'noor-tab-1', 999_000, tiny)).statusCode).toBe(403);
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
  });

  it('goes with the recording when it’s deleted, and with the call’s line when that’s erased', async () => {
    const storage = storageFor(t.ctx.config);
    const { callId } = await recordedCall();
    const partId = await screenPart(callId);
    const pic = await picture(640);
    const id = (await frame(noor, callId, partId, 'noor-tab-1', 0, pic)).json().frameId as string;
    const key = (
      await t.ctx.db
        .selectFrom('call_recording_frames')
        .select('storage_key')
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
    ).storage_key;
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    await work();
    expect((await recordingOf(noor, callId)).frames).toHaveLength(1);
    await sam.req('DELETE', `/v1/calls/${callId}/recording`);
    expect(await recordingOf(noor, callId)).toMatchObject({ state: 'deleted', frames: [] });
    expect(await storage.size(key)).toBeNull();
    expect(
      await t.ctx.db
        .selectFrom('call_recording_frames')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst(),
    ).toBeUndefined();

    // Erased with the call's line: the rows in the transaction, the bytes after it.
    const other = await recordedCall();
    const otherPart = await screenPart(other.callId);
    const otherId = (await frame(noor, other.callId, otherPart, 'noor-tab-1', 0, pic)).json()
      .frameId as string;
    const otherKey = (
      await t.ctx.db
        .selectFrom('call_recording_frames')
        .select('storage_key')
        .where('id', '=', otherId)
        .executeTakeFirstOrThrow()
    ).storage_key;
    await noor.req('POST', `/v1/calls/${other.callId}/end`, { deviceId: 'noor-tab-1' });
    await work();
    const page = await sam.get(`/v1/conversations/${noorSam}/messages`);
    const callLine = (
      page.messages as Array<{ id: string; kind: string; payload: { callId?: string } }>
    ).find((m) => m.kind === 'system' && m.payload.callId === other.callId);
    expect(callLine).toBeDefined();
    const stored = await t.ctx.db.transaction().execute(async (trx) => {
      const rows = await eraseMessagesWhere(
        trx,
        sql`select ${callLine?.id}::uuid as id`,
        t.ctx.now(),
      );
      return dropErasedFiles(trx, rows);
    });
    expect(stored.map((s) => s.storage_key)).toContain(otherKey);
    await removeStored(t.ctx, storage, stored, 'test');
    expect(await storage.size(otherKey)).toBeNull();
    expect(
      await t.ctx.db
        .selectFrom('call_recording_frames')
        .select('id')
        .where('call_id', '=', other.callId)
        .executeTakeFirst(),
    ).toBeUndefined();
  });
});

describe('read into the write-up (M17 I13h)', () => {
  it('reads up to FRAMES_IN_NOTES frames once, as lines from the screen the notes cite, and never twice', async () => {
    const { callId } = await recordedCall();
    const pic = await picture(640);
    // One thing said as the call begins, then a screen shown a second on with twenty frames five
    // seconds apart, then one more thing said: all on the server's clock (a moment ahead of it is
    // read as now).
    await line(callId, noor.user.id, t.ctx.now().getTime());
    await work();
    t.clock.advance(1_000);
    const partId = await screenPart(callId);
    for (let i = 0; i < 20; i++)
      expect(
        (await frame(noor, callId, partId, 'noor-tab-1', i * FRAME_MIN_MS, pic)).json().frameId,
      ).toBeTruthy();
    t.clock.advance(26 * FRAME_MIN_MS);
    await line(callId, sam.user.id, t.ctx.now().getTime());
    await work();
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    await t.ctx.flush();
    expect((await noor.get(`/v1/calls/${callId}/notes`)).summaryState).toBe('writing');
    asked.length = 0;
    // The write-up's lines: the words, and eight screen lines between them, in time order; the
    // model's topic rests on the second line, the first frame.
    notesJson = JSON.stringify({
      summary: 'The budget was agreed from the slides.',
      topics: [{ title: 'Budget 2027', line: 2, points: ['Three rows in the table.'] }],
      decisions: [{ text: 'The budget stands', line: 10 }],
      nextSteps: [{ who: 'Noor Frames', what: 'Send the slides', due: null, line: 2 }],
    });
    t.clock.advance(6_000);
    await work();
    const read = await noor.get(`/v1/calls/${callId}/notes`);
    expect(read.summaryState).toBe('written');
    const frameAsks = asked.filter((a) => a.system.includes('screen someone shared'));
    expect(frameAsks).toHaveLength(FRAMES_IN_NOTES);
    // Each frame goes as an image beside a text block, nothing else.
    const content = frameAsks[0]?.content as Array<{
      type: string;
      source?: { media_type: string };
    }>;
    expect(content.map((b) => b.type)).toEqual(['image', 'text']);
    expect(content[0]?.source?.media_type).toBe('image/jpeg');
    const notesAsk = asked.find((a) => a.system.includes('notes of a call'));
    const transcript = String((notesAsk?.content as string) ?? '');
    expect(transcript).toContain("Screen (Noor's): A slide titled Budget 2027");
    expect(transcript.match(/Screen \(Noor's\)/g)).toHaveLength(FRAMES_IN_NOTES);
    expect(transcript.match(/^\[(\d+)\]/gm)).toHaveLength(FRAMES_IN_NOTES + 2);
    // Kept as read, on the frames the write-up picked: the first and the last among them.
    const frames = read.recording.frames as Array<{ at: string; read: string | null }>;
    expect(frames).toHaveLength(20);
    expect(frames[0]?.read).toBe(frameText);
    expect(frames[19]?.read).toBe(frameText);
    expect(frames.filter((f) => f.read).length).toBe(FRAMES_IN_NOTES);
    // The topic opens the recording at the first frame's moment (M17 I13c), the decision at the
    // tenth line's: Sam's words after the screens.
    expect(read.summary.topics[0].at).toBe(frames[0]?.at);
    const said = read.lines as Array<{ at: string }>;
    expect(read.summary.decisions[0].at).toBe(said[said.length - 1]?.at);
    // The step is Noor's own, by the screen line it came from.
    const offered = await noor.get('/v1/suggestions');
    const step = (offered.suggestions as Array<{ title: string; rationale: string }>).find(
      (s) => s.title === 'Send the slides',
    );
    expect(step?.rationale).toContain('Your screen showed');
    // Written again (a line deleted): no frame is read twice.
    const mine = (read.lines as Array<{ id: string; mine: boolean }>).find((l) => l.mine);
    await noor.req('DELETE', `/v1/calls/${callId}/notes/lines/${mine?.id}`);
    t.clock.advance(6_000);
    await work();
    expect((await noor.get(`/v1/calls/${callId}/notes`)).summaryState).toBe('written');
    expect(asked.filter((a) => a.system.includes('screen someone shared'))).toHaveLength(
      FRAMES_IN_NOTES,
    );
    // The export lists the frames kept of the screen, once the part is ready to play (a minute
    // after the call, when a late piece may no longer land).
    t.clock.advance(70_000);
    await work();
    const exported = await noor.get('/v1/me/export');
    expect(
      (exported.callRecordings as Array<{ kind: string; screenFrames: number }>).find(
        (r) => r.kind === 'screen' && r.screenFrames === 20,
      ),
    ).toBeDefined();
    notesJson = null;
  });
});
