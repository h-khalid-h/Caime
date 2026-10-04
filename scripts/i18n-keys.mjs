// The English strings the interface is written in (R54): every tr('…'), trn(n, '…', '…') and
// msg('…') in the app and in core. The catalog test compares them with a language's catalog;
// `node scripts/i18n-keys.mjs [missing|stale] <lang>` prints what a catalog lacks or no longer
// needs, for whoever translates.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

/** Keys as {text, plural: boolean}; `one` forms of trn are kept beside their `other` key. */
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

const [, , mode, lang] = process.argv;
if (mode) {
  const keys = collectKeys();
  if (mode === 'list') {
    for (const k of keys.values()) console.log(k.plural ? `[plural] ${k.text}` : k.text);
  } else {
    const mod = await import(join(root, 'packages/core/src/locales', `${lang}.ts`)).catch(
      () => null,
    );
    const catalog = mod?.[lang] ?? {};
    if (mode === 'missing')
      for (const k of keys.values())
        if (!(k.text in catalog)) console.log(k.plural ? `[plural] ${k.text}` : k.text);
    if (mode === 'stale') for (const k of Object.keys(catalog)) if (!keys.has(k)) console.log(k);
  }
}
