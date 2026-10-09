// The English strings the interface is written in (R54): every tr('…'), trn(n, '…', '…') and
// msg('…') in the app, in core and on the server. The catalog tests compare them with a
// language's catalogs: a string only the server says (the public site's pages, a notification's
// words, a refusal) belongs to the server's `apps/server/src/locales/<lang>-server.ts`, which
// the app never downloads; every other string to core's `locales/<lang>.ts`.
// `node scripts/i18n-keys.mjs [missing|stale] <lang> [server]` prints what a catalog lacks or
// no longer needs, for whoever translates; `bare` lists English shown outside `tr`
// (`bareLiterals`, held empty by `i18n-literals.test.ts`).

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

/** Attributes and fields whose string a person reads. */
const TEXT_FIELDS = new Set([
  'title',
  'subtitle',
  'label',
  'accessibilityLabel',
  'accessibilityHint',
  'placeholder',
  'description',
  'text',
  'hint',
  'caption',
  'message',
  'detail',
  'said',
  'value',
  'summary',
  'kicker',
]);
/** Prose in a template's own text: a word beside a space, or two words. */
const PROSE = /(^|\s)[A-Za-z’']{2,}(\s|$)|[A-Za-z]{2,}\s[A-Za-z]{2,}/;
const WORD = /[A-Za-z]{3,}/;
const WORDS = /[A-Za-z]{2,}(?:[ ’'][A-Za-z]{2,})+/;

/**
 * English a person would read that never went through `tr`: a template literal with prose in
 * its own text (`\`${n} more\``, a sentence built from fragments), a template given to `tr` or
 * `trn` (a key must be one string), JSX text, and a string of two or more words shown as a JSX
 * child or in a field a person reads (`title`, `label`, `placeholder`…). The catalog test fails
 * on any that isn't on its list of what's data (a protocol line, a product's name).
 */
export function bareLiterals() {
  const parser = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const files = execSync(
    "git ls-files --cached --others --exclude-standard 'apps/app/src/**/*.ts' 'apps/app/src/**/*.tsx' 'packages/core/src/*.ts'",
    { cwd: root },
  )
    .toString()
    .trim()
    .split('\n')
    .filter(
      (f) => f && !/\.test\.tsx?$/.test(f) && !/\/locales\//.test(f) && !/\/fixtures\//.test(f),
    );
  const out = [];
  const i18nCall = (node) =>
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    /^(tr|trn|msg)$/.test(node.callee.name);
  for (const rel of files) {
    const src = readFileSync(join(root, rel), 'utf8');
    const ast = parser.parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    const add = (node, kind, text) =>
      out.push({ file: rel, line: node.loc.start.line, kind, text: text.replace(/\s+/g, ' ') });
    // Where a string is shown: a JSX child, or a field a person reads.
    const shownIn = (path) => {
      const parent = path.parentPath;
      if (parent.isJSXExpressionContainer()) {
        if (parent.parentPath.isJSXElement()) return 'child';
        if (parent.parentPath.isJSXAttribute()) return parent.parentPath.node.name.name;
        return null;
      }
      if (parent.isJSXAttribute()) return parent.node.name.name;
      if (parent.isObjectProperty() && parent.node.value === path.node)
        return parent.node.key.name ?? parent.node.key.value ?? null;
      return null;
    };
    traverse(ast, {
      TemplateLiteral(path) {
        const text = path.node.quasis.map((q) => q.value.cooked).join('{}');
        const parent = path.parentPath;
        if (i18nCall(parent.node) && parent.node.arguments[0] === path.node) {
          add(path.node, 'template as key', text);
          return;
        }
        if (parent.isTaggedTemplateExpression() || !PROSE.test(text)) return;
        add(path.node, 'template', text);
      },
      StringLiteral(path) {
        const v = path.node.value;
        if (!WORDS.test(v)) return;
        // An argument of tr/trn/msg, or a key written in a table it reads later.
        if (i18nCall(path.parent)) return;
        const where = shownIn(path);
        if (where === 'child' || (where && TEXT_FIELDS.has(where))) add(path.node, where, v);
      },
      JSXText(path) {
        const v = path.node.value.trim();
        if (WORD.test(v)) add(path.node, 'jsx text', v);
      },
    });
  }
  return out;
}

const [, , mode, lang, which] = process.argv;
if (mode) {
  const server = which === 'server';
  const keys = keysFor(collectKeys(), server);
  if (mode === 'bare') {
    for (const b of bareLiterals()) console.log(`${b.file}:${b.line} [${b.kind}] ${b.text}`);
    process.exit(0);
  }
  if (mode === 'list') {
    for (const k of keys.values()) console.log(k.plural ? `[plural] ${k.text}` : k.text);
  } else {
    const file = server
      ? join(root, 'apps/server/src/locales', `${lang}-server.ts`)
      : join(root, 'packages/core/src/locales', `${lang}.ts`);
    const mod = await import(file).catch(() => null);
    // A catalog's export is named for its language (`ar`, `frServer`); Turkish's can't be `tr`,
    // the translating function's name, so the module's one export is taken where the name misses.
    const catalog = mod?.[server ? `${lang}Server` : lang] ?? Object.values(mod ?? {})[0] ?? {};
    if (mode === 'missing')
      for (const k of keys.values())
        if (!(k.text in catalog)) console.log(k.plural ? `[plural] ${k.text}` : k.text);
    if (mode === 'stale') for (const k of Object.keys(catalog)) if (!keys.has(k)) console.log(k);
  }
}
