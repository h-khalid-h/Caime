/**
 * Cai's notes in a call (M16 F7, R82 under R85): asked inside the call, on once everyone in it said
 * yes (a ring answered with Cai, a group call joined with Cai), stopped by anyone's no at any time;
 * never in a private conversation, with anyone under 18, or for someone with AI assist off. Only
 * the browser the server names records, only voices that said yes are kept, each heard by the
 * speech stand-in and its audio deleted; whoever was in the call reads it, deletes their own, and
 * the notes go with the call's line.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { runDueJobs } from '../src/lib/jobs';
import { eraseMessagesWhere } from '../src/lib/org-data';
import { type Client, createTestApp, signup, type TestApp, until } from './helpers';

const replies: Array<{ status: number; json: unknown }> = [];
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

/** Half a second or more of a WAV, which the server reads the length of (M16 G12). */
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

/** One thing said, sent as the recorder sends it. */
async function line(
  c: Client,
  callId: string,
  deviceId: string,
  speakerId: string,
  audio = wav(),
  at = Date.now(),
) {
  const boundary = `----caime${uuidv4()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="utterance.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
    ),
    audio,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return t.app.inject({
    method: 'POST',
    url: `/v1/calls/${callId}/notes/lines?deviceId=${deviceId}&speakerId=${speakerId}&at=${at}`,
    payload,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${c.token}`,
    },
  });
}

const work = async () => {
  await t.ctx.flush();
  await runDueJobs(t.ctx);
};

/** A 1:1 call from Noor to Sam, rung and not yet answered. */
async function ring(): Promise<string> {
  const res = await noor.req('POST', `/v1/conversations/${noorSam}/calls`, {
    kind: 'voice',
    deviceId: 'noor-tab-1',
  });
  expect(res.statusCode).toBe(201);
  return res.json().call.id;
}

const ask = (c: Client, id: string, deviceId: string, canRecord = true) =>
  c.req('POST', `/v1/calls/${id}/notes`, { deviceId, canRecord });

beforeAll(async () => {
  stub = createServer(async (req, res) => {
    for await (const _ of req) {
      // The audio is read and dropped; the queued words come back.
    }
    const r = replies.shift() ?? {
      status: 200,
      json: { text: 'Hello from the call.', language: 'en' },
    };
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
  noor = await signup(t, { displayName: 'Noor Notes' });
  sam = await signup(t, { displayName: 'Sam Notes' });
  omar = await signup(t, { displayName: 'Omar Notes' });
  noorSam = await connect(noor, sam);
  await connect(noor, omar);
  await connect(sam, omar);
  await noor.patch('/v1/me', { aiEnabled: true });
});
afterAll(async () => {
  await t.close();
  await new Promise<void>((done) => stub.close(() => done()));
});

describe('notes in a call between two (R85)', () => {
  let callId: string;

  it('asked while it rings, start when it’s answered with Cai, on the asker’s browser', async () => {
    callId = await ring();
    const told: BusMessage[] = [];
    const off = t.ctx.bus.subscribe((m) => {
      if (m.event.type === 'call.notes') told.push(m);
    });
    const asked = await ask(noor, callId, 'noor-tab-1');
    // The ask reaches the one asked at once, so their ring can ask with it (R85 (1)).
    await until(() => told.length > 0, 5_000, 'the ask told');
    off();
    expect([...told[0]!.userIds].sort()).toEqual([noor.user.id, sam.user.id].sort());
    expect((told[0]!.event.data as { notes: { state: string } }).notes.state).toBe('asking');
    expect(asked.statusCode).toBe(200);
    expect(asked.json().notes).toMatchObject({
      state: 'asking',
      askedBy: { id: noor.user.id, displayName: 'Noor Notes' },
      yes: [noor.user.id],
      waitingOn: [{ id: sam.user.id, displayName: 'Sam Notes' }],
      recorderDevice: null,
    });
    // The ring carries the ask, so Sam's screen offers "Answer, Cai takes notes" and "without".
    const ringing = await sam.get('/v1/calls/live');
    expect(ringing.call.notes.state).toBe('asking');
    const answered = await sam.req('POST', `/v1/calls/${callId}/accept`, {
      deviceId: 'sam-phone-1',
      notes: 'yes',
      canRecord: false,
    });
    expect(answered.statusCode).toBe(200);
    expect(answered.json().call.notes).toMatchObject({
      state: 'on',
      yes: [noor.user.id, sam.user.id],
      waitingOn: [],
      recorderDevice: 'noor-tab-1',
    });
  });

  it('keeps only what the recorder sends, hears it, and deletes the audio', async () => {
    // Sam's device isn't the recorder: refused.
    expect((await line(sam, callId, 'sam-phone-1', sam.user.id)).statusCode).toBe(403);
    // A device of Noor's that isn't the one recording: refused.
    expect((await line(noor, callId, 'noor-tab-2', sam.user.id)).statusCode).toBe(403);
    // Too short to hear: dropped, never sent to the provider.
    const short = await line(noor, callId, 'noor-tab-1', sam.user.id, wav(0.2));
    expect(short.statusCode).toBe(200);
    replies.push({ status: 200, json: { text: 'We agreed on Thursday.', language: 'en' } });
    const sent = await line(noor, callId, 'noor-tab-1', sam.user.id);
    expect(sent.statusCode).toBe(200);
    const kept = await t.ctx.db
      .selectFrom('call_note_lines')
      .select(['id', 'file_id', 'state'])
      .execute();
    expect(kept).toHaveLength(1);
    const fileId = kept[0]!.file_id as string;
    expect(fileId).toBeTruthy();
    await work();
    const after = await t.ctx.db
      .selectFrom('call_note_lines')
      .select(['body', 'state', 'file_id'])
      .executeTakeFirstOrThrow();
    expect(after).toMatchObject({ body: 'We agreed on Thursday.', state: 'heard', file_id: null });
    // The voice is gone: the file's row (and its bytes) with it (R85 (5)).
    expect(
      await t.ctx.db.selectFrom('files').select('id').where('id', '=', fileId).executeTakeFirst(),
    ).toBeUndefined();
    // Heard on the asker's allowance, by the speech provider, with its length (R107).
    const run = await t.ctx.db
      .selectFrom('ai_runs')
      .select(['user_id', 'feature', 'audio_ms'])
      .where('feature', '=', 'notes')
      .executeTakeFirstOrThrow();
    expect(run).toMatchObject({ user_id: noor.user.id, feature: 'notes' });
    expect(Number(run.audio_ms)).toBeGreaterThanOrEqual(1000);
  });

  it('reads the same to both, each may delete their own words', async () => {
    const forSam = await sam.get(`/v1/calls/${callId}/notes`);
    expect(forSam.lines).toEqual([
      expect.objectContaining({
        speaker: expect.objectContaining({ id: sam.user.id, displayName: 'Sam Notes' }),
        text: 'We agreed on Thursday.',
        mine: true,
      }),
    ]);
    const forNoor = await noor.get(`/v1/calls/${callId}/notes`);
    expect(forNoor.lines[0]).toMatchObject({ text: 'We agreed on Thursday.', mine: false });
    // Someone else's words aren't theirs to delete.
    const lineId = forSam.lines[0].id as string;
    expect((await noor.req('DELETE', `/v1/calls/${callId}/notes/lines/${lineId}`)).statusCode).toBe(
      404,
    );
    // Nobody outside the call reads them.
    expect((await omar.req('GET', `/v1/calls/${callId}/notes`)).statusCode).toBe(404);
  });

  it('stops for everyone at anyone’s Stop, and takes nothing more', async () => {
    const stopped = await sam.req('POST', `/v1/calls/${callId}/notes/stop`, {});
    expect(stopped.json().notes).toMatchObject({ state: 'stopped', why: 'stopped', yes: [] });
    // Who stopped it is said to nobody.
    expect(stopped.json().notes).not.toHaveProperty('stoppedBy');
    expect((await line(noor, callId, 'noor-tab-1', noor.user.id)).statusCode).toBe(403);
  });

  it('asked again, a no means it never starts', async () => {
    await ask(noor, callId, 'noor-tab-1');
    const no = await sam.req('POST', `/v1/calls/${callId}/notes/answer`, {
      deviceId: 'sam-phone-1',
      answer: 'no',
    });
    expect(no.json().notes).toMatchObject({ state: 'declined', why: 'declined', yes: [] });
  });

  it('go with the call’s line, which says so, and are erased with it', async () => {
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    const page = await sam.get(`/v1/conversations/${noorSam}/messages`);
    const callLine = (page.messages as any[]).find(
      (m) => m.kind === 'system' && m.payload.event === 'call' && m.payload.callId === callId,
    );
    expect(callLine.payload).toMatchObject({ callId, notes: true });
    // Still read once the call's over.
    expect((await sam.get(`/v1/calls/${callId}/notes`)).lines).toHaveLength(1);
    const exported = (await sam.req('GET', '/v1/me/export')).json();
    expect(exported.yourWordsInCallNotes).toEqual([
      expect.objectContaining({ conversationId: noorSam, text: 'We agreed on Thursday.' }),
    ]);
    expect(exported.callNotesAnswers.map((a: { answer: string }) => a.answer)).toEqual([
      'yes',
      'no',
    ]);
    // The line erased (disappearing, retention, an organization's erasure): the notes go with it.
    await t.ctx.db
      .transaction()
      .execute((trx) =>
        eraseMessagesWhere(trx, sql`select ${callLine.id}::uuid as id`, new Date()),
      );
    expect(
      await t.ctx.db
        .selectFrom('call_notes')
        .select('id')
        .where('call_id', '=', callId)
        .executeTakeFirst(),
    ).toBeUndefined();
    expect((await sam.req('GET', `/v1/calls/${callId}/notes`)).json().lines).toEqual([]);
  });
});

describe('who may ask (R52, R85)', () => {
  it('not with AI assist off, nor in a private conversation, nor with anyone under 18', async () => {
    const callId = await ring();
    await sam.req('POST', `/v1/calls/${callId}/accept`, { deviceId: 'sam-phone-1' });
    // Sam has AI assist off.
    const off = await ask(sam, callId, 'sam-phone-1');
    expect(off.statusCode).toBe(403);
    expect(off.json().error.code).toBe('ai_off');
    // Someone under 18 in it: refused, in words that name nobody.
    await t.ctx.db
      .updateTable('users')
      .set({ birth_date: '2012-01-01' })
      .where('id', '=', sam.user.id)
      .execute();
    const minor = await ask(noor, callId, 'noor-tab-1');
    expect(minor.statusCode).toBe(403);
    expect(minor.json().error.message).not.toContain('Sam');
    await t.ctx.db
      .updateTable('users')
      .set({ birth_date: '1990-01-01' })
      .where('id', '=', sam.user.id)
      .execute();
    // A private conversation: nothing in it reaches Caime.
    await t.ctx.db
      .updateTable('conversations')
      .set({ privacy_class: 'private' })
      .where('id', '=', noorSam)
      .execute();
    const sealed = await ask(noor, callId, 'noor-tab-1');
    expect(sealed.statusCode).toBe(403);
    expect(sealed.json().error.code).toBe('ai_private');
    await t.ctx.db
      .updateTable('conversations')
      .set({ privacy_class: 'standard' })
      .where('id', '=', noorSam)
      .execute();
    // Asked by both at once: one ask, two yeses.
    await sam.patch('/v1/me', { aiEnabled: true });
    const [a, b] = await Promise.all([
      ask(noor, callId, 'noor-tab-1', false),
      ask(sam, callId, 'sam-phone-1', true),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    const notes = (await noor.get('/v1/calls/live')).call.notes;
    // Noor's tab can't record; Sam's browser does.
    expect(notes).toMatchObject({ state: 'on', recorderDevice: 'sam-phone-1' });
    expect(
      await t.ctx.db
        .selectFrom('call_notes')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('call_id', '=', callId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ n: 1 });
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
  });

  it('a call where nobody can record says so, and never starts', async () => {
    const callId = await ring();
    await ask(noor, callId, 'noor-tab-1', false);
    const answered = await sam.req('POST', `/v1/calls/${callId}/accept`, {
      deviceId: 'sam-phone-1',
      notes: 'yes',
      canRecord: false,
    });
    expect(answered.json().call.notes).toMatchObject({ state: 'declined', why: 'no_recorder' });
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
  });
});

describe('notes in a group call (R85 (2))', () => {
  it('hand over when the recorder leaves, and stop for everyone at a join without Cai', async () => {
    const trip = (
      await noor.post('/v1/conversations', {
        kind: 'group',
        title: 'Notes trip',
        memberIds: [sam.user.id, omar.user.id],
      })
    ).conversation.id as string;
    const started = await noor.req('POST', `/v1/conversations/${trip}/group-calls`, {
      kind: 'voice',
      deviceId: 'noor-tab-1',
    });
    const callId = started.json().call.id as string;
    await sam.req('POST', `/v1/group-calls/${callId}/join`, { deviceId: 'sam-tab-1' });
    await omar.req('POST', `/v1/group-calls/${callId}/join`, { deviceId: 'omar-tab-1' });
    const asked = await ask(noor, callId, 'noor-tab-1');
    expect(
      asked
        .json()
        .notes.waitingOn.map((p: { id: string }) => p.id)
        .sort(),
    ).toEqual([sam.user.id, omar.user.id].sort());
    await sam.req('POST', `/v1/calls/${callId}/notes/answer`, {
      deviceId: 'sam-tab-1',
      answer: 'yes',
      canRecord: true,
    });
    const yes = await omar.req('POST', `/v1/calls/${callId}/notes/answer`, {
      deviceId: 'omar-tab-1',
      answer: 'yes',
    });
    expect(yes.json().notes).toMatchObject({ state: 'on', recorderDevice: 'noor-tab-1' });
    // The whole group sees it's on (the banner offers both ways in).
    expect((await omar.get(`/v1/conversations/${trip}/group-call`)).call.notes.state).toBe('on');
    // The recorder leaves: the browser of someone else who said yes takes over.
    await noor.req('POST', `/v1/group-calls/${callId}/leave`, { deviceId: 'noor-tab-1' });
    const handed = await sam.get(`/v1/conversations/${trip}/group-call`);
    expect(handed.call.notes).toMatchObject({ state: 'on', recorderDevice: 'sam-tab-1' });
    // Noor comes back without Cai: it stops for everyone, from now.
    const back = await noor.req('POST', `/v1/group-calls/${callId}/join`, {
      deviceId: 'noor-tab-1',
      notes: 'no',
    });
    expect(back.json().call.notes).toMatchObject({ state: 'stopped', why: 'joined_without' });
    for (const [c, d] of [
      [sam, 'sam-tab-1'],
      [omar, 'omar-tab-1'],
      [noor, 'noor-tab-1'],
    ] as const)
      await c.req('POST', `/v1/group-calls/${callId}/leave`, { deviceId: d });
  });
});
