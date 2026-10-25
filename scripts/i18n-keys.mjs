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
    if (!/\b(tr|trn|trFor|msg)\(/.test(src)) continue;
    const ast = parser.parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    traverse(ast, {
      CallExpression(path) {
        const c = path.node.callee;
        if (c.type !== 'Identifier') return;
        const args = path.node.arguments;
        if ((c.name === 'tr' || c.name === 'msg') && args[0]?.type === 'StringLiteral') {
          put(args[0].value, false, rel);
        } else if (c.name === 'trFor' && args[1]?.type === 'StringLiteral') {
          // A word said of someone (R81): the key is its second argument.
          put(args[1].value, false, rel);
        } else if (c.name === 'trn' && args[2]?.type === 'StringLiteral') {
          put(args[2].value, true, rel);
        }
      },
    });
  }
  return keys;
}

/**
 * A catalog's words cased by hand (M16 D4): `tr(…).toLowerCase()` turns Turkish "İş" into
 * "i̇ş". Core's `lower`, `lowerFirst` and `sentence` case by the reader's language; what's
 * listed here is every `tr`, `trn` or `trFor` call whose result is cased directly.
 */
export function casedWords() {
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
  const out = [];
  for (const rel of files) {
    const src = readFileSync(join(root, rel), 'utf8');
    if (!/\.to(Locale)?(Lower|Upper)Case\(/.test(src)) continue;
    const ast = parser.parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    traverse(ast, {
      MemberExpression(path) {
        const { object, property } = path.node;
        if (property.type !== 'Identifier') return;
        if (!/^to(Locale)?(Lower|Upper)Case$/.test(property.name)) return;
        if (
          object.type === 'CallExpression' &&
          object.callee.type === 'Identifier' &&
          /^(tr|trn|trFor)$/.test(object.callee.name)
        )
          out.push(`${rel}:${path.node.loc.start.line}`);
      },
    });
  }
  return out;
}

/** The source the interface's words are said in: the app, core and the server, less tests. */
function sourceFiles() {
  return execSync(
    "git ls-files --cached --others --exclude-standard 'apps/app/src/**/*.ts' 'apps/app/src/**/*.tsx' 'packages/core/src/*.ts' 'apps/server/src/**/*.ts'",
    { cwd: root },
  )
    .toString()
    .trim()
    .split('\n')
    .filter((f) => f && !/\.test\.tsx?$/.test(f) && !/\/locales\//.test(f));
}

/** A key glued to another: it starts or ends with a space, or starts with punctuation. */
const FRAGMENT = /^[\s,.;:·]|\s$/;
/** A word for what it holds: `{n}` (a count) or a camelCase word of two letters or more. */
const NAMED = /^(?:n|[a-z][a-zA-Z]+)$/;
/** Names the code gives a value, which say nothing to whoever translates. */
const CODE_NAMES =
  /^(?:length|size|join|trim|at|with|and|indexOf|debounced|tr|trn|msg|lower\w*|upper\w*|to[A-Z]\w*|format[A-Z]\w*)$/;
const holesOf = (key) => [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

/**
 * Sentences in pieces and placeholders that don't say what they hold (M16 D4), as "file:line
 * what": a key that starts or ends with a space, or starts with a comma, is a fragment glued to
 * another (one key per sentence, the way each language orders it); a placeholder is a word for
 * what it holds (`{name}`, `{count}`), never the code's name for it (`{toLowerCase}`, `{length}`,
 * `{PINNED_MAX}`, `{i}`); and where a sentence is said, every placeholder it names is passed and
 * nothing it doesn't name (an object literal, or a constant holding one).
 */
export function placeholderIssues() {
  const parser = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const out = [];
  for (const rel of sourceFiles()) {
    const src = readFileSync(join(root, rel), 'utf8');
    if (!/\b(tr|trn|trFor|msg)\(/.test(src)) continue;
    const ast = parser.parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    traverse(ast, {
      CallExpression(path) {
        const c = path.node.callee;
        if (c.type !== 'Identifier') return;
        const args = path.node.arguments;
        const at = { tr: 0, msg: 0, trFor: 1, trn: 2 }[c.name];
        if (at === undefined || args[at]?.type !== 'StringLiteral') return;
        const keys = [args[at].value];
        if (c.name === 'trn' && args[1]?.type === 'StringLiteral') keys.push(args[1].value);
        const where = `${rel}:${path.node.loc.start.line}`;
        for (const key of keys) {
          if (FRAGMENT.test(key)) out.push(`${where} a fragment: ${JSON.stringify(key)}`);
          for (const h of holesOf(key))
            if (!NAMED.test(h) || CODE_NAMES.test(h))
              out.push(`${where} {${h}} says what the code calls it: ${JSON.stringify(key)}`);
        }
        if (c.name === 'msg') return;
        const wanted = new Set(keys.flatMap(holesOf));
        if (c.name === 'trn') wanted.delete('n');
        let vars = args[at + 1];
        if (vars?.type === 'Identifier') {
          const init = path.scope.getBinding(vars.name)?.path.node.init;
          vars = init?.type === 'ObjectExpression' ? init : vars;
        }
        if (!vars) {
          for (const h of wanted)
            out.push(`${where} {${h}} isn't passed: ${JSON.stringify(keys[0])}`);
          return;
        }
        if (vars.type !== 'ObjectExpression') return;
        const given = new Set();
        let spread = false;
        for (const prop of vars.properties) {
          if (prop.type !== 'ObjectProperty' || prop.computed) {
            spread = true;
            continue;
          }
          given.add(prop.key.type === 'Identifier' ? prop.key.name : prop.key.value);
        }
        if (!spread)
          for (const h of wanted)
            if (!given.has(h)) out.push(`${where} {${h}} isn't passed: ${JSON.stringify(keys[0])}`);
        for (const g of given)
          if (!wanted.has(g) && !(c.name === 'trn' && g === 'n'))
            out.push(`${where} ${g} is passed but never said: ${JSON.stringify(keys[0])}`);
      },
    });
  }
  return out;
}

/**
 * Lists a person reads joined by a comma of their own (M16 D4), as "file:line": core's `listed`
 * joins with the reader's comma (Arabic's "،"), `joinNames` with their "and". The app and core.
 */
export function commaJoins() {
  const out = [];
  for (const rel of sourceFiles()) {
    if (rel.startsWith('apps/server/')) continue;
    const lines = readFileSync(join(root, rel), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/\.join\((['"])[,،] \1\)/.test(line)) out.push(`${rel}:${i + 1}`);
    });
  }
  return out;
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
/**
 * Words someone may read, wherever the string goes (M16 E1): two words, a word with an ellipsis
 * ("Calling…"), or a word and a colon ("You: ").
 */
const SAYS = /[A-Za-z]{2,}(?:[ ’'][A-Za-z]+)+|[A-Za-z]{2,}…$|^[A-Z][a-z]+: ?$/;
/** Attributes that hold code, never words. */
const CODE_ATTRS = new Set([
  'testID',
  'nativeID',
  'accessibilityRole',
  'role',
  'keyboardType',
  'autoComplete',
  'textContentType',
  'returnKeyType',
  'autoCapitalize',
  'pointerEvents',
  'resizeMode',
  'contentFit',
  'href',
  'variant',
  'color',
  'name',
  'id',
  'type',
  'mode',
  'dir',
  'lang',
  'inputMode',
  'enterKeyHint',
]);
/**
 * Core's files of rules and data, read by code and never shown as the interface's words: other
 * languages' words for the readers, patterns, names of things, and the legal page's English.
 */
const WORD_DATA_FILES = new Set([
  'packages/core/src/intelligence-fr.ts',
  'packages/core/src/intelligence-tr.ts',
  'packages/core/src/chat-act.ts',
  'packages/core/src/chat-free.ts',
  'packages/core/src/chat-org.ts',
  'packages/core/src/chat-intent.ts',
  'packages/core/src/chat-save.ts',
  'packages/core/src/chat-words.ts',
  'packages/core/src/cai-call.ts',
  'packages/core/src/languages.ts',
  'packages/core/src/latin-language.ts',
  'packages/core/src/arabic-variety.ts',
  'packages/core/src/contacts.ts',
  'packages/core/src/search.ts',
  'packages/core/src/processors.ts',
  'packages/core/src/billing.ts',
  'packages/core/src/countries.ts',
]);
/** Where a string is the code's own: an import, a type, a key, a comparison, a case, a log. */
function codePlace(path) {
  const p = path.parentPath;
  const n = path.node;
  if (p.isImportDeclaration() || p.isExportNamedDeclaration() || p.isExportAllDeclaration())
    return true;
  if (p.isImport() || p.isImportExpression() || p.isTSLiteralType() || p.isTSEnumMember())
    return true;
  if ((p.isObjectProperty() || p.isClassProperty() || p.isObjectMethod()) && p.node.key === n)
    return true;
  if (p.isMemberExpression() && p.node.property === n) return true;
  if (p.isJSXAttribute() && CODE_ATTRS.has(p.node.name.name)) return true;
  if (p.isBinaryExpression() && /^(===|!==|==|!=)$/.test(p.node.operator)) return true;
  if (p.isSwitchCase()) return true;
  if (
    p.isNewExpression() &&
    p.node.callee.type === 'Identifier' &&
    /^(Error|TypeError|RangeError|RegExp)$/.test(p.node.callee.name)
  )
    return true;
  if (p.isCallExpression()) {
    const c = p.node.callee;
    if (
      c.type === 'MemberExpression' &&
      c.object.type === 'Identifier' &&
      c.object.name === 'console'
    )
      return true;
    if (c.type === 'Identifier' && c.name === 'require') return true;
  }
  return false;
}
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
    // Where a string is shown: a JSX child, a field a person reads, or what an alert or a
    // toast says; through either side of a condition (`n === 1 ? 'one thing' : …`).
    const shownIn = (from) => {
      let path = from;
      while (
        (path.parentPath.isConditionalExpression() && path.parentPath.node.test !== path.node) ||
        path.parentPath.isLogicalExpression()
      )
        path = path.parentPath;
      const parent = path.parentPath;
      if (parent.isCallExpression() && parent.node.arguments.includes(path.node)) {
        const callee = parent.node.callee;
        if (callee.type === 'Identifier' && callee.name === 'toast') return 'toast';
        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'Alert'
        )
          return 'alert';
        return null;
      }
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
        if (!WORDS.test(v) && !SAYS.test(v)) return;
        // An argument of tr/trn/msg, or a key written in a table it reads later.
        if (i18nCall(path.parent)) return;
        const where = shownIn(path);
        if (
          WORDS.test(v) &&
          (where === 'child' || where === 'toast' || where === 'alert' || TEXT_FIELDS.has(where))
        ) {
          add(path.node, where, v);
          return;
        }
        // Words wherever they go next (M16 E1): a variable, a helper's argument, a field's error
        // or a call's note reach a person as surely as a JSX child, and the old rule missed every
        // one of them ('typing…', 'Calling…', `act(…, 'Signed out.')`).
        if (SAYS.test(v) && !WORD_DATA_FILES.has(rel) && !codePlace(path))
          add(path.node, 'words', v);
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
    // A catalog's export is named for its language (`ar`, `frServer`); Turkish's can't be `tr`,
    // the translating function's name, so the module's one export is taken where the name misses.
    // A catalog the app downloads in halves (`ar-a.ts`, `ar-b.ts`) is read from its halves.
    const halves = server
      ? []
      : [`${lang}-a.ts`, `${lang}-b.ts`].map((f) => join(root, 'packages/core/src/locales', f));
    const catalog = {};
    for (const f of [file, ...halves]) {
      const mod = await import(f).catch(() => null);
      Object.assign(
        catalog,
        mod?.[server ? `${lang}Server` : lang] ?? Object.values(mod ?? {})[0] ?? {},
      );
    }
    if (mode === 'missing')
      for (const k of keys.values())
        if (!(k.text in catalog)) console.log(k.plural ? `[plural] ${k.text}` : k.text);
    if (mode === 'stale') for (const k of Object.keys(catalog)) if (!keys.has(k)) console.log(k);
  }
}
