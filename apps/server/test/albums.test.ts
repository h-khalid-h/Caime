import { uuidv4 } from '@caime/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sam: Client;
let outsider: Client;
let convo: string;
let photo: Buffer;

async function connect(a: Client, b: Client) {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: { sphere: 'family', role: 'sibling' },
  });
  return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
    .conversationId as string;
}

async function upload(c: Client, name: string, mime: string, data: Buffer) {
  const boundary = `----caime${uuidv4()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/files',
    payload,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${c.token}`,
    },
  });
  if (res.statusCode !== 201) throw new Error(`${res.statusCode} ${res.body}`);
  return res.json().file as { id: string };
}

const album = async (c: Client, title: string) =>
  (
    await c.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit: 'shared_album', fields: { title } },
    })
  ).message;
const add = (c: Client, id: string, fileIds: string[]) =>
  c.req('POST', `/v1/messages/${id}/album`, { fileIds });
const download = (c: Client, fileId: string) =>
  t.app.inject({
    method: 'GET',
    url: `/v1/files/${fileId}`,
    headers: { authorization: `Bearer ${c.token}` },
  });

beforeAll(async () => {
  t = await createTestApp();
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  outsider = await signup(t, { displayName: 'Outsider' });
  convo = await connect(noor, sam);
  photo = await sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 120, b: 80 } },
  })
    .jpeg()
    .toBuffer();
});

afterAll(async () => {
  await t.close();
});

describe('shared albums (PRD §41)', () => {
  it('collect the conversation’s photos, seen only by the people in it', async () => {
    const summer = await album(noor, 'Summer in Alexandria');
    expect(summer.album).toEqual({ count: 0, photos: [] });
    const [a, b] = [
      await upload(noor, 'a.jpg', 'image/jpeg', photo),
      await upload(noor, 'b.jpg', 'image/jpeg', photo),
    ];
    const c = await upload(sam, 'c.jpg', 'image/jpeg', photo);
    expect((await add(noor, summer.id, [a.id, b.id])).statusCode).toBe(200);
    const after = (await add(sam, summer.id, [c.id])).json().message;
    // The card shows how many, newest first.
    expect(after.album.count).toBe(3);
    expect(after.album.photos.map((p: any) => p.id)).toEqual([c.id, b.id, a.id]);

    // Sam sees Noor's photos through the album; someone outside never does.
    expect((await download(sam, a.id)).statusCode).toBe(200);
    expect((await download(outsider, a.id)).statusCode).toBe(404);
    expect((await add(outsider, summer.id, [a.id])).statusCode).toBe(404);
    // Only your own uploads, and only photos and videos.
    expect((await add(sam, summer.id, [a.id])).json().error.message).toBe(
      'Add photos you’ve uploaded.',
    );
    const notes = await upload(sam, 'notes.txt', 'text/plain', Buffer.from('packing list'));
    expect((await add(sam, summer.id, [notes.id])).json().error.message).toBe(
      'Albums take photos and videos.',
    );

    const { photos } = await noor.get(`/v1/messages/${summer.id}/album`);
    expect(photos.map((p: any) => p.addedBy)).toEqual([sam.user.id, noor.user.id, noor.user.id]);
    const assets = await noor.get(`/v1/conversations/${convo}/assets?kind=photo`);
    expect(assets.assets.length).toBeGreaterThanOrEqual(3);
    await t.ctx.flush();
    const titles = (await noor.get('/v1/notifications')).notifications.map((n: any) => n.title);
    expect(titles).toContain('Sam Rivera added a photo to Summer in Alexandria');
  });

  it('let whoever added a photo, or made the album, take it out; closed, nobody adds', async () => {
    const trip = await album(noor, 'Trip');
    const mine = await upload(noor, 'm.jpg', 'image/jpeg', photo);
    const theirs = await upload(sam, 't.jpg', 'image/jpeg', photo);
    await add(noor, trip.id, [mine.id]);
    await add(sam, trip.id, [theirs.id]);
    expect((await sam.req('DELETE', `/v1/messages/${trip.id}/album/${mine.id}`)).statusCode).toBe(
      403,
    );
    expect(
      (await noor.req('DELETE', `/v1/messages/${trip.id}/album/${theirs.id}`)).statusCode,
    ).toBe(200);
    // Out of the album, Sam's photo is Sam's again.
    expect((await download(noor, theirs.id)).statusCode).toBe(404);

    expect(
      (await sam.req('POST', `/v1/messages/${trip.id}/kit`, { to: 'closed' })).statusCode,
    ).toBe(403);
    expect(
      (await noor.req('POST', `/v1/messages/${trip.id}/kit`, { to: 'closed' })).statusCode,
    ).toBe(200);
    const late = await upload(sam, 'late.jpg', 'image/jpeg', photo);
    expect((await add(sam, trip.id, [late.id])).json().error.message).toBe('This album is closed.');
    await noor.req('POST', `/v1/messages/${trip.id}/kit`, { to: 'open' });
    expect((await add(sam, trip.id, [late.id])).statusCode).toBe(200);
  });

  it('deleted, it takes its photos out of view; a deleted account’s photos stay for the others', async () => {
    const gone = await album(noor, 'Gone');
    const p = await upload(noor, 'g.jpg', 'image/jpeg', photo);
    await add(noor, gone.id, [p.id]);
    expect((await download(sam, p.id)).statusCode).toBe(200);
    await noor.req('DELETE', `/v1/messages/${gone.id}`);
    expect((await download(sam, p.id)).statusCode).toBe(404);
    // Out of the album for good: the photo is hers alone, and goes with her account.
    const left = await t.ctx.db
      .selectFrom('album_photos')
      .select('file_id')
      .where('message_id', '=', gone.id)
      .execute();
    expect(left).toEqual([]);

    const kept = await album(noor, 'Kept');
    const s = await upload(sam, 's.jpg', 'image/jpeg', photo);
    await add(sam, kept.id, [s.id]);
    expect(
      (await sam.req('DELETE', '/v1/me', { password: 'correct horse battery' })).statusCode,
    ).toBe(200);
    expect((await download(noor, s.id)).statusCode).toBe(200);
    const { photos } = await noor.get(`/v1/messages/${kept.id}/album`);
    expect(photos).toEqual([expect.objectContaining({ addedBy: null })]);
  });
});
