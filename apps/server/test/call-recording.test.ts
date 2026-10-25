/**
 * Cai records a call (R114 (4), M17 I13b): Record asked as itself, a yes counting only for the
 * ask it was shown; only the recorder's browser sends parts, in pieces at their offset, nothing
 * after a no and only the piece that was on its way once the call ends; each part made seekable
 * without re-encoding and played by byte ranges by whoever was in the call when it began; deleted
 * for everyone by anyone in it, at its day, or with the call's line.
 */
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { PERSON_ALLOWANCES, uuidv7 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sweepRecordings } from '../src/lib/call-recording';
import { removeStored } from '../src/lib/files';
import { runDueJobs } from '../src/lib/jobs';
import { dropErasedFiles, eraseMessagesWhere } from '../src/lib/org-data';
import { storageFor } from '../src/lib/storage';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

const voice = readFileSync(join(__dirname, 'fixtures', 'voice-2s.webm'));
const screen = readFileSync(join(__dirname, 'fixtures', 'screen-3s.webm'));

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

const piece = (
  c: Client,
  callId: string,
  partId: string,
  deviceId: string,
  offset: number,
  bytes: Buffer,
) =>
  t.app.inject({
    method: 'PUT',
    url: `/v1/calls/${callId}/recording/parts/${partId}?deviceId=${deviceId}&offset=${offset}`,
    payload: bytes,
    headers: {
      'content-type': 'application/offset+octet-stream',
      authorization: `Bearer ${c.token}`,
    },
  });

/** A whole file sent as the recorder sends it: in pieces, each at the offset the last one left. */
async function sendAll(c: Client, callId: string, partId: string, deviceId: string, bytes: Buffer) {
  let offset = 0;
  for (const size of [Math.floor(bytes.length / 3), Math.floor(bytes.length / 3), bytes.length]) {
    const res = await piece(
      c,
      callId,
      partId,
      deviceId,
      offset,
      bytes.subarray(offset, offset + size),
    );
    expect(res.statusCode, res.body).toBe(200);
    offset = res.json().offset;
    if (offset >= bytes.length) break;
  }
  return offset;
}

const finish = (c: Client, callId: string, partId: string, deviceId: string) =>
  c.req('POST', `/v1/calls/${callId}/recording/parts/${partId}/finish?deviceId=${deviceId}`, {});

const recordingOf = async (c: Client, callId: string) =>
  (await c.req('GET', `/v1/calls/${callId}/notes`)).json().recording;

beforeAll(async () => {
  // The speech provider is set up, as Cai's notes need: nothing here is sent to it.
  stub = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ text: 'Hello.', language: 'en' }));
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  const { port } = stub.address() as AddressInfo;
  t = await createTestApp({
    SPEECH_PROVIDER: 'openai',
    SPEECH_API_KEY: 'test-speech-key',
    SPEECH_BASE_URL: `http://127.0.0.1:${port}`,
  });
  noor = await signup(t, { displayName: 'Noor Records' });
  sam = await signup(t, { displayName: 'Sam Records' });
  omar = await signup(t, { displayName: 'Omar Records' });
  noorSam = await connect(noor, sam);
  await connect(noor, omar);
  await connect(sam, omar);
  await noor.patch('/v1/me', { aiEnabled: true });
});
afterAll(async () => {
  await t.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

describe('asked as itself (R114 (1))', () => {
  it('a yes shown for notes alone never counts for a recording asked after it', async () => {
    const rung = await noor.req('POST', `/v1/conversations/${noorSam}/calls`, {
      kind: 'voice',
      deviceId: 'noor-tab-1',
    });
    const callId = rung.json().call.id as string;
    const notesOnly = (
      await noor.req('POST', `/v1/calls/${callId}/notes`, {
        deviceId: 'noor-tab-1',
        canRecord: true,
      })
    ).json().notes;
    expect(notesOnly).toMatchObject({ state: 'asking', records: false });
    // Another mode is asked once this one is stopped, never as a yes to it.
    const other = await noor.req('POST', `/v1/calls/${callId}/notes`, {
      deviceId: 'noor-tab-1',
      canRecord: true,
      records: true,
    });
    expect(other.statusCode).toBe(409);
    await noor.req('POST', `/v1/calls/${callId}/notes/stop`, {});
    const recording = (
      await noor.req('POST', `/v1/calls/${callId}/notes`, {
        deviceId: 'noor-tab-1',
        canRecord: true,
        records: true,
      })
    ).json().notes;
    expect(recording).toMatchObject({ state: 'asking', records: true });
    // Sam's ring still showed the first ask: their yes to it isn't one to the recording.
    const answered = await sam.req('POST', `/v1/calls/${callId}/accept`, {
      deviceId: 'sam-tab-1',
      notes: 'yes',
      notesId: notesOnly.id,
    });
    expect(answered.json().call.notes).toMatchObject({
      state: 'asking',
      records: true,
      waitingOn: [expect.objectContaining({ id: sam.user.id })],
    });
    // Asked again with what it is, their yes starts it.
    const yes = await sam.req('POST', `/v1/calls/${callId}/notes/answer`, {
      deviceId: 'sam-tab-1',
      answer: 'yes',
      notesId: recording.id,
    });
    expect(yes.json().notes).toMatchObject({
      state: 'on',
      records: true,
      recorderDevice: 'noor-tab-1',
    });
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
  });
});

describe('recorded in pieces, made seekable, played by who was in it (R114 (4))', () => {
  let callId: string;
  let voices: string;
  let shown: string;

  it('takes parts from the recorder’s browser alone, each piece at its offset', async () => {
    ({ callId } = await recordedCall());
    // Not the recorder.
    expect(
      (await startPart(sam, callId, { deviceId: 'sam-tab-1', kind: 'voices', mime: 'audio/webm' }))
        .statusCode,
    ).toBe(403);
    // A screen is a picture, and someone's in the call.
    expect(
      (
        await startPart(noor, callId, {
          deviceId: 'noor-tab-1',
          kind: 'screen',
          mime: 'video/webm',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await startPart(noor, callId, {
          deviceId: 'noor-tab-1',
          kind: 'screen',
          shownBy: sam.user.id,
          mime: 'audio/webm',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await startPart(noor, callId, {
          deviceId: 'noor-tab-1',
          kind: 'screen',
          shownBy: omar.user.id,
          mime: 'video/webm',
        })
      ).statusCode,
    ).toBe(403);
    voices = (
      await startPart(noor, callId, { deviceId: 'noor-tab-1', kind: 'voices', mime: 'audio/webm' })
    ).json().partId;
    shown = (
      await startPart(noor, callId, {
        deviceId: 'noor-tab-1',
        kind: 'screen',
        shownBy: sam.user.id,
        mime: 'video/webm',
      })
    ).json().partId;
    // A piece sent again, or out of turn, is told where to resume.
    const first = await piece(noor, callId, voices, 'noor-tab-1', 0, voice.subarray(0, 1000));
    expect(first.json()).toEqual({ offset: 1000 });
    const again = await piece(noor, callId, voices, 'noor-tab-1', 0, voice.subarray(0, 1000));
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toMatchObject({
      code: 'offset_mismatch',
      details: { offset: 1000 },
    });
    // Nobody else sends to it.
    expect(
      (await piece(sam, callId, voices, 'sam-tab-1', 1000, voice.subarray(1000))).statusCode,
    ).toBe(403);
    expect(
      (await piece(noor, callId, voices, 'noor-tab-1', 1000, voice.subarray(1000))).json(),
    ).toEqual({
      offset: voice.length,
    });
    // Both read it as being recorded, with nothing to play yet.
    const view = await recordingOf(sam, callId);
    expect(view).toMatchObject({ state: 'recording' });
    expect(view.parts.map((p: { state: string; url: string | null }) => [p.state, p.url])).toEqual([
      ['recording', null],
      ['recording', null],
    ]);
    expect(new Date(view.until).getTime()).toBe(t.clock.now.getTime() + 30 * 86_400_000);
  });

  it('a part ended is copied into an MP4 without re-encoding, played by byte ranges', async () => {
    expect((await finish(noor, callId, voices, 'noor-tab-1')).statusCode).toBe(200);
    await work();
    const part = (await recordingOf(sam, callId)).parts.find(
      (p: { id: string }) => p.id === voices,
    );
    expect(part).toMatchObject({ kind: 'voices', state: 'ready', mime: 'audio/mp4' });
    expect(part.durationMs).toBeGreaterThan(1500);
    expect(part.durationMs).toBeLessThan(2500);
    const whole = await sam.req('GET', part.url);
    expect(whole.statusCode).toBe(200);
    expect(whole.headers['content-type']).toBe('audio/mp4');
    expect(whole.rawPayload.subarray(4, 8).toString('latin1')).toBe('ftyp');
    expect(whole.rawPayload.length).toBe(part.bytes);
    const range = await t.app.inject({
      method: 'GET',
      url: part.url,
      headers: { authorization: `Bearer ${sam.token}`, range: 'bytes=0-99' },
    });
    expect(range.statusCode).toBe(206);
    expect(range.headers['content-range']).toBe(`bytes 0-99/${part.bytes}`);
    // Never for someone who wasn't in the call.
    expect((await omar.req('GET', part.url)).statusCode).toBe(404);
    expect((await omar.req('GET', `/v1/calls/${callId}/notes`)).statusCode).toBe(404);
  });

  it('the piece on its way as the call ends still lands; then the part is finished as it is', async () => {
    const half = Math.floor(screen.length / 2);
    expect(
      (await piece(noor, callId, shown, 'noor-tab-1', 0, screen.subarray(0, half))).statusCode,
    ).toBe(200);
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    // The last piece, on its way as it ended.
    t.clock.advance(5_000);
    expect(
      (await piece(noor, callId, shown, 'noor-tab-1', half, screen.subarray(half))).json(),
    ).toEqual({ offset: screen.length });
    // A minute on, nothing more lands, and the part is finished with what it had.
    t.clock.advance(70_000);
    expect((await piece(noor, callId, shown, 'noor-tab-1', screen.length, voice)).statusCode).toBe(
      403,
    );
    await work();
    const view = await recordingOf(noor, callId);
    expect(view.state).toBe('recorded');
    expect(view.parts.find((p: { id: string }) => p.id === shown)).toMatchObject({
      kind: 'screen',
      state: 'ready',
      mime: 'video/mp4',
      shownBy: expect.objectContaining({ id: sam.user.id, displayName: 'Sam Records' }),
    });
    // The export lists what each of them may play, never its bytes.
    const exported = (await sam.req('GET', '/v1/me/export')).json();
    expect(exported.callRecordings.map((r: { kind: string }) => r.kind)).toEqual([
      'voices',
      'screen',
    ]);
  });

  it('anyone in it deletes it for everyone, bytes and all; the call stays', async () => {
    const keys = (
      await t.ctx.db
        .selectFrom('call_recording_parts')
        .select('storage_key')
        .where('call_id', '=', callId)
        .execute()
    ).map((p) => p.storage_key);
    const storage = storageFor(t.ctx.config);
    for (const key of keys) expect(await storage.size(key)).toBeGreaterThan(0);
    const url = (await recordingOf(noor, callId)).parts[0].url;
    expect((await omar.req('DELETE', `/v1/calls/${callId}/recording`)).statusCode).toBe(404);
    expect((await sam.req('DELETE', `/v1/calls/${callId}/recording`)).statusCode).toBe(200);
    for (const key of keys) expect(await storage.size(key)).toBeNull();
    expect(await recordingOf(noor, callId)).toEqual({
      state: 'deleted',
      until: null,
      keptBy: null,
      mayKeep: false,
      parts: [],
    });
    expect((await noor.req('GET', url)).statusCode).toBe(404);
  });
});

describe('never after a no', () => {
  it('a Stop ends what may land at once: the piece on its way is refused', async () => {
    const { callId } = await recordedCall();
    const partId = (
      await startPart(noor, callId, { deviceId: 'noor-tab-1', kind: 'voices', mime: 'audio/webm' })
    ).json().partId;
    expect(
      (await piece(noor, callId, partId, 'noor-tab-1', 0, voice.subarray(0, 500))).statusCode,
    ).toBe(200);
    await sam.req('POST', `/v1/calls/${callId}/notes/stop`, {});
    expect(
      (await piece(noor, callId, partId, 'noor-tab-1', 500, voice.subarray(500))).statusCode,
    ).toBe(403);
    // Nor a new part.
    expect(
      (
        await startPart(noor, callId, {
          deviceId: 'noor-tab-1',
          kind: 'voices',
          mime: 'audio/webm',
        })
      ).statusCode,
    ).toBe(403);
    // What was taken before the no is finished as it was (unreadable here: half a header).
    t.clock.advance(70_000);
    await work();
    expect((await recordingOf(noor, callId)).parts).toEqual([
      expect.objectContaining({ id: partId, state: 'failed', url: null }),
    ]);
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
  });
});

describe('in a group call (R85 (2))', () => {
  it('whoever joins later plays only what was recorded after they joined', async () => {
    const trip = (
      await noor.post('/v1/conversations', {
        kind: 'group',
        title: 'Recorded trip',
        memberIds: [sam.user.id, omar.user.id],
      })
    ).conversation.id as string;
    const started = await noor.req('POST', `/v1/conversations/${trip}/group-calls`, {
      kind: 'voice',
      deviceId: 'noor-tab-1',
    });
    const callId = started.json().call.id as string;
    await sam.req('POST', `/v1/group-calls/${callId}/join`, { deviceId: 'sam-tab-1' });
    const notesId = (
      await noor.req('POST', `/v1/calls/${callId}/notes`, {
        deviceId: 'noor-tab-1',
        canRecord: true,
        records: true,
      })
    ).json().notes.id;
    await sam.req('POST', `/v1/calls/${callId}/notes/answer`, {
      deviceId: 'sam-tab-1',
      answer: 'yes',
      notesId,
    });
    const before = (
      await startPart(noor, callId, { deviceId: 'noor-tab-1', kind: 'voices', mime: 'audio/webm' })
    ).json().partId;
    await sendAll(noor, callId, before, 'noor-tab-1', voice);
    t.clock.advance(60_000);
    // Omar joins with Cai recording: the recorder begins a new part for the voices from now.
    const joined = await omar.req('POST', `/v1/group-calls/${callId}/join`, {
      deviceId: 'omar-tab-1',
      notes: 'yes',
      notesId,
    });
    expect(joined.json().call.notes).toMatchObject({ state: 'on', records: true });
    await finish(noor, callId, before, 'noor-tab-1');
    t.clock.advance(1_000);
    const after = (
      await startPart(noor, callId, { deviceId: 'noor-tab-1', kind: 'voices', mime: 'audio/webm' })
    ).json().partId;
    await sendAll(noor, callId, after, 'noor-tab-1', voice);
    await finish(noor, callId, after, 'noor-tab-1');
    await work();
    const ids = (r: { parts: Array<{ id: string }> }) => r.parts.map((p) => p.id);
    expect(ids(await recordingOf(sam, callId))).toEqual([before, after]);
    expect(ids(await recordingOf(omar, callId))).toEqual([after]);
    const first = (await recordingOf(sam, callId)).parts[0].url;
    expect((await omar.req('GET', first)).statusCode).toBe(404);
    for (const [c, d] of [
      [sam, 'sam-tab-1'],
      [omar, 'omar-tab-1'],
      [noor, 'noor-tab-1'],
    ] as const)
      await c.req('POST', `/v1/group-calls/${callId}/leave`, { deviceId: d });
  });
});

describe('kept thirty days, and gone with the call’s line (R114 (6))', () => {
  it('goes for everyone at its day; the notes stay', async () => {
    const { callId } = await recordedCall();
    const partId = (
      await startPart(noor, callId, { deviceId: 'noor-tab-1', kind: 'voices', mime: 'audio/webm' })
    ).json().partId;
    await sendAll(noor, callId, partId, 'noor-tab-1', voice);
    await finish(noor, callId, partId, 'noor-tab-1');
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    await work();
    const key = (
      await t.ctx.db
        .selectFrom('call_recording_parts')
        .select('storage_key')
        .where('id', '=', partId)
        .executeTakeFirstOrThrow()
    ).storage_key;
    t.clock.advance(29 * 86_400_000);
    await sweepRecordings(t.ctx);
    expect((await recordingOf(sam, callId)).state).toBe('recorded');
    t.clock.advance(2 * 86_400_000);
    await sweepRecordings(t.ctx);
    expect((await recordingOf(sam, callId)).state).toBe('deleted');
    expect(await storageFor(t.ctx.config).size(key)).toBeNull();
    expect((await sam.req('GET', `/v1/calls/${callId}/notes`)).statusCode).toBe(200);
  });

  it('erasing the call’s line takes its recording, bytes and all', async () => {
    const { callId } = await recordedCall();
    const partId = (
      await startPart(noor, callId, { deviceId: 'noor-tab-1', kind: 'voices', mime: 'audio/webm' })
    ).json().partId;
    await sendAll(noor, callId, partId, 'noor-tab-1', voice);
    await finish(noor, callId, partId, 'noor-tab-1');
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    await work();
    const key = (
      await t.ctx.db
        .selectFrom('call_recording_parts')
        .select('storage_key')
        .where('id', '=', partId)
        .executeTakeFirstOrThrow()
    ).storage_key;
    const page = await sam.get(`/v1/conversations/${noorSam}/messages`);
    const callLine = (
      page.messages as Array<{ id: string; kind: string; payload: { callId?: string } }>
    ).find((m) => m.kind === 'system' && m.payload.callId === callId);
    expect(callLine).toBeDefined();
    const storage = storageFor(t.ctx.config);
    const stored = await t.ctx.db.transaction().execute(async (trx) => {
      const rows = await eraseMessagesWhere(
        trx,
        sql`select ${callLine?.id}::uuid as id`,
        t.ctx.now(),
      );
      return dropErasedFiles(trx, rows);
    });
    await removeStored(t.ctx, storage, stored, 'test');
    expect(await storage.size(key)).toBeNull();
    expect(
      await t.ctx.db
        .selectFrom('call_recording_parts')
        .select('id')
        .where('call_id', '=', callId)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it('whoever asked keeps it past its day, against their storage, and stops keeping it (M17 I13d)', async () => {
    const { callId } = await recordedCall();
    const partId = (
      await startPart(noor, callId, { deviceId: 'noor-tab-1', kind: 'voices', mime: 'audio/webm' })
    ).json().partId;
    await sendAll(noor, callId, partId, 'noor-tab-1', voice);
    // Not while it's being recorded: what's counted is all of it.
    expect((await noor.req('POST', `/v1/calls/${callId}/recording/keep`, {})).statusCode).toBe(409);
    await finish(noor, callId, partId, 'noor-tab-1');
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    await work();
    // Sam was in it, but didn't ask; Noor did.
    expect((await sam.req('POST', `/v1/calls/${callId}/recording/keep`, {})).statusCode).toBe(403);
    expect(await recordingOf(sam, callId)).toMatchObject({ keptBy: null, mayKeep: false });
    expect(await recordingOf(noor, callId)).toMatchObject({ keptBy: null, mayKeep: true });
    // Against Noor's storage: with no room, it isn't kept.
    const used = (await noor.get('/v1/me/plan')).used.storageBytes as number;
    const fileId = uuidv7();
    await t.ctx.db
      .insertInto('files')
      .values({
        id: fileId,
        owner_id: noor.user.id,
        storage_key: 'files/nearly-full',
        name: 'archive.mov',
        mime: 'video/quicktime',
        size: PERSON_ALLOWANCES.personal.storageBytes - used - 1,
        kind: 'video',
        status: 'ready',
      })
      .execute();
    const full = await noor.req('POST', `/v1/calls/${callId}/recording/keep`, {});
    expect(full.statusCode).toBe(403);
    expect(full.json().error.code).toBe('plan_limit');
    await t.ctx.db.deleteFrom('files').where('id', '=', fileId).execute();
    expect((await noor.req('POST', `/v1/calls/${callId}/recording/keep`, {})).statusCode).toBe(200);
    const kept = await recordingOf(noor, callId);
    expect(kept).toMatchObject({ until: null, keptBy: { id: noor.user.id }, mayKeep: true });
    const bytes = (kept.parts as Array<{ bytes: number }>).reduce((sum, p) => sum + p.bytes, 0);
    expect(bytes).toBeGreaterThan(0);
    expect((await noor.get('/v1/me/plan')).used.storageBytes).toBe(used + bytes);
    expect((await recordingOf(sam, callId)).keptBy.displayName).toBe('Noor Records');
    // The sweep leaves a kept one alone past its day.
    t.clock.advance(31 * 86_400_000);
    await sweepRecordings(t.ctx);
    expect((await recordingOf(sam, callId)).state).toBe('recorded');
    // Noor stops keeping it: its bytes leave their storage, and it goes at the next sweep.
    expect((await noor.req('DELETE', `/v1/calls/${callId}/recording/keep`)).statusCode).toBe(200);
    expect((await noor.get('/v1/me/plan')).used.storageBytes).toBe(used);
    expect((await recordingOf(noor, callId)).keptBy).toBeNull();
    t.clock.advance(60_000);
    await sweepRecordings(t.ctx);
    expect((await recordingOf(sam, callId)).state).toBe('deleted');
  });
});
