// The English strings the interface is written in (R54): every tr('…'), trn(n, '…', '…') and
// msg('…') in the app, in core and on the server. The catalog tests compare them with a
// language's catalogs: a string only the server says (the public site's pages, a notification's
// words, a refusal) belongs to the server's `apps/server/src/locales/<lang>-server.ts`, which
// the app never downloads; every other string to core's `locales/<lang>.ts`.
// `node scripts/i18n-keys.mjs [missing|stale] <lang> [server]` prints what a catalog lacks or
// no longer needs, for whoever translates.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

/** Whether a key is the server's alone (said nowhere the app or core would show it). */
export const isServerKey = (k) => [...k.files].every((f) => f.startsWith('apps/server/src/'));

/** The keys a catalog answers for: the server's own, or everything else's (the app's). */
export function keysFor(keys, server) {
  return new Map([...keys].filter(([, k]) => isServerKey(k) === server));
}

/** Keys as {text, plural: boolean, files}; `one` forms of trn are kept beside their `other` key. */
export function collectKeys() {
  const parser = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const files = execSync(
    "git ls-files --cached --others --exclude-standard 'apps/app/src/**/*.ts' 'apps/app/src/**/*.tsx' 'packages/core/src/*.ts' 'apps/server/src/**/*.ts'",
    { cwd: root },
  )
    .toString()
    .trim()
    .split('\n')
    .filter((f) => f && !/\.test\.tsx?$/.test(f) && !/\/locales\//.test(f));
  const keys = new Map();
  const put = (text, plural, file) => {
    const k = keys.get(text) ?? { text, plural, files: new Set() };
    k.plural = k.plural || plural;
    k.files.add(file);
    keys.set(text, k);
  };
  for (const rel of files) {
    const src = readFileSync(join(root, rel), 'utf8');
    if (!/\b(tr|trn|msg)\(/.test(src)) continue;
    const ast = parser.parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    traverse(ast, {
      CallExpression(path) {
        const c = path.node.callee;
        if (c.type !== 'Identifier') return;
        const args = path.node.arguments;
        if ((c.name === 'tr' || c.name === 'msg') && args[0]?.type === 'StringLiteral') {
          put(args[0].value, false, rel);
        } else if (c.name === 'trn' && args[2]?.type === 'StringLiteral') {
          put(args[2].value, true, rel);
        }
      },
    });
  }
  return keys;
}

const [, , mode, lang, which] = process.argv;
if (mode) {
  const server = which === 'server';
  const keys = keysFor(collectKeys(), server);
  if (mode === 'list') {
    for (const k of keys.values()) console.log(k.plural ? `[plural] ${k.text}` : k.text);
  } else {
    const file = server
      ? join(root, 'apps/server/src/locales', `${lang}-server.ts`)
      : join(root, 'packages/core/src/locales', `${lang}.ts`);
    const mod = await import(file).catch(() => null);
    const catalog = mod?.[server ? `${lang}Server` : lang] ?? {};
    if (mode === 'missing')
      for (const k of keys.values())
        if (!(k.text in catalog)) console.log(k.plural ? `[plural] ${k.text}` : k.text);
    if (mode === 'stale') for (const k of Object.keys(catalog)) if (!keys.has(k)) console.log(k);
  }
}
