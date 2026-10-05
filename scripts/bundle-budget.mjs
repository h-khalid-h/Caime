/**
 * The web performance budget (docs/COMPETITIVE.md): the JavaScript a first visit must download
 * before the app can render, gzipped, stays under 450 KB. Reads the exported index.html, so it
 * measures exactly what a browser fetches. Then every chunk fetched later (a route, a sheet, a
 * language's catalog): each stays under 100 KB gzip, so a screen or a catalog that grows is
 * seen here, not only by whoever opens it on a slow connection.
 *
 *   node scripts/bundle-budget.mjs [apps/app/dist]
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 450;
const LAZY_BUDGET_KB = 100;
const SHOWN = 5;
const dist = process.argv[2] ?? 'apps/app/dist';
const html = await readFile(join(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
if (scripts.length === 0) throw new Error('No scripts found in index.html');
let total = 0;
let wire = 0;
for (const src of scripts) {
  const file = join(dist, src.replace(/^\//, ''));
  const bytes = await readFile(file);
  const gz = gzipSync(bytes, { level: 9 }).length;
  total += gz;
  // What a browser that takes Brotli downloads, when the build precompressed it.
  const br = await readFile(`${file}.br`).catch(() => null);
  wire += br ? br.length : gz;
  console.log(
    `${(gz / 1024).toFixed(1).padStart(7)} KB  ${src}${br ? ` (${(br.length / 1024).toFixed(1)} KB brotli)` : ''}`,
  );
}
const kb = total / 1024;
console.log(`${kb.toFixed(1).padStart(7)} KB  initial JavaScript, gzip (budget ${BUDGET_KB} KB)`);
if (wire !== total)
  console.log(
    `${(wire / 1024).toFixed(1).padStart(7)} KB  over the wire with the precompressed Brotli`,
  );
if (kb > BUDGET_KB) {
  console.error(`Over budget by ${(kb - BUDGET_KB).toFixed(1)} KB.`);
  process.exit(1);
}

// What's fetched later, one chunk at a time: the largest, and none over its own ceiling.
const chunkDir = join(dist, '_expo/static/js/web');
const initial = new Set(scripts.map((s) => s.split('/').pop()));
const lazy = [];
for (const file of await readdir(chunkDir)) {
  if (!file.endsWith('.js') || initial.has(file)) continue;
  const gz = gzipSync(await readFile(join(chunkDir, file)), { level: 9 }).length / 1024;
  lazy.push({ file, gz });
}
lazy.sort((a, b) => b.gz - a.gz);
console.log(
  `\nLoaded later (${lazy.length} chunks, ${((lazy.reduce((s, c) => s + c.gz, 0) / 1024) * 1024).toFixed(0)} KB gzip in all), the largest:`,
);
for (const c of lazy.slice(0, SHOWN))
  console.log(`${c.gz.toFixed(1).padStart(7)} KB  ${c.file.replace(/-[0-9a-f]{32}\.js$/, '')}`);
const over = lazy.filter((c) => c.gz > LAZY_BUDGET_KB);
if (over.length > 0) {
  for (const c of over)
    console.error(`${c.file} is ${c.gz.toFixed(1)} KB gzip, over a chunk's ${LAZY_BUDGET_KB} KB.`);
  process.exit(1);
}
