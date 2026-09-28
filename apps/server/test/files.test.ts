import { uuidv4 } from '@caime/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sarah: Client;
let outsider: Client;
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

async function upload(c: Client, name: string, mime: string, data: Buffer, query = '') {
  const body = multipart(name, mime, data);
  const res = await t.app.inject({
    method: 'POST',
    url: `/v1/files${query}`,
    payload: body.payload,
    headers: { ...body.headers, authorization: `Bearer ${c.token}` },
  });
  if (res.statusCode !== 201) throw new Error(`${res.statusCode} ${res.body}`);
  return res.json().file;
}

const download = (c: Client, url: string, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${c.token}`, ...headers } });

let photoJpeg: Buffer;

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, { displayName: 'Hassan' });
  sarah = await signup(t, { displayName: 'Sarah' });
  outsider = await signup(t, { displayName: 'Outsider' });
  const r = await hassan.post('/v1/connections/requests', { toUserId: sarah.user.id });
  convo = (await sarah.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
  photoJpeg = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#ff8fb1' },
  })
    .jpeg()
    .withExif({
      IFD0: { Copyright: 'secret-camera' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '30/1 2/1 0/1' },
    })
    .toBuffer();
});
afterAll(async () => {
  await t.close();
});

describe('uploads', () => {
  it('stores photos without metadata and makes a thumbnail', async () => {
    expect((await sharp(photoJpeg).metadata()).exif).toBeDefined();
    const f = await upload(hassan, 'beach.jpg', 'image/jpeg', photoJpeg);
    expect(f).toMatchObject({
      kind: 'image',
      mime: 'image/jpeg',
      width: 1200,
      height: 800,
      name: 'beach.jpg',
    });
    expect(f.thumbUrl).toBe(`/v1/files/${f.id}/thumb`);
    const res = await download(hassan, f.url);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    const meta = await sharp(res.rawPayload).metadata();
    expect(meta.exif).toBeUndefined();
    const thumb = await download(hassan, f.thumbUrl);
    expect((await sharp(thumb.rawPayload).metadata()).width).toBe(480);
  });

  it('never keeps a photo as it came when its details can’t be taken out', async () => {
    // Cut short: its header (with the place it was taken) is whole, the picture isn't.
    const cut = photoJpeg.subarray(0, Math.floor(photoJpeg.length * 0.6));
    expect((await sharp(cut).metadata()).exif).toBeDefined();
    const before = await t.ctx.db
      .selectFrom('files')
      .select('id')
      .where('owner_id', '=', hassan.user.id)
      .execute();
    await expect(upload(hassan, 'cut.jpg', 'image/jpeg', cut)).rejects.toThrow(
      /^400 .*couldn’t be read/,
    );
    const after = await t.ctx.db
      .selectFrom('files')
      .select('id')
      .where('owner_id', '=', hassan.user.id)
      .execute();
    expect(after).toEqual(before);
  });

  it('refuses it the same way when it comes in pieces, and counts none of it', async () => {
    const cut = photoJpeg.subarray(0, Math.floor(photoJpeg.length * 0.6));
    const used = async () => (await hassan.get('/v1/me/plan')).used.storageBytes;
    const was = await used();
    const start = await hassan.post('/v1/uploads', {
      name: 'cut.jpg',
      mime: 'image/jpeg',
      size: cut.length,
    });
    // Under way, it counts at its full size.
    expect(await used()).toBe(was + cut.length);
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/v1/uploads/${start.id}`,
      payload: cut,
      headers: {
        authorization: `Bearer ${hassan.token}`,
        'content-type': 'application/offset+octet-stream',
        'upload-offset': '0',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/couldn’t be read/);
    const row = await t.ctx.db
      .selectFrom('files')
      .select('status')
      .where('id', '=', start.id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('failed');
    expect(await used()).toBe(was);
  });

  it('trusts the bytes, not the name: an HTML file posing as a photo downloads as an attachment', async () => {
    const f = await upload(
      hassan,
      'photo.jpg',
      'image/jpeg',
      Buffer.from('<html><script>alert(1)</script></html>'),
    );
    expect(f.kind).toBe('other');
    const res = await download(hassan, f.url);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
  });

  it('resumes an interrupted upload from the server’s offset', async () => {
    const data = await sharp({
      create: { width: 300, height: 300, channels: 3, background: '#7dd3fc' },
    })
      .png()
      .toBuffer();
    const start = await hassan.post('/v1/uploads', {
      name: 'sky.png',
      mime: 'image/png',
      size: data.length,
    });
    const auth = {
      authorization: `Bearer ${hassan.token}`,
      'content-type': 'application/offset+octet-stream',
    };
    const half = Math.floor(data.length / 2);
    const first = await t.app.inject({
      method: 'PATCH',
      url: `/v1/uploads/${start.id}`,
      payload: data.subarray(0, half),
      headers: { ...auth, 'upload-offset': '0' },
    });
    expect(first.json()).toMatchObject({ offset: half, complete: false });
    const wrong = await t.app.inject({
      method: 'PATCH',
      url: `/v1/uploads/${start.id}`,
      payload: data.subarray(half),
      headers: { ...auth, 'upload-offset': '0' },
    });
    expect(wrong.statusCode).toBe(409);
    const head = await t.app.inject({
      method: 'HEAD',
      url: `/v1/uploads/${start.id}`,
      headers: { authorization: auth.authorization },
    });
    expect(head.headers['upload-offset']).toBe(String(half));
    const rest = await t.app.inject({
      method: 'PATCH',
      url: `/v1/uploads/${start.id}`,
      payload: data.subarray(half),
      headers: { ...auth, 'upload-offset': String(half) },
    });
    expect(rest.json()).toMatchObject({ complete: true, file: { kind: 'image', width: 300 } });
  });
});

describe('who can read a file', () => {
  it('participants of a conversation it was shared in, and nobody else', async () => {
    const f = await upload(hassan, 'plan.jpg', 'image/jpeg', photoJpeg);
    expect((await download(sarah, f.url)).statusCode).toBe(404);
    const sent = await hassan.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'media',
      body: 'The plan',
      fileIds: [f.id],
    });
    expect(sent.message.files[0]).toMatchObject({ id: f.id, kind: 'image' });
    expect((await download(sarah, f.url)).statusCode).toBe(200);
    expect((await download(outsider, f.url)).statusCode).toBe(404);
    const assets = await sarah.get(`/v1/conversations/${convo}/assets?kind=photo`);
    expect(assets.assets[0].file.id).toBe(f.id);
    // Someone else's file can't be attached.
    const steal = await outsider.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'media',
      fileIds: [f.id],
    });
    expect(steal.statusCode).toBe(404);
  });

  it('a photo someone deleted for themselves leaves what they see shared, not the others’', async () => {
    const f = await upload(hassan, 'receipt.jpg', 'image/jpeg', photoJpeg);
    const sent = await hassan.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'media',
      fileIds: [f.id],
    });
    const seen = async (c: Client) => {
      const shared = await c.get(`/v1/conversations/${convo}/assets?kind=photo,video`);
      const memory = await c.get(`/v1/conversations/${convo}/memory`);
      return {
        photos: shared.assets.map((a: any) => a.file.id),
        counted: (shared.counts.photo ?? 0) as number,
        files: memory.counts.files as number,
      };
    };
    const before = await seen(sarah);
    expect(before.photos).toContain(f.id);
    await sarah.del(`/v1/messages/${sent.message.id}?forEveryone=false`);
    const after = await seen(sarah);
    expect(after.photos).not.toContain(f.id);
    expect(after.counted).toBe(before.counted - 1);
    expect(after.files).toBe(before.files - 1);
    expect(await seen(hassan)).toEqual(before);
  });

  it('serves byte ranges for media players', async () => {
    const f = await upload(hassan, 'clip.jpg', 'image/jpeg', photoJpeg);
    const res = await download(hassan, f.url, { range: 'bytes=0-9' });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toMatch(/^bytes 0-9\//);
    expect(res.rawPayload.length).toBe(10);
  });
});

describe('avatars follow the owner’s privacy', () => {
  it('connections-only photos are hidden from strangers', async () => {
    const f = await upload(sarah, 'me.jpg', 'image/jpeg', photoJpeg);
    await sarah.patch('/v1/me', { avatarFileId: f.id });
    const url = (await sarah.get('/v1/me')).user.avatarUrl;
    expect((await download(hassan, url)).statusCode).toBe(200);
    expect((await download(outsider, url)).statusCode).toBe(200);
    await sarah.req('PUT', '/v1/me/privacy', { fields: { profilePhoto: { kind: 'connections' } } });
    expect((await download(outsider, url)).statusCode).toBe(404);
    expect((await download(hassan, url)).statusCode).toBe(200);
    const view = await outsider.get(`/v1/people/${sarah.user.id}`);
    expect(view.person.avatarUrl).toBeNull();
  });
});
