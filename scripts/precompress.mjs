/**
 * Compresses the exported web app's hashed files once, at build time, so the server sends
 * Brotli (quality 11) or gzip (level 9) siblings instead of whatever the proxy compresses on
 * the fly at a low quality (docs/RESOURCES.md): about a fifth less over the wire on the first
 * visit. Only what's under `_expo/static` (immutable, named by content hash) is compressed;
 * `@fastify/static` picks the `.br` or `.gz` variant by the request's Accept-Encoding.
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const dist = process.argv[2] ?? 'apps/app/dist';
const root = join(dist, '_expo', 'static');
const MIN_BYTES = 1024;
const COMPRESSIBLE = /\.(js|css|json|map|svg|txt|html)$/;

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (COMPRESSIBLE.test(entry.name)) yield path;
  }
}

let raw = 0;
let gz = 0;
let br = 0;
let n = 0;
for await (const path of files(root)) {
  const bytes = await readFile(path);
  if (bytes.length < MIN_BYTES) continue;
  const gzipped = gzipSync(bytes, { level: 9 });
  const brotli = brotliCompressSync(bytes, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
    },
  });
  await Promise.all([writeFile(`${path}.gz`, gzipped), writeFile(`${path}.br`, brotli)]);
  raw += bytes.length;
  gz += gzipped.length;
  br += brotli.length;
  n++;
  // A variant is only worth serving when it's smaller: both always are for these files, and
  // the static handler falls back to the file itself when a variant is missing.
  if (gzipped.length >= bytes.length || brotli.length >= bytes.length)
    console.warn(`${path}: compression didn't help`);
}
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
const stats = await stat(root).catch(() => null);
if (!stats) throw new Error(`No exported web app at ${root}`);
console.log(
  `${n} files under ${root}: ${kb(raw)} raw, ${kb(gz)} gzip, ${kb(br)} brotli (${((1 - br / gz) * 100).toFixed(0)}% under gzip)`,
);
