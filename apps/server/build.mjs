/**
 * Production build: one ESM bundle of the server and the workspace packages it uses (they ship
 * as TypeScript source), with every npm dependency left external and installed normally, so
 * native modules (sharp) and packages that read files next to themselves keep working. Beside
 * it, `dist/decrypt-backup.js` turns an encrypted backup back for `pg_restore` (M16 B5).
 */
import { cp, readFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith('@caime/'));

await rm('dist', { recursive: true, force: true });
await build({
  entryPoints: { server: 'src/index.ts', 'decrypt-backup': 'src/decrypt-backup.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: 'linked',
  external: [...external, ...external.map((d) => `${d}/*`)],
  logLevel: 'warning',
});
await cp('src/db/migrations', 'dist/migrations', { recursive: true });
console.log(`built dist/server.js and dist/decrypt-backup.js (external: ${external.join(', ')})`);
