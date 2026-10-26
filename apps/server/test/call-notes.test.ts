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
import { shownMeetingCode } from '@caime/core/meeting-codes';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { planEvents } from '../src/lib/calendar-push';
import { runDueJobs } from '../src/lib/jobs';
import { eraseMessagesWhere } from '../src/lib/org-data';
import { type Client, createTestApp, signup, type TestApp, until } from './helpers';

const replies: Array<{ status: number; json: unknown }> = [];
/**
 * What the model answers, in turn (M16 F7d: a catch-up and the follow-ups of the notes), each to
 * the first request whose words hold its `match` when it has one: an earlier call's write-up, due
 * as the clock moves on, never takes the answer meant for this call's (M16 F7e).
 */
const said: Array<{ status: number; json: unknown; match?: string }> = [];
/** Every request the model was sent, as sent. */
const asked: string[] = [];
const modelSays = (text: string, match?: string) =>
  said.push({
    match,
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
    // The audio is read and dropped; the model's request is read for what it's about.
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const model = (req.url ?? '').startsWith('/v1/messages');
    const body = model ? Buffer.concat(chunks).toString('utf8') : '';
    if (model) asked.push(body);
    const i = said.findIndex((s) => !s.match || body.includes(s.match));
    const r = model
      ? i >= 0
        ? said.splice(i, 1)[0]!
        : { status: 500, json: { type: 'error', error: { type: 'api_error' } } }
      : (replies.shift() ?? {
          status: 200,
          json: { text: 'Hello from the call.', language: 'en' },
        });
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(r.json));
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

  it('Cai joining in is refused where this Caime has no voice for it (M17 I13g)', async () => {
    const res = await noor.req('POST', `/v1/calls/${callId}/notes`, {
      deviceId: 'noor-tab-1',
      canRecord: true,
      interacts: true,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('ai_unavailable');
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

describe('chosen ahead on a meeting card (M16 F7c)', () => {
  const meeting = (c: Client, conversationId: string, fields: Record<string, unknown>) =>
    c.req('POST', `/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: {
          title: 'Contract review',
          start: { at: new Date(Date.now() + 86_400_000).toISOString(), hasTime: true },
          durationMinutes: 30,
          place: 'Caime',
          ...fields,
        },
      },
    });

  it('says so on a meeting held on Caime, and tells a guest before they join', async () => {
    const sent = await meeting(noor, noorSam, { notes: 'cai' });
    expect(sent.statusCode, sent.body).toBe(201);
    const card = sent.json().message;
    expect(card.payload.fields.notes).toBe('cai');
    // Accepted, a guest by link reads that Cai takes notes before taking the link (R85 (1)).
    await sam.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    const invited = await noor.post(`/v1/messages/${card.id}/guests`, {
      link: true,
      name: 'Gus Guest',
    });
    const token = /\/j\/(cmg_[A-Za-z0-9_-]+)/.exec(invited.link ?? '')?.[1] ?? '';
    expect(token).not.toBe('');
    const seen = await t.app.inject({ method: 'GET', url: `/v1/join/${token}` });
    expect(seen.json().meeting).toMatchObject({ title: 'Contract review', notes: true });
    // Its calendar events say it too, wherever the meeting is written (Google, Outlook, the feed).
    const events = await planEvents(t.ctx, sam.user.id, {
      from: new Date(Date.now() - 3_600_000),
      until: new Date(Date.now() + 3 * 86_400_000),
    });
    const said = [...events.values()].find((e) => e.summary.startsWith('Contract review'));
    expect(said?.description).toContain(
      'Cai takes notes in the call, once everyone in it says yes.',
    );
  });

  it('never for a meeting held elsewhere, by someone who couldn’t ask, or with anyone under 18', async () => {
    const elsewhere = await meeting(noor, noorSam, { notes: 'cai', place: 'Cairo Opera House' });
    expect(elsewhere.statusCode).toBe(400);
    expect(elsewhere.json().error.message).toBe('Cai takes notes only in a meeting held on Caime.');
    // Omar has AI assist off: the ask would be his, so the card can't say it.
    const omarNoor = (
      await omar.post('/v1/conversations', { kind: 'direct', userId: noor.user.id })
    ).conversation.id;
    const off = await meeting(omar, omarNoor, { notes: 'cai' });
    expect(off.statusCode).toBe(403);
    expect(off.json().error.code).toBe('ai_off');
    // Someone under 18 in the conversation: refused in words that name nobody (R29).
    await t.ctx.db
      .updateTable('users')
      .set({ birth_date: '2012-01-01' })
      .where('id', '=', sam.user.id)
      .execute();
    const minor = await meeting(noor, noorSam, { notes: 'cai' });
    expect(minor.statusCode).toBe(403);
    expect(minor.json().error.message).toBe('Cai can’t take notes in this conversation.');
    await t.ctx.db
      .updateTable('users')
      .set({ birth_date: '1990-01-01' })
      .where('id', '=', sam.user.id)
      .execute();
    // Without Cai, the same meeting goes as ever.
    const plain = await meeting(omar, omarNoor, {});
    expect(plain.statusCode).toBe(201);
    expect(plain.json().message.payload.fields.notes).toBeUndefined();
  });
});

describe('Cai on the notes, on ask (M16 F7d)', () => {
  it('catches up whoever was in the call, and offers its follow-ups once, by the line', async () => {
    const callId = await ring();
    await ask(noor, callId, 'noor-tab-1');
    await sam.req('POST', `/v1/calls/${callId}/accept`, {
      deviceId: 'sam-phone-1',
      notes: 'yes',
      canRecord: false,
    });
    replies.push(
      { status: 200, json: { text: 'I will send the signed contract by Friday.', language: 'en' } },
      { status: 200, json: { text: 'Great, and I will confirm the venue.', language: 'en' } },
    );
    const now = Date.now();
    expect((await line(noor, callId, 'noor-tab-1', noor.user.id, wav(), now)).statusCode).toBe(200);
    // Heard one at a time: two heard at once take the stand-in's answers in either order.
    await work();
    expect(
      (await line(noor, callId, 'noor-tab-1', sam.user.id, wav(), now + 5_000)).statusCode,
    ).toBe(200);
    await work();
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    await t.ctx.flush();

    // A catch-up, labelled as Cai's and kept nowhere; the model read both, the reader as "You".
    modelSays(
      JSON.stringify({
        summary: 'Noor will send the contract by Friday; Sam confirms the venue.',
        sources: [2],
      }),
    );
    const caught = await noor.post(`/v1/calls/${callId}/notes/catch-up`, {});
    expect(caught).toMatchObject({
      summary: 'Noor will send the contract by Friday; Sam confirms the venue.',
      label: 'Suggested by Cai',
    });
    // The line it rests on, as the reader may read it (M17 I4).
    expect(caught.sources).toHaveLength(1);
    expect(caught.sources[0]).toMatchObject({ kind: 'note', speaker: 'Sam Notes' });

    // A question typed to Cai (M17 I13f): answered to the asker alone, the lines it rests on
    // returned as they may read them (Sam's second line here), kept nowhere.
    modelSays(JSON.stringify({ answer: 'Sam will confirm the venue.', sources: [2, 9] }));
    const asked = await noor.post(`/v1/calls/${callId}/notes/ask`, {
      question: 'Who confirms the venue?',
    });
    expect(asked).toMatchObject({
      answer: 'Sam will confirm the venue.',
      label: 'Suggested by Cai',
    });
    expect(asked.cited).toHaveLength(1);
    expect(asked.cited[0]).toMatchObject({
      speaker: 'Sam Notes',
      mine: false,
      text: 'Great, and I will confirm the venue.',
    });
    expect(typeof asked.cited[0].lineId).toBe('string');

    // Follow-ups, each the reader's suggestion by the line it came from, tied to the call's line.
    const found = {
      items: [
        { kind: 'task', title: 'Send the signed contract', who: null, due: 'Friday', line: 1 },
        { kind: 'waiting', title: 'Confirm the venue', who: 'Sam', due: null, line: 2 },
        { kind: 'task', title: 'Not a line', who: null, due: null, line: 99 },
      ],
    };
    modelSays(JSON.stringify(found));
    const first = await noor.post(`/v1/calls/${callId}/notes/follow-ups`, {});
    const callLine = await t.ctx.db
      .selectFrom('call_notes')
      .select('message_id')
      .where('call_id', '=', callId)
      .executeTakeFirstOrThrow();
    expect(first.label).toBe('Suggested by Cai');
    expect(first.found).toHaveLength(2);
    expect(first.found).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'task',
          title: 'Send the signed contract',
          messageId: callLine.message_id,
        }),
        expect.objectContaining({ kind: 'waiting', subjectUserId: sam.user.id }),
      ]),
    );
    // Asked again, nothing is offered twice.
    modelSays(JSON.stringify(found));
    expect((await noor.post(`/v1/calls/${callId}/notes/follow-ups`, {})).found).toEqual([]);

    // Only for someone with AI assist on; never for someone who wasn't in the call.
    await sam.patch('/v1/me', { aiEnabled: false });
    const off = await sam.req('POST', `/v1/calls/${callId}/notes/catch-up`, {});
    expect(off.statusCode).toBe(403);
    expect(off.json().error.code).toBe('ai_off');
    await sam.patch('/v1/me', { aiEnabled: true });
    const stranger = await omar.req('POST', `/v1/calls/${callId}/notes/catch-up`, {});
    expect(stranger.statusCode).toBe(404);
  });
});

describe('Cai’s notes of the call, once it’s over (M16 F7e)', () => {
  it('writes them once for whoever heard it all, offers each step to its person, and again without deleted words', async () => {
    await sam.patch('/v1/me', { aiEnabled: true });
    const callId = await ring();
    await ask(noor, callId, 'noor-tab-1');
    await sam.req('POST', `/v1/calls/${callId}/accept`, {
      deviceId: 'sam-phone-1',
      notes: 'yes',
      canRecord: false,
    });
    // One line heard at a time, each as the words queued for it.
    const now = Date.now();
    replies.push({
      status: 200,
      json: { text: 'I will send the venue contract by Friday.', language: 'en' },
    });
    expect((await line(noor, callId, 'noor-tab-1', noor.user.id, wav(), now)).statusCode).toBe(200);
    await work();
    replies.push({ status: 200, json: { text: 'Good, I will book the caterer.', language: 'en' } });
    expect(
      (await line(noor, callId, 'noor-tab-1', sam.user.id, wav(), now + 5_000)).statusCode,
    ).toBe(200);
    await work();
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    await t.ctx.flush();
    // Being written, for both of them, a moment after the call is over.
    expect((await noor.get(`/v1/calls/${callId}/notes`)).summaryState).toBe('writing');

    const notes = {
      summary: 'Noor and Sam split the event work.',
      topics: [
        {
          title: 'The event',
          line: 1,
          points: ['Noor sends the venue contract.', 'Sam books the caterer.'],
        },
      ],
      decisions: [{ text: 'Sam books the caterer', line: 2 }],
      nextSteps: [
        { who: 'Noor Notes', what: 'Send the venue contract', due: 'Friday', line: 1 },
        { who: 'Sam', what: 'Book the caterer', due: null, line: 2 },
        { who: 'Omar', what: 'Nobody in the call', due: null, line: 1 },
      ],
    };
    modelSays(JSON.stringify(notes), 'book the caterer');
    t.clock.advance(6_000);
    await work();
    const read = await noor.get(`/v1/calls/${callId}/notes`);
    expect(read.summaryState).toBe('written');
    // Each part opens the recording at the moment of the line it rests on (M17 I13c).
    const said = (read.lines as Array<{ at: string }>).map((l) => l.at);
    expect(read.summary).toEqual({
      summary: 'Noor and Sam split the event work.',
      topics: notes.topics.map(({ title, points }) => ({ title, points, at: said[0] })),
      decisions: [{ text: 'Sam books the caterer', at: said[1] }],
      nextSteps: notes.nextSteps.map(({ who, what, due, line }) => ({
        who,
        what,
        due,
        at: said[line - 1],
      })),
      label: 'Suggested by Cai',
    });
    expect((await sam.get(`/v1/calls/${callId}/notes`)).summary.summary).toBe(
      'Noor and Sam split the event work.',
    );

    // Each step is its person's to take; in a call of two the other waits on it; the decision
    // is the asker's to record; nobody who wasn't in the call gets one.
    const mine = (await noor.get('/v1/suggestions')).suggestions as any[];
    expect(mine.map((s) => [s.kind, s.title])).toEqual(
      expect.arrayContaining([
        ['task', 'Send the venue contract'],
        ['waiting', 'Book the caterer'],
        ['decision', 'Sam books the caterer'],
      ]),
    );
    const sams = (await sam.get('/v1/suggestions')).suggestions as any[];
    expect(sams.map((s) => [s.kind, s.title])).toEqual(
      expect.arrayContaining([
        ['task', 'Book the caterer'],
        ['waiting', 'Send the venue contract'],
      ]),
    );
    expect(sams.some((s) => s.kind === 'decision')).toBe(false);
    // Told once, each in their own words.
    const told = await t.ctx.db
      .selectFrom('notifications')
      .select(['user_id', 'body'])
      .where('kind', '=', 'call')
      .where('body', 'like', 'Your notes from the call%')
      .execute();
    expect(told.map((n) => [n.user_id, n.body]).sort()).toEqual(
      [
        [noor.user.id, 'Your notes from the call with Sam are ready.'],
        [sam.user.id, 'Your notes from the call with Noor are ready.'],
      ].sort(),
    );

    // Noor deletes her words: what was drawn from them goes, and the notes are written again
    // without them, told to nobody a second time.
    const first = read.lines.find((l: { mine: boolean }) => l.mine);
    await noor.req('DELETE', `/v1/calls/${callId}/notes/lines/${first.id}`);
    expect((await noor.get(`/v1/calls/${callId}/notes`)).summaryState).toBe('writing');
    const gone = (await noor.get('/v1/suggestions')).suggestions as any[];
    expect(gone.some((s) => s.title === 'Send the venue contract' && s.status === 'pending')).toBe(
      false,
    );
    modelSays(
      JSON.stringify({
        summary: 'Sam books the caterer.',
        topics: [],
        decisions: [],
        nextSteps: [{ who: 'Sam', what: 'Book the caterer', due: null, line: 1 }],
      }),
      'book the caterer',
    );
    t.clock.advance(6_000);
    await work();
    expect((await sam.get(`/v1/calls/${callId}/notes`)).summary.summary).toBe(
      'Sam books the caterer.',
    );
    const again = await t.ctx.db
      .selectFrom('notifications')
      .select('id')
      .where('kind', '=', 'call')
      .where('body', 'like', 'Your notes from the call%')
      .execute();
    expect(again).toHaveLength(2);
    // Someone who wasn't in the call reads none of it.
    expect((await omar.req('GET', `/v1/calls/${callId}/notes`)).statusCode).toBe(404);
  });

  it('none to write when nothing was heard, and gone with the call’s line', async () => {
    const callId = await ring();
    await ask(noor, callId, 'noor-tab-1');
    await sam.req('POST', `/v1/calls/${callId}/accept`, {
      deviceId: 'sam-phone-1',
      notes: 'yes',
      canRecord: false,
    });
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    await t.ctx.flush();
    t.clock.advance(6_000);
    await work();
    const row = await t.ctx.db
      .selectFrom('call_note_summaries')
      .select(['state', 'message_id'])
      .where('call_id', '=', callId)
      .executeTakeFirst();
    // Nothing was said: no notes to write, and no model asked.
    expect(row?.state).toBe('none');
    expect(row?.message_id).toBeTruthy();
    await t.ctx.db
      .transaction()
      .execute((trx) =>
        eraseMessagesWhere(trx, sql`select ${row!.message_id}::uuid as id`, new Date()),
      );
    expect(
      await t.ctx.db
        .selectFrom('call_note_summaries')
        .select('call_id')
        .where('call_id', '=', callId)
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  it('waits out a busy model, offers nothing to whoever wants less or has assist off, and writes again once', async () => {
    await noor.req('PATCH', '/v1/me', { preferences: { caiInitiative: 'less' } });
    await sam.patch('/v1/me', { aiEnabled: false });
    const callId = await ring();
    await ask(noor, callId, 'noor-tab-1');
    await sam.req('POST', `/v1/calls/${callId}/accept`, {
      deviceId: 'sam-phone-1',
      notes: 'yes',
      canRecord: false,
    });
    const now = Date.now();
    const said3: Array<[string, string]> = [
      [noor.user.id, 'I will print the tickets tonight.'],
      [sam.user.id, 'I will bring the banner.'],
      [noor.user.id, 'And I will call the printer.'],
    ];
    for (const [i, [speaker, text]] of said3.entries()) {
      replies.push({ status: 200, json: { text, language: 'en' } });
      await line(noor, callId, 'noor-tab-1', speaker, wav(), now + i * 5_000);
      await work();
    }
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    await t.ctx.flush();
    const forThisCall = () =>
      asked.filter(
        (b) => b.includes('You write the notes of a call') && b.includes('bring the banner'),
      ).length;

    // The model is busy (each of the client's tries): the notes wait a minute, still being written.
    const busy = {
      status: 529,
      json: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
      match: 'bring the banner',
    };
    said.push(busy, { ...busy }, { ...busy });
    t.clock.advance(6_000);
    await work();
    expect((await noor.get(`/v1/calls/${callId}/notes`)).summaryState).toBe('writing');
    modelSays(
      JSON.stringify({
        summary: 'Tickets, a banner and the printer.',
        topics: [],
        decisions: [],
        nextSteps: [
          { who: 'Noor', what: 'Print the tickets', due: null, line: 1 },
          { who: 'Sam', what: 'Bring the banner', due: null, line: 2 },
        ],
      }),
      'bring the banner',
    );
    t.clock.advance(61_000);
    await work();
    expect((await noor.get(`/v1/calls/${callId}/notes`)).summaryState).toBe('written');

    // Noor asked Cai to do less unasked, and Sam has AI assist off: both read the notes, with
    // every step in them, and both are told; neither is offered anything from them.
    const titles = async (c: Client) =>
      ((await c.get('/v1/suggestions')).suggestions as any[]).map((s) => s.title);
    for (const c of [noor, sam]) {
      const read = await c.get(`/v1/calls/${callId}/notes`);
      expect(read.summary.nextSteps.map((n: { what: string }) => n.what)).toEqual([
        'Print the tickets',
        'Bring the banner',
      ]);
      const offered = await titles(c);
      expect(offered).not.toContain('Print the tickets');
      expect(offered).not.toContain('Bring the banner');
    }
    const told = await t.ctx.db
      .selectFrom('notifications')
      .select('user_id')
      .where('kind', '=', 'call')
      .where('body', 'like', 'Your notes from the call%')
      .where(sql<boolean>`data->>'callId' = ${callId}`)
      .execute();
    expect(told.map((n) => n.user_id).sort()).toEqual([noor.user.id, sam.user.id].sort());

    // She deletes both her lines, a second apart: written again once, without them.
    const before = forThisCall();
    const mine = (await noor.get(`/v1/calls/${callId}/notes`)).lines.filter(
      (l: { mine: boolean }) => l.mine,
    );
    expect(mine).toHaveLength(2);
    for (const l of mine) {
      await noor.req('DELETE', `/v1/calls/${callId}/notes/lines/${l.id}`);
      t.clock.advance(1_000);
    }
    modelSays(
      JSON.stringify({
        summary: 'Sam brings the banner.',
        topics: [],
        decisions: [],
        nextSteps: [],
      }),
      'bring the banner',
    );
    t.clock.advance(6_000);
    await work();
    expect(forThisCall()).toBe(before + 1);
    expect((await sam.get(`/v1/calls/${callId}/notes`)).summary.summary).toBe(
      'Sam brings the banner.',
    );
    await noor.req('PATCH', '/v1/me', { preferences: { caiInitiative: 'usual' } });
    await sam.patch('/v1/me', { aiEnabled: true });
  });
});

describe('a meeting’s notes from its calendar (M16 F6e)', () => {
  it('its event links them once written, and its short address leads there', async () => {
    await sam.patch('/v1/me', { aiEnabled: true });
    // A meeting held here, starting in a few minutes, agreed.
    const sent = await noor.req('POST', `/v1/conversations/${noorSam}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: {
          title: 'Venue walk-through',
          start: { at: new Date(t.clock.now.getTime() + 5 * 60_000).toISOString(), hasTime: true },
          durationMinutes: 30,
          place: 'Caime',
        },
      },
    });
    expect(sent.statusCode, sent.body).toBe(201);
    const card = sent.json().message;
    await sam.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    const eventOf = async () =>
      [
        ...(
          await planEvents(t.ctx, sam.user.id, {
            from: new Date(t.clock.now.getTime() - 3_600_000),
            until: new Date(t.clock.now.getTime() + 86_400_000),
          })
        ).values(),
      ].find((e) => e.summary.startsWith('Venue walk-through'));
    const before = await eventOf();
    const { code } = await t.ctx.db
      .selectFrom('meeting_codes')
      .select('code')
      .where('message_id', '=', card.id)
      .executeTakeFirstOrThrow();
    const address = `http://localhost:8787/m/${shownMeetingCode(code)}`;
    expect(before?.description).not.toContain('notes from the call');
    // Before its call, the address leads to the card.
    expect(await sam.get(`/v1/meeting-links/${shownMeetingCode(code)}`)).toEqual({
      conversationId: noorSam,
      seq: card.seq,
      messageId: card.id,
      notes: null,
    });

    // The call, placed while the meeting can be joined, is the meeting; the calls before it in
    // this conversation are nobody's.
    const callId = await ring();
    const placed = await t.ctx.db
      .selectFrom('calls')
      .select(['id', 'card_id'])
      .where('conversation_id', '=', noorSam)
      .execute();
    expect(placed.filter((c) => c.card_id).map((c) => [c.id, c.card_id])).toEqual([
      [callId, card.id],
    ]);
    // With Cai's notes, written once it's over.
    await ask(noor, callId, 'noor-tab-1');
    await sam.req('POST', `/v1/calls/${callId}/accept`, {
      deviceId: 'sam-phone-1',
      notes: 'yes',
      canRecord: false,
    });
    replies.push({
      status: 200,
      json: { text: 'Let us walk the venue on Monday.', language: 'en' },
    });
    expect((await line(noor, callId, 'noor-tab-1', noor.user.id)).statusCode).toBe(200);
    await work();
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    await t.ctx.flush();
    modelSays(
      JSON.stringify({
        summary: 'Noor and Sam planned the walk-through.',
        topics: [{ title: 'The venue', line: 1, points: ['A walk on Monday.'] }],
        decisions: [],
        nextSteps: [],
      }),
      'walk the venue',
    );
    t.clock.advance(6_000);
    await work();
    expect((await sam.get(`/v1/calls/${callId}/notes`)).summaryState).toBe('written');

    // The event says where they are, in place of the line that Cai takes them.
    const after = await eventOf();
    expect(after?.description).toContain(`Cai’s notes from the call: ${address}`);
    expect(after?.location).toBe(address);
    // And the same address now leads each of them to the notes, at the call's line.
    const { seq } = await t.ctx.db
      .selectFrom('call_note_summaries as s')
      .innerJoin('messages', 'messages.id', 's.message_id')
      .select('messages.seq')
      .where('s.call_id', '=', callId)
      .executeTakeFirstOrThrow();
    for (const who of [noor, sam])
      expect((await who.get(`/v1/meeting-links/${shownMeetingCode(code)}`)).notes).toEqual({
        callId,
        seq: Number(seq),
      });
    // Someone outside the conversation is led nowhere, as for a code nobody holds.
    const nobody = await omar.req('GET', `/v1/meeting-links/${shownMeetingCode(code)}`);
    expect(nobody.statusCode).toBe(404);
  });
});

describe('another mode mid-call (R114, M17 I13b2)', () => {
  it('asks everyone again while the one under way goes on, and takes over once they all said yes', async () => {
    const callId = await ring();
    expect((await ask(noor, callId, 'noor-tab-1')).statusCode).toBe(200);
    const answered = await sam.req('POST', `/v1/calls/${callId}/accept`, {
      deviceId: 'sam-tab-1',
      notes: 'yes',
    });
    const notesId = answered.json().call.notes.id as string;
    expect(answered.json().call.notes).toMatchObject({ state: 'on', records: false });
    // Noor asks to record too: a switch beside the notes, Sam waited on, the notes still on.
    const asked = await noor.req('POST', `/v1/calls/${callId}/notes`, {
      deviceId: 'noor-tab-1',
      canRecord: true,
      records: true,
    });
    expect(asked.statusCode, asked.body).toBe(200);
    expect(asked.json().notes).toMatchObject({
      id: notesId,
      state: 'on',
      records: false,
      switching: { records: true, yes: [noor.user.id], waitingOn: [{ id: sam.user.id }] },
    });
    const firstSwitch = asked.json().notes.switching.id as string;
    // A line still lands on the notes under way.
    expect((await line(noor, callId, 'noor-tab-1', sam.user.id)).statusCode).toBe(200);
    // Sam's no to the switch leaves the notes as they are.
    const no = await sam.req('POST', `/v1/calls/${callId}/notes/answer`, {
      deviceId: 'sam-tab-1',
      answer: 'no',
      canRecord: true,
      notesId: firstSwitch,
    });
    expect(no.json().notes).toMatchObject({ id: notesId, state: 'on', switching: null });
    // Asked again: a yes carrying the notes' own id is no answer to it; a yes to the switch
    // takes over, the notes stopping as replaced, the recording on with the same recorder.
    const again = await noor.req('POST', `/v1/calls/${callId}/notes`, {
      deviceId: 'noor-tab-1',
      canRecord: true,
      records: true,
    });
    const secondSwitch = again.json().notes.switching.id as string;
    expect(secondSwitch).not.toBe(firstSwitch);
    const stale = await sam.req('POST', `/v1/calls/${callId}/notes/answer`, {
      deviceId: 'sam-tab-1',
      answer: 'yes',
      canRecord: true,
      notesId,
    });
    expect(stale.json().notes.switching.waitingOn.map((p: { id: string }) => p.id)).toEqual([
      sam.user.id,
    ]);
    const yes = await sam.req('POST', `/v1/calls/${callId}/notes/answer`, {
      deviceId: 'sam-tab-1',
      answer: 'yes',
      canRecord: true,
      notesId: secondSwitch,
    });
    expect(yes.json().notes).toMatchObject({
      id: secondSwitch,
      state: 'on',
      records: true,
      recorderDevice: 'noor-tab-1',
      switching: null,
    });
    expect(
      await t.ctx.db
        .selectFrom('call_notes')
        .select(['state', 'why'])
        .where('id', '=', notesId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: 'stopped', why: 'replaced' });
    // The other way round, withdrawn by Stop asking alone: the recording goes on.
    const back = await sam.req('POST', `/v1/calls/${callId}/notes`, {
      deviceId: 'sam-tab-1',
      canRecord: true,
      records: false,
    });
    expect(back.json().notes.switching).toMatchObject({ records: false });
    const withdrawn = await noor.req('POST', `/v1/calls/${callId}/notes/stop`, {});
    expect(withdrawn.json().notes).toMatchObject({
      id: secondSwitch,
      state: 'on',
      records: true,
      switching: null,
    });
    // The lines of both rows read as one set of notes.
    await work();
    const read = await noor.req('GET', `/v1/calls/${callId}/notes`);
    expect(read.json().lines.length).toBeGreaterThan(0);
    // Stop ends it; a switch asked while one is still asked (not on) is still a 409.
    expect((await noor.req('POST', `/v1/calls/${callId}/notes/stop`, {})).json().notes.state).toBe(
      'stopped',
    );
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
  });

  it('is declined with the mode under way when that ends', async () => {
    const callId = await ring();
    await ask(noor, callId, 'noor-tab-1');
    await sam.req('POST', `/v1/calls/${callId}/accept`, { deviceId: 'sam-tab-1', notes: 'yes' });
    const asked = await noor.req('POST', `/v1/calls/${callId}/notes`, {
      deviceId: 'noor-tab-1',
      canRecord: true,
      records: true,
    });
    const switchId = asked.json().notes.switching.id as string;
    await noor.req('POST', `/v1/calls/${callId}/end`, { deviceId: 'noor-tab-1' });
    expect(
      await t.ctx.db
        .selectFrom('call_notes')
        .select(['state', 'why'])
        .where('id', '=', switchId)
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: 'declined', why: 'ended' });
  });
});
