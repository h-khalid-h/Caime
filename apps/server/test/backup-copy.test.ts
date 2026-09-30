import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lastBackup, runBackup } from '../src/lib/backup';
import { registerPeriodic, runPeriodic } from '../src/lib/jobs';
import { type S3Config, signRequest } from '../src/lib/s3';
import { createTestApp, type TestApp } from './helpers';

/**
 * A stand-in for an S3-compatible store: keeps what is put, checks each request is signed for
 * this bucket with this secret (Signature Version 4, recomputed from the request's own date and
 * headers), and can be "away" to see what a failed copy does.
 */
let store: Server;
let away = false;
const objects = new Map<string, { body: Buffer; contentType: string }>();
const seen: string[] = [];
let cfg: S3Config;
let t: TestApp;

beforeAll(async () => {
  store = createServer(async (req, res) => {
    seen.push(`${req.method} ${req.url}`);
    if (away) {
      res.writeHead(503, { 'content-type': 'application/xml' });
      return res.end('<Error><Code>SlowDown</Code></Error>');
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const expected = signRequest(cfg, {
      method: req.method ?? '',
      url,
      amzDate: String(req.headers['x-amz-date']),
      payloadHash: String(req.headers['x-amz-content-sha256']),
      contentType: req.headers['content-type'] ? String(req.headers['content-type']) : undefined,
    });
    if (
      req.headers.authorization !== expected.authorization ||
      createHash('sha256').update(body).digest('hex') !== req.headers['x-amz-content-sha256']
    ) {
      res.writeHead(403, { 'content-type': 'application/xml' });
      return res.end('<Error><Code>SignatureDoesNotMatch</Code></Error>');
    }
    if (req.method === 'PUT') {
      objects.set(url.pathname, { body, contentType: String(req.headers['content-type']) });
      res.writeHead(200);
      return res.end();
    }
    res.writeHead(405);
    res.end();
  });
  await new Promise<void>((done) => store.listen(0, '127.0.0.1', done));
  const { port } = store.address() as AddressInfo;
  cfg = {
    endpoint: `http://127.0.0.1:${port}`,
    bucket: 'caime-backups',
    region: 'auto',
    accessKeyId: 'AKIATESTKEY0000000001',
    secretAccessKey: 'a-secret-nobody-prints-0123456789',
    pathStyle: true,
  };
  t = await createTestApp({
    BACKUP_ENABLED: 'true',
    BACKUP_S3_ENDPOINT: cfg.endpoint,
    BACKUP_S3_BUCKET: cfg.bucket,
    BACKUP_S3_REGION: cfg.region,
    BACKUP_S3_ACCESS_KEY_ID: cfg.accessKeyId,
    BACKUP_S3_SECRET_ACCESS_KEY: cfg.secretAccessKey,
    BACKUP_S3_PREFIX: 'caime/backups/',
  });
});
afterAll(async () => {
  await t.close();
  store.close();
});

describe('a copy of each backup off the host (docs/DEPLOY.md, "Backups")', () => {
  it('puts the checked dump in the bucket, signed, and remembers where', async () => {
    const made = await runBackup(t.ctx);
    expect(made?.copy).toBe(`s3://caime-backups/caime/backups/${made?.file}`);
    const key = `/caime-backups/caime/backups/${made?.file}`;
    expect(seen).toEqual([`PUT ${key}`]);
    const object = objects.get(key);
    expect(object?.contentType).toBe('application/octet-stream');
    expect(object?.body.length).toBe(made?.bytes);
    // The dump itself, byte for byte: it restores from the bucket as from the disk.
    expect(object?.body.subarray(0, 5).toString()).toBe('PGDMP');
    expect((await lastBackup(t.ctx))?.copy).toBe(made?.copy);
    // Nothing of the secret travels: the signature does.
    expect(JSON.stringify(seen)).not.toContain(cfg.secretAccessKey);
  });

  it('a bucket that is away leaves the backup standing, and the hourly task copies it later', async () => {
    seen.length = 0;
    t.clock.advance(25 * 3_600_000);
    away = true;
    const made = await runBackup(t.ctx);
    expect(made?.copy).toBeNull();
    expect(made?.bytes).toBeGreaterThan(1000);
    expect((await lastBackup(t.ctx))?.copy).toBeNull();
    expect(seen).toEqual([`PUT /caime-backups/caime/backups/${made?.file}`]);
    // Back: the periodic task finds the last backup uncopied and its file still here.
    away = false;
    seen.length = 0;
    registerPeriodic({ name: 'noop-for-this-test', everyMs: 1, run: async () => {} });
    await runPeriodic(t.ctx);
    expect(seen).toEqual([`PUT /caime-backups/caime/backups/${made?.file}`]);
    expect((await lastBackup(t.ctx))?.copy).toBe(`s3://caime-backups/caime/backups/${made?.file}`);
  });

  it('refuses a request signed with another secret', async () => {
    const { s3Put } = await import('../src/lib/s3');
    await expect(
      s3Put(
        { ...cfg, secretAccessKey: 'not-the-secret-0123456789abcdef' },
        'x/y',
        Buffer.from('hi'),
        'text/plain',
      ),
    ).rejects.toThrow(/403/);
  });
});
