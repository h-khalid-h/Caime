/**
 * The web performance budget (docs/COMPETITIVE.md): the JavaScript a first visit must download
 * before the app can render, gzipped, stays under 450 KB. Reads the exported index.html, so it
 * measures exactly what a browser fetches.
 *
 *   node scripts/bundle-budget.mjs [apps/app/dist]
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 450;
const dist = process.argv[2] ?? 'apps/app/dist';
const html = await readFile(join(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
if (scripts.length === 0) throw new Error('No scripts found in index.html');
let total = 0;
for (const src of scripts) {
  const bytes = await readFile(join(dist, src.replace(/^\//, '')));
  const gz = gzipSync(bytes, { level: 9 }).length;
  total += gz;
  console.log(`${(gz / 1024).toFixed(1).padStart(7)} KB  ${src}`);
}
const kb = total / 1024;
console.log(`${kb.toFixed(1).padStart(7)} KB  initial JavaScript, gzip (budget ${BUDGET_KB} KB)`);
if (kb > BUDGET_KB) {
  console.error(`Over budget by ${(kb - BUDGET_KB).toFixed(1)} KB.`);
  process.exit(1);
}
