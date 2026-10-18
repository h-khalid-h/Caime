/**
 * What a message keeps of the payload its sender's device sent (L9, M16 E4): what its kind reads,
 * nothing more. A voice note keeps its length and its bars, bounded; nobody's device writes the
 * marks Caime puts on a message (a transcript, an import), and a file keeps nothing of a payload.
 */
import { uuidv4 } from '@caime/core';
import { WAVEFORM_BARS } from '@caime/core/voice';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

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

async function upload(c: Client): Promise<string> {
  const body = multipart('note.wav', 'audio/wav', wav());
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/files?durationMs=2000',
    payload: body.payload,
    headers: { ...body.headers, authorization: `Bearer ${c.token}` },
  });
  if (res.statusCode !== 201) throw new Error(`${res.statusCode} ${res.body}`);
  return res.json().file.id as string;
}

const send = async (c: Client, extra: Record<string, unknown>) =>
  c.req('POST', `/v1/conversations/${convo}/messages`, { clientId: uuidv4(), ...extra });

const seenBy = async (c: Client, id: string) =>
  (await c.get(`/v1/conversations/${convo}/messages?limit=50`)).messages.find(
    (m: { id: string }) => m.id === id,
  );

beforeAll(async () => {
  t = await createTestApp();
  ana = await signup(t, { displayName: 'Ana Payload' });
  ben = await signup(t, { displayName: 'Ben Payload' });
  const r = await ana.post('/v1/connections/requests', { toUserId: ben.user.id });
  convo = (await ben.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
});

describe('a voice note’s payload (M16 E4)', () => {
  it('keeps its length and its bars, and nothing a device wrote for Caime', async () => {
    const waveform = [0, 4, 12, 31, 18, 6];
    const res = await send(ana, {
      kind: 'voice',
      fileIds: [await upload(ana)],
      payload: {
        durationMs: 2000,
        waveform,
        transcript: { language: 'en', by: 'whisper', at: new Date().toISOString() },
        imported: { source: 'whatsapp', by: ana.user.id },
      },
    });
    expect(res.statusCode).toBe(201);
    const id = res.json().message.id as string;
    // The other side reads what was kept: the bars, and no mark Caime never made.
    expect((await seenBy(ben, id)).payload).toEqual({ durationMs: 2000, waveform });
  });

  it('refuses bars a note can’t have', async () => {
    const fileId = await upload(ana);
    const tooMany = [...Array(WAVEFORM_BARS + 1)].map(() => 3);
    for (const waveform of [tooMany, [32], [1.5], ['loud']]) {
      const res = await send(ana, { kind: 'voice', fileIds: [fileId], payload: { waveform } });
      expect(res.statusCode, JSON.stringify(waveform)).toBe(400);
    }
    const long = await send(ana, {
      kind: 'voice',
      fileIds: [fileId],
      payload: { durationMs: 11 * 60_000 },
    });
    expect(long.statusCode).toBe(400);
  });
});

describe('other kinds’ payloads (L9)', () => {
  it('a file keeps none, a sticker and a poll what they read', async () => {
    const file = await send(ana, {
      kind: 'file',
      fileIds: [await upload(ana)],
      payload: { imported: { source: 'whatsapp', by: ben.user.id } },
    });
    expect(file.statusCode).toBe(201);
    expect((await seenBy(ben, file.json().message.id)).payload).toEqual({});

    const sticker = await send(ana, {
      kind: 'sticker',
      payload: { pack: 'caime', sticker: 'wave', introduction: true },
    });
    expect(sticker.statusCode).toBe(201);
    expect((await seenBy(ben, sticker.json().message.id)).payload).toEqual({
      pack: 'caime',
      sticker: 'wave',
    });

    const poll = await send(ana, {
      kind: 'poll',
      payload: {
        question: 'Lunch?',
        options: [
          { id: 'a', text: 'Yes' },
          { id: 'b', text: 'No' },
        ],
        followUp: { taskId: uuidv4() },
      },
    });
    expect(poll.statusCode).toBe(201);
    expect((await seenBy(ben, poll.json().message.id)).payload).toEqual({
      question: 'Lunch?',
      options: [
        { id: 'a', text: 'Yes' },
        { id: 'b', text: 'No' },
      ],
      multiple: false,
    });
  });

  it('a forwarded voice note keeps what Caime wrote on it', async () => {
    const id = (
      await send(ana, {
        kind: 'voice',
        fileIds: [await upload(ana)],
        payload: { durationMs: 2000, waveform: [3, 9] },
      })
    ).json().message.id as string;
    // As if Caime had heard it: the server's own mark, which a forward copies with the words.
    const at = new Date().toISOString();
    await t.ctx.db
      .updateTable('messages')
      .set({
        body: 'See you at six',
        payload: JSON.stringify({
          durationMs: 2000,
          waveform: [3, 9],
          transcript: { language: 'en', by: 'stub', at },
        }),
      })
      .where('id', '=', id)
      .execute();
    const res = await ana.post(`/v1/messages/${id}/forward`, {
      conversationIds: [convo],
      clientId: uuidv4(),
    });
    const copy = await seenBy(ben, res.messageIds[0]);
    expect(copy).toMatchObject({ body: 'See you at six', forwarded: true });
    expect(copy.payload.transcript).toMatchObject({ by: 'stub' });
    expect(copy.payload.waveform).toEqual([3, 9]);
  });
});
