import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type S3Config, signRequest, UNSIGNED_PAYLOAD } from '../src/lib/s3';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * Files kept in an S3-compatible bucket (docs/DEPLOY.md, "Scaling"): the same routes, uploads
 * sniffed, cleaned and thumbnailed on local scratch, then streamed into the bucket; read back
 * from it, in ranges too; gone from it when the account goes. The stand-in checks every
 * request's Signature Version 4 and keeps the objects.
 */
let store: Server;
const objects = new Map<string, { body: Buffer; contentType: string }>();
const seen: string[] = [];
let cfg: S3Config;
let t: TestApp;
let noor: Client;
let photoJpeg: Buffer;
const PREFIX = 'caime/files/';

beforeAll(async () => {
  store = createServer(async (req, res) => {
    seen.push(`${req.method} ${req.url}`);
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const declared = String(req.headers['x-amz-content-sha256']);
    const expected = signRequest(cfg, {
      method: req.method ?? '',
      url,
      amzDate: String(req.headers['x-amz-date']),
      payloadHash: declared,
      contentType: req.headers['content-type'] ? String(req.headers['content-type']) : undefined,
      range: req.headers.range ? String(req.headers.range) : undefined,
    });
    const hashed =
      declared === UNSIGNED_PAYLOAD || createHash('sha256').update(body).digest('hex') === declared;
    if (req.headers.authorization !== expected.authorization || !hashed) {
      res.writeHead(403, { 'content-type': 'application/xml' });
      return res.end('<Error><Code>SignatureDoesNotMatch</Code></Error>');
    }
    const key = url.pathname;
    if (req.method === 'PUT') {
      if (Number(req.headers['content-length']) !== body.length) {
        res.writeHead(400);
        return res.end('<Error><Code>IncompleteBody</Code></Error>');
      }
      objects.set(key, { body, contentType: String(req.headers['content-type']) });
      res.writeHead(200);
      return res.end();
    }
    const found = objects.get(key);
    if (req.method === 'DELETE') {
      objects.delete(key);
      res.writeHead(204);
      return res.end();
    }
    if (!found) {
      res.writeHead(404, { 'content-type': 'application/xml' });
      return res.end('<Error><Code>NoSuchKey</Code></Error>');
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'content-length': String(found.body.length) });
      return res.end();
    }
    if (req.method === 'GET') {
      const range = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range ?? ''));
      if (range) {
        const part = found.body.subarray(Number(range[1]), Number(range[2]) + 1);
        res.writeHead(206, {
          'content-length': String(part.length),
          'content-range': `bytes ${range[1]}-${range[2]}/${found.body.length}`,
        });
        return res.end(part);
      }
      res.writeHead(200, { 'content-length': String(found.body.length) });
      return res.end(found.body);
    }
    res.writeHead(405);
    res.end();
  });
  await new Promise<void>((done) => store.listen(0, '127.0.0.1', done));
  const { port } = store.address() as AddressInfo;
  cfg = {
    endpoint: `http://127.0.0.1:${port}`,
    bucket: 'caime-files',
    region: 'auto',
    accessKeyId: 'AKIATESTKEY0000000002',
    secretAccessKey: 'a-secret-nobody-prints-9876543210',
    pathStyle: true,
  };
  t = await createTestApp({
    FILES_S3_ENDPOINT: cfg.endpoint,
    FILES_S3_BUCKET: cfg.bucket,
    FILES_S3_REGION: cfg.region,
    FILES_S3_ACCESS_KEY_ID: cfg.accessKeyId,
    FILES_S3_SECRET_ACCESS_KEY: cfg.secretAccessKey,
    FILES_S3_PREFIX: PREFIX,
  });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  photoJpeg = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 90, b: 40 } },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { ImageDescription: 'taken somewhere' } } })
    .toBuffer();
});
afterAll(async () => {
  await t.close();
  store.close();
});

const upload = (c: Client, name: string, mime: string, body: Buffer) => {
  const boundary = 'caime-boundary-0001';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    body,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return t.app.inject({
    method: 'POST',
    url: '/v1/files',
    headers: {
      authorization: `Bearer ${c.token}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload,
  });
};

const objectKeys = () => [...objects.keys()].map((k) => k.replace(`/${cfg.bucket}/${PREFIX}`, ''));

describe('files in a bucket (docs/DEPLOY.md, "Scaling")', () => {
  it('keeps a photo and its thumbnail in the bucket, cleaned, nothing left on scratch', async () => {
    const res = await upload(noor, 'beach.jpg', 'image/jpeg', photoJpeg);
    expect(res.statusCode, res.body).toBe(201);
    const file = res.json().file;
    expect(file).toMatchObject({ mime: 'image/jpeg', width: 1200, height: 800 });
    const keys = objectKeys();
    expect(keys.some((k) => /^files\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/.test(k))).toBe(true);
    expect(keys).toContain(`thumbs/${file.id}.webp`);
    // Signed, streamed unsigned-payload puts: the stand-in checked each.
    expect(seen.filter((s) => s.startsWith('PUT '))).toHaveLength(2);
    // The photo went in without its metadata.
    const kept = [...objects.entries()].find(([k]) => /\/files\/\d{4}\//.test(k))![1];
    const meta = await sharp(kept.body).metadata();
    expect(meta.exif).toBeUndefined();
    // Nothing of it stays on the instance's disk.
    const scratch = await readdir(`${t.ctx.config.DATA_DIR}/tmp`).catch(() => [] as string[]);
    expect(scratch).toEqual([]);

    // Read back from the bucket, whole and in a range, and its thumbnail.
    const whole = await noor.req('GET', `/v1/files/${file.id}`);
    expect(whole.statusCode).toBe(200);
    expect(whole.rawPayload.length).toBe(Number(file.size));
    expect(whole.headers['content-type']).toBe('image/jpeg');
    const part = await t.app.inject({
      method: 'GET',
      url: `/v1/files/${file.id}`,
      headers: { authorization: `Bearer ${noor.token}`, range: 'bytes=0-99' },
    });
    expect(part.statusCode).toBe(206);
    expect(part.rawPayload.length).toBe(100);
    expect(part.rawPayload.equals(kept.body.subarray(0, 100))).toBe(true);
    const thumb = await noor.req('GET', `/v1/files/${file.id}/thumb`);
    expect(thumb.statusCode).toBe(200);
    expect(thumb.headers['content-type']).toBe('image/webp');
  });

  it('takes a resumable upload in parts on scratch, then keeps the whole in the bucket', async () => {
    const body = Buffer.alloc(300_000, 7);
    const made = await noor.post('/v1/uploads', {
      name: 'notes.bin',
      mime: 'application/octet-stream',
      size: body.length,
    });
    const part = (offset: number, bytes: Buffer) =>
      t.app.inject({
        method: 'PATCH',
        url: `/v1/uploads/${made.id}`,
        headers: {
          authorization: `Bearer ${noor.token}`,
          'content-type': 'application/offset+octet-stream',
          'upload-offset': String(offset),
        },
        payload: bytes,
      });
    const first = await part(0, body.subarray(0, 100_000));
    expect(first.json()).toMatchObject({ offset: 100_000, complete: false });
    // Between parts it's on this instance's disk, not in the bucket.
    expect(objectKeys().filter((k) => k.includes(made.id))).toEqual([]);
    const second = await part(100_000, body.subarray(100_000));
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json().complete).toBe(true);
    const got = await noor.req('GET', `/v1/files/${made.id}`);
    expect(got.statusCode).toBe(200);
    expect(got.rawPayload.equals(body)).toBe(true);
  });

  it('a deleted account takes its files out of the bucket', async () => {
    const before = objects.size;
    expect(before).toBeGreaterThan(0);
    const gone = await noor.req('DELETE', '/v1/me', { password: 'correct horse battery' });
    expect(gone.statusCode, gone.body).toBe(200);
    expect(objects.size).toBe(0);
    expect(seen.filter((s) => s.startsWith('DELETE '))).toHaveLength(before);
  });
});
