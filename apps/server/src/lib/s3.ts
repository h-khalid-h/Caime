/**
 * The little of S3 Caime needs, signed by hand (AWS Signature Version 4) over fetch: putting,
 * reading, sizing and deleting an object. It speaks to any S3-compatible store (AWS, Cloudflare
 * R2, Backblaze, MinIO, Hetzner) by endpoint, bucket and keys, path-style by default. No SDK: a
 * hundred lines do it, and nothing else of the SDK would be used (CONTRIBUTING.md).
 */
import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';

export interface S3Config {
  /** `https://s3.eu-central-1.amazonaws.com`, `https://<account>.r2.cloudflarestorage.com`… */
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** `https://endpoint/bucket/key` (every store) rather than `https://bucket.endpoint/key`. */
  pathStyle: boolean;
}

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) =>
  createHmac('sha256', key).update(data).digest();

/** RFC 3986, as S3 wants each path segment: `encodeURIComponent` leaves too much alone. */
const encodeSegment = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** Where an object lives, and the host the signature names. */
export function objectUrl(cfg: S3Config, key: string): URL {
  const base = new URL(cfg.endpoint);
  const path = key.split('/').map(encodeSegment).join('/');
  if (cfg.pathStyle) return new URL(`${base.origin}/${encodeSegment(cfg.bucket)}/${path}`);
  return new URL(`${base.protocol}//${cfg.bucket}.${base.host}/${path}`);
}

/**
 * The Authorization header for one request, with the headers it signs. `amzDate` is the
 * request's `x-amz-date` (`YYYYMMDDTHHMMSSZ`); `payloadHash` its body's SHA-256, hex.
 */
export function signRequest(
  cfg: S3Config,
  req: {
    method: string;
    url: URL;
    amzDate: string;
    payloadHash: string;
    contentType?: string;
    range?: string;
  },
): Record<string, string> {
  const date = req.amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host: req.url.host,
    'x-amz-content-sha256': req.payloadHash,
    'x-amz-date': req.amzDate,
    ...(req.contentType ? { 'content-type': req.contentType } : {}),
    ...(req.range ? { range: req.range } : {}),
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]?.trim()}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = [
    req.method,
    req.url.pathname,
    req.url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    req.payloadHash,
  ].join('\n');
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', req.amzDate, scope, sha256(canonical)].join('\n');
  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, date);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(toSign).digest('hex');
  const { host: _host, ...sent } = headers;
  return {
    ...sent,
    authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

const amzDateOf = (now: Date) =>
  now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** Puts `body` at `key`. Throws with the store's status and words when it refuses. */
export async function s3Put(
  cfg: S3Config,
  key: string,
  body: Buffer,
  contentType: string,
  now = new Date(),
): Promise<void> {
  const url = objectUrl(cfg, key);
  const headers = signRequest(cfg, {
    method: 'PUT',
    url,
    amzDate: amzDateOf(now),
    payloadHash: sha256(body),
    contentType,
  });
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'content-length': String(body.length) },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`S3 put ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

/** Removes `key`; a key that isn't there is fine. */
export async function s3Delete(cfg: S3Config, key: string, now = new Date()): Promise<void> {
  const url = objectUrl(cfg, key);
  const headers = signRequest(cfg, {
    method: 'DELETE',
    url,
    amzDate: amzDateOf(now),
    payloadHash: sha256(''),
  });
  const res = await fetch(url, { method: 'DELETE', headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok && res.status !== 404)
    throw new Error(`S3 delete ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

/** A stream's body isn't hashed up front: S3 takes it unsigned over TLS (the headers still are). */
export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

/** Puts a stream of `length` bytes at `key`, without holding it in memory. */
export async function s3PutStream(
  cfg: S3Config,
  key: string,
  body: Readable,
  length: number,
  contentType: string,
  now = new Date(),
): Promise<void> {
  const url = objectUrl(cfg, key);
  const headers = signRequest(cfg, {
    method: 'PUT',
    url,
    amzDate: amzDateOf(now),
    payloadHash: UNSIGNED_PAYLOAD,
    contentType,
  });
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'content-length': String(length) },
    body: Readable.toWeb(body) as ReadableStream,
    duplex: 'half',
    signal: AbortSignal.timeout(600_000),
  });
  if (!res.ok) throw new Error(`S3 put ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

/** Reads `key`, or the byte range of it, as a stream. Throws when it isn't there. */
export async function s3Get(
  cfg: S3Config,
  key: string,
  range?: { start: number; end: number },
  now = new Date(),
): Promise<Readable> {
  const url = objectUrl(cfg, key);
  const headers = signRequest(cfg, {
    method: 'GET',
    url,
    amzDate: amzDateOf(now),
    payloadHash: sha256(''),
    range: range ? `bytes=${range.start}-${range.end}` : undefined,
  });
  const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(600_000) });
  if (!res.ok || !res.body) {
    const words = res.body ? (await res.text()).slice(0, 200) : '';
    throw new Error(`S3 get ${key}: ${res.status} ${words}`);
  }
  return Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
}

/** How big `key` is, or null when it isn't there. */
export async function s3Head(cfg: S3Config, key: string, now = new Date()): Promise<number | null> {
  const url = objectUrl(cfg, key);
  const headers = signRequest(cfg, {
    method: 'HEAD',
    url,
    amzDate: amzDateOf(now),
    payloadHash: sha256(''),
  });
  const res = await fetch(url, { method: 'HEAD', headers, signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`S3 head ${key}: ${res.status}`);
  const length = Number(res.headers.get('content-length'));
  return Number.isFinite(length) ? length : null;
}
