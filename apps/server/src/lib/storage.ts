/**
 * File storage (ADR-13). Local disk under DATA_DIR by default — mount a volume there in
 * production — or, with FILES_S3_* set, an S3-compatible bucket for what's kept, with uploads
 * in progress on the instance's disk until they're done (they're sniffed, cleaned and
 * thumbnailed there). Keys are opaque; nothing user-controlled reaches a filesystem path.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Config } from '../config';
import { type S3Config, s3Delete, s3Get, s3Head, s3PutStream } from './s3';

export interface Storage {
  write(key: string, source: Readable): Promise<number>;
  /** Only an upload in progress (a `tmp/` key) grows. */
  append(key: string, source: Readable): Promise<number>;
  read(key: string, range?: { start: number; end: number }): Readable;
  size(key: string): Promise<number | null>;
  remove(key: string): Promise<void>;
  /** Where a `tmp/` key is on this instance's disk, for what reads files (sniffing, sharp). */
  path(key: string): string;
  moveFrom(tempKey: string, key: string): Promise<void>;
}

/** Uploads in progress, and what's made from them before they're kept, live under `tmp/`. */
export const isTempKey = (key: string) => key.startsWith('tmp/');

export function diskStorage(root: string): Storage {
  const full = (key: string) => {
    if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes('..')) throw new Error('bad storage key');
    return join(root, key);
  };
  return {
    async write(key, source) {
      const p = full(key);
      await mkdir(dirname(p), { recursive: true });
      await pipeline(source, createWriteStream(p));
      return (await stat(p)).size;
    },
    async append(key, source) {
      const p = full(key);
      await mkdir(dirname(p), { recursive: true });
      await pipeline(source, createWriteStream(p, { flags: 'a' }));
      return (await stat(p)).size;
    },
    read(key, range) {
      return createReadStream(full(key), range);
    },
    async size(key) {
      try {
        return (await stat(full(key))).size;
      } catch {
        return null;
      }
    },
    async remove(key) {
      await rm(full(key), { force: true });
    },
    path: full,
    async moveFrom(tempKey, key) {
      const dest = full(key);
      await mkdir(dirname(dest), { recursive: true });
      await rename(full(tempKey), dest);
    },
  };
}

/**
 * Durable files in a bucket, uploads in progress on local scratch. A `tmp/` key is written,
 * appended and read on disk; moving one to its final key streams it into the bucket and drops
 * the local copy. Nothing here is ever public: the bucket is read only through these routes.
 */
export function s3Storage(cfg: S3Config, prefix: string, scratchRoot: string): Storage {
  const scratch = diskStorage(scratchRoot);
  const object = (key: string) => {
    if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes('..')) throw new Error('bad storage key');
    return `${prefix}${key}`;
  };
  const only = (key: string, what: string) => {
    if (!isTempKey(key)) throw new Error(`${what} is for uploads in progress`);
  };
  return {
    async write(key, source) {
      if (isTempKey(key)) return scratch.write(key, source);
      const staging = `tmp/${key.replaceAll('/', '_')}.put`;
      const size = await scratch.write(staging, source);
      await this.moveFrom(staging, key);
      return size;
    },
    append(key, source) {
      only(key, 'append');
      return scratch.append(key, source);
    },
    read(key, range) {
      if (isTempKey(key)) return scratch.read(key, range);
      // A stream now, filled once the bucket answers: the route sends it either way.
      const out = new PassThrough();
      s3Get(cfg, object(key), range)
        .then((body) => body.pipe(out))
        .catch((err) => out.destroy(err));
      return out;
    },
    size(key) {
      return isTempKey(key) ? scratch.size(key) : s3Head(cfg, object(key));
    },
    async remove(key) {
      if (isTempKey(key)) return scratch.remove(key);
      await s3Delete(cfg, object(key));
    },
    path(key) {
      only(key, 'path');
      return scratch.path(key);
    },
    async moveFrom(tempKey, key) {
      only(tempKey, 'moveFrom');
      if (isTempKey(key)) return scratch.moveFrom(tempKey, key);
      const length = await scratch.size(tempKey);
      if (length === null) throw new Error(`nothing at ${tempKey}`);
      await s3PutStream(
        cfg,
        object(key),
        scratch.read(tempKey),
        length,
        'application/octet-stream',
      );
      await scratch.remove(tempKey);
    },
  };
}

/** The bucket files go to, when every part of it is set. */
export function filesBucket(config: Config): S3Config | null {
  const {
    FILES_S3_ENDPOINT,
    FILES_S3_BUCKET,
    FILES_S3_ACCESS_KEY_ID,
    FILES_S3_SECRET_ACCESS_KEY,
    FILES_S3_REGION,
    FILES_S3_PATH_STYLE,
  } = config;
  if (
    !FILES_S3_ENDPOINT ||
    !FILES_S3_BUCKET ||
    !FILES_S3_ACCESS_KEY_ID ||
    !FILES_S3_SECRET_ACCESS_KEY
  )
    return null;
  return {
    endpoint: FILES_S3_ENDPOINT,
    bucket: FILES_S3_BUCKET,
    region: FILES_S3_REGION,
    accessKeyId: FILES_S3_ACCESS_KEY_ID,
    secretAccessKey: FILES_S3_SECRET_ACCESS_KEY,
    pathStyle: FILES_S3_PATH_STYLE,
  };
}

/** Where files live for this server: the bucket when one is set, else DATA_DIR. */
export function storageFor(config: Config): Storage {
  const bucket = filesBucket(config);
  return bucket
    ? s3Storage(bucket, config.FILES_S3_PREFIX, config.DATA_DIR)
    : diskStorage(config.DATA_DIR);
}
