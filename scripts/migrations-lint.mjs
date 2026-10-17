// What a release's migrations keep to (CLAUDE.md convention 7; review 2026-10-17 §4, block A3),
// checked against what production runs rather than against taste. The files new since
// `origin/production` are read: a migration production has run is append-only (one changed or
// gone fails); a contraction (a column or table dropped, renamed or retyped) ships a release after
// the code that stopped reading it, so the file names that commit (`-- contracts after <sha>`) and
// it must already be in production; a backfill of a big table runs in batches, inside a procedure
// that commits each one, never as a bare statement that holds the table; an index on a big table is
// built `concurrently`, in a `-- no-transaction` file of its own; and such a file holds one
// statement, since `db/migrate.ts` sends it whole (several run as one implicit transaction).
// `node scripts/migrations-lint.mjs [base]` prints each problem with its file and exits 1 on any;
// with no base to compare with it says so and passes (CI fetches `production` first).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MIGRATIONS_DIR = 'apps/server/src/db/migrations';

/**
 * The tables a bare backfill or a plain index build would hold for long: a row for every message,
 * every person in every conversation, every notification. A new table that grows with use joins
 * the list (the lint's test holds every name to the schema).
 */
export const BIG_TABLES = [
  'messages',
  'message_files',
  'reactions',
  'participants',
  'conversations',
  'notifications',
  'suggestions',
  'tasks',
  'files',
  'audit_log',
  'sessions',
  'users',
  'mail_messages',
  'webhook_deliveries',
  'external_busy',
  'calendar_pushes',
  'saved_items',
];

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const lines = (out) => out.split('\n').filter(Boolean);

/**
 * A migration's statements, comments out and whitespace folded, split on the semicolons outside
 * a dollar-quoted body (a procedure's stays one statement); and whether the file runs outside a
 * transaction.
 */
export function statementsOf(text) {
  const noTransaction = /^--\s*no-transaction\b/m.test(text);
  const sql = text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const statements = [];
  let quoted = false;
  let current = '';
  for (const part of sql.split(/(\$[A-Za-z_]*\$)/)) {
    if (/^\$[A-Za-z_]*\$$/.test(part)) {
      quoted = !quoted;
      current += part;
      continue;
    }
    if (quoted) {
      current += part;
      continue;
    }
    const pieces = part.split(';');
    for (let i = 0; i < pieces.length; i++) {
      current += pieces[i];
      if (i < pieces.length - 1) {
        statements.push(current);
        current = '';
      }
    }
  }
  statements.push(current);
  return {
    noTransaction,
    statements: statements.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean),
  };
}

const CONTRACTION =
  /^alter table (?:if exists )?(?:only )?"?(\w+)"? (?:drop column|rename (?:column|to)|alter (?:column )?"?\w+"? (?:set data )?type)\b|^drop table\b/i;
const BACKFILL = /^(?:update|delete from) (?:only )?"?(\w+)"?\b/i;
const INDEX =
  /^create (?:unique )?index (concurrently )?(?:if not exists )?"?\w+"? on (?:only )?"?(\w+)"?/i;
const PROCEDURE = /^create (?:or replace )?(?:procedure|function)\b/i;
const CONTRACTS_AFTER = /^--\s*contracts after\s+([0-9a-f]{7,40})\b/m;

/**
 * The problems one migration has, as lines naming the file and the rule. `inProduction(sha)` says
 * whether a commit is already in what production runs.
 */
export function lintMigration(name, text, { inProduction }) {
  const problems = [];
  const { noTransaction, statements } = statementsOf(text);
  if (noTransaction && statements.length > 1)
    problems.push(
      `${name}: a \`-- no-transaction\` file runs as one statement (db/migrate.ts sends it whole): one statement per file`,
    );
  const after = text.match(CONTRACTS_AFTER)?.[1];
  for (const statement of statements) {
    if (CONTRACTION.test(statement)) {
      if (!after)
        problems.push(
          `${name}: a contraction (a column or table dropped, renamed or retyped) ships a release after the code that stopped reading it: mark the file \`-- contracts after <commit>\`, naming the commit already in production that no longer reads it`,
        );
      else if (!inProduction(after))
        problems.push(
          `${name}: \`-- contracts after ${after}\` names a commit production does not run yet: the drop waits for the release after it`,
        );
    }
    const backfill = statement.match(BACKFILL);
    if (backfill && BIG_TABLES.includes(backfill[1].toLowerCase()))
      problems.push(
        `${name}: a backfill of ${backfill[1]} runs in batches: a procedure that updates a thousand rows at a time and commits each batch, called from a \`-- no-transaction\` file (CLAUDE.md, convention 7), never a bare statement over the table`,
      );
    if (PROCEDURE.test(statement)) {
      const body = statement.match(/\$[A-Za-z_]*\$([\s\S]*)\$[A-Za-z_]*\$/)?.[1] ?? '';
      const touches = body.match(/\b(?:update|delete from) (?:only )?"?(\w+)"?\b/i);
      if (
        touches &&
        BIG_TABLES.includes(touches[1].toLowerCase()) &&
        !(/\bloop\b/i.test(body) && /\bcommit\b/i.test(body))
      )
        problems.push(
          `${name}: the procedure over ${touches[1]} loops over batches and commits each one, or it holds the table as a bare statement would`,
        );
    }
    const index = statement.match(INDEX);
    if (index && BIG_TABLES.includes(index[2].toLowerCase()) && !index[1])
      problems.push(
        `${name}: an index on ${index[2]} is built concurrently, in a \`-- no-transaction\` file of its own, or its writes wait for the scan`,
      );
  }
  return problems;
}

/** The migrations the working tree adds since `base`, and any of the base's it changed or lost. */
export function newMigrations(base) {
  const added = new Set([
    ...lines(git('diff', '--name-only', '--diff-filter=A', base, '--', MIGRATIONS_DIR)),
    ...lines(git('ls-files', '--others', '--exclude-standard', '--', MIGRATIONS_DIR)),
  ]);
  const changed = lines(
    git('diff', '--name-only', '--diff-filter=MDR', base, '--', MIGRATIONS_DIR),
  );
  return { added: [...added].sort(), changed };
}

/** Every problem the release since `base` has (none is a release that keeps the rules). */
export function lintRelease(base) {
  const { added, changed } = newMigrations(base);
  const problems = changed.map(
    (f) => `${f}: a migration production has run is append-only: add a new one instead`,
  );
  const inProduction = (sha) => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', sha, base], {
        cwd: root,
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  };
  for (const file of added)
    problems.push(...lintMigration(file, readFileSync(join(root, file), 'utf8'), { inProduction }));
  return { added, changed, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.argv[2] ?? 'origin/production';
  let known = true;
  try {
    git('rev-parse', '--verify', '--quiet', base);
  } catch {
    known = false;
  }
  if (!known) {
    console.log(`migrations lint: skipped, nothing to compare with (${base} is not fetched here)`);
    process.exit(0);
  }
  const { added, problems } = lintRelease(base);
  for (const problem of problems) console.error(problem);
  if (problems.length) {
    console.error(
      `migrations lint: against ${base} at ${git('rev-parse', '--short', base)} as fetched here (\`git fetch origin production\` if that is stale)`,
    );
    process.exit(1);
  }
  console.log(
    `migrations lint: ${added.length} new since ${base}${added.length ? ` (${added.map((f) => f.slice(MIGRATIONS_DIR.length + 1)).join(', ')})` : ''}, ok`,
  );
}
