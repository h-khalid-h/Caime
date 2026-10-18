/**
 * No video keeps where it was filmed (M16 E4b): every `udta` and `meta` box in the movie and in
 * its tracks, and XMP beside it, becomes a `free` box of the same size with its bytes zeroed, so
 * the picture, the sound and every offset stay as they were; a file that can't be read for
 * certain is never kept as it came.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boxesIn } from '../src/lib/boxes';
import { stripVideoDetails } from '../src/lib/video-details';
import { type Client, createTestApp, signup, type TestApp } from './helpers';
import { box, plainVideo, VIDEO_PICTURE, VIDEO_SECRETS, video, XMP_BOX } from './video-fixture';

let dir: string;
const strip = async (bytes: Buffer) => {
  const path = join(dir, `${uuidv4()}.mp4`);
  await writeFile(path, bytes);
  const result = await stripVideoDetails(path);
  return { ...result, after: await readFile(path) };
};
const kept = (bytes: Buffer) =>
  VIDEO_SECRETS.filter((s) => bytes.includes(Buffer.from(s, 'latin1')));
const types = (bytes: Buffer, from = 0, to = bytes.length) =>
  (boxesIn(bytes, from, to) ?? []).map((b) => b.type);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'caime-video-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('a video’s details, cleared where they sit (M16 E4b)', () => {
  it('turns the movie’s and its track’s details into empty room, and keeps the picture', async () => {
    const before = video();
    expect(kept(before)).toHaveLength(5);
    const { cleared, unsure, after } = await strip(before);
    expect({ cleared, unsure }).toEqual({ cleared: 3, unsure: false });
    expect(after.length).toBe(before.length);
    expect(kept(after)).toEqual([]);
    expect(after.includes(VIDEO_PICTURE)).toBe(true);
    // The same boxes where they were: only the details are `free` now.
    expect(types(after)).toEqual(['ftyp', 'moov', 'mdat']);
    const [, moov] = boxesIn(after, 0, after.length) ?? [];
    if (!moov) throw new Error('no movie');
    expect(types(after, moov.body, moov.end)).toEqual(['mvhd', 'trak', 'free', 'free']);
    const trak = boxesIn(after, moov.body, moov.end)?.[1];
    if (!trak) throw new Error('no track');
    expect(types(after, trak.body, trak.end)).toEqual(['tkhd', 'free', 'mdia']);
  });

  it('finds the movie after the picture, and XMP beside it', async () => {
    for (const bytes of [
      video({ moovLast: true }),
      video({ xmp: true }),
      video({ brand: 'qt  ' }),
    ]) {
      const { unsure, after } = await strip(bytes);
      expect(unsure).toBe(false);
      expect(kept(after)).toEqual([]);
      expect(after.includes(VIDEO_PICTURE)).toBe(true);
    }
  });

  it('changes nothing where there is nothing to clear', async () => {
    const before = plainVideo();
    const { cleared, unsure, after } = await strip(before);
    expect({ cleared, unsure }).toEqual({ cleared: 0, unsure: false });
    expect(after.equals(before)).toBe(true);
  });

  it('is unsure of a file without a movie, or with a box past its end', async () => {
    const noMovie = Buffer.concat([video().subarray(0, 24), box('mdat', VIDEO_PICTURE)]);
    expect((await strip(noMovie)).unsure).toBe(true);
    const cut = video().subarray(0, video().length - 10);
    expect((await strip(cut)).unsure).toBe(true);
    const onlyXmp = Buffer.concat([video().subarray(0, 24), XMP_BOX]);
    expect((await strip(onlyXmp)).unsure).toBe(true);
  });
});

describe('a video sent (M16 E4b)', () => {
  let t: TestApp;
  let ana: Client;
  let ben: Client;
  let convo: string;

  const upload = (name: string, mime: string, data: Buffer) => {
    const boundary = `----caime${uuidv4()}`;
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    return t.app.inject({
      method: 'POST',
      url: '/v1/files',
      payload: Buffer.concat([head, data, tail]),
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        authorization: `Bearer ${ana.token}`,
      },
    });
  };
  const stored = async (url: string) =>
    (await t.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${ana.token}` } }))
      .rawPayload;

  beforeAll(async () => {
    t = await createTestApp();
    ana = await signup(t, { displayName: 'Ana Video' });
    ben = await signup(t, { displayName: 'Ben Video' });
    const r = await ana.post('/v1/connections/requests', { toUserId: ben.user.id });
    convo = (await ben.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
  });
  afterAll(async () => {
    await t.close();
  });

  it('keeps no place it was filmed, as an MP4, a QuickTime file or a recording', async () => {
    for (const [name, mime, bytes, kind] of [
      ['river.mp4', 'video/mp4', video(), 'video'],
      ['river.mov', 'video/quicktime', video({ brand: 'qt  ', moovLast: true }), 'video'],
      ['note.m4a', 'audio/mp4', video({ brand: 'M4A ' }), 'audio'],
    ] as const) {
      const res = await upload(name, mime, bytes);
      expect(res.statusCode, name).toBe(201);
      const file = res.json().file as { url: string; kind: string; size: number };
      expect(file.kind).toBe(kind);
      expect(file.size).toBe(bytes.length);
      const kept2 = await stored(file.url);
      expect(kept(kept2), name).toEqual([]);
      expect(kept2.includes(VIDEO_PICTURE)).toBe(true);
    }
  });

  it('says it’s a video, as a message of videos alone, wherever it’s named', async () => {
    const file = (await upload('river.mp4', 'video/mp4', video())).json().file as { id: string };
    const sent = await ana.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'media',
      fileIds: [file.id],
    });
    expect(sent.message.payload).toEqual({ video: true });
    expect(sent.message.files[0]).toMatchObject({ id: file.id, kind: 'video' });
    await t.ctx.flush();
    const all = await ben.get('/v1/inbox?view=all');
    const row = all.conversations.find((c: { id: string }) => c.id === convo);
    expect(row.lastMessage.preview).toBe('🎥 Video');
  });

  it('refuses one it can’t read for certain, rather than keep it as it came', async () => {
    const noMovie = Buffer.concat([video().subarray(0, 24), box('mdat', VIDEO_PICTURE)]);
    const res = await upload('broken.mp4', 'video/mp4', noMovie);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe(
      'That video couldn’t be read, so it wasn’t sent. Try another.',
    );
  });
});
