import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Nothing reads all of a person, an organization or a message where it doesn't need every
 * column (M16 D1, review 2026-10-17 §4 H8): a person's or an organization's catalog, five jsonb
 * columns, rides only where the catalog is drawn, booked from or exported (review 2026-10-09
 * M19), and a message's two search vectors never leave the database. Read from the source's
 * syntax, so an alias, a join or a `where` before `selectAll` hides nothing, and `returningAll`
 * counts as well: the guard this replaces matched `selectFrom('users').selectAll()` alone, and
 * eleven reads passed it (the inbox carried both vectors of every last message, every open of a
 * conversation each member's catalog).
 */

const GUARDED = new Set(['users', 'organizations', 'messages']);

/**
 * Where the catalog is the point, by function: an export, the organization's own view, the
 * public pages, an item's photo, a profile. Never a message: those have their columns.
 */
const CATALOG_READERS: Record<string, string[]> = {
  'lib/export.ts': ['buildExport'],
  'lib/orgs.ts': ['orgById', 'closedOrgById'],
  'lib/public-pages.ts': ['orgRowByHandle', 'personRowByHandle', 'publicPerson'],
  'modules/files.ts': ['itemPhoto'],
  'modules/orgs.ts': ['GET /orgs/by-handle/:handle'],
  'modules/people.ts': ['GET /people/:id'],
};

/** The calls that name a table (and an alias) in a query's chain, and those that start one. */
const NAMES_A_TABLE = new Set([
  'selectFrom',
  'insertInto',
  'updateTable',
  'deleteFrom',
  'innerJoin',
  'leftJoin',
  'rightJoin',
  'fullJoin',
]);
const STARTS = new Set(['selectFrom', 'insertInto', 'updateTable', 'deleteFrom']);
const ROUTE_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

interface Site {
  file: string;
  line: number;
  tables: string[];
  fn: string;
}

/** The function a call is in, by its name, or a route's handler by its method and path. */
function enclosing(node: ts.Node): string {
  for (let n = node.parent; n; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name)
      return n.name.getText();
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      const p = n.parent;
      if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) return p.name.getText();
      if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)) {
        const first = p.arguments[0];
        if (ROUTE_METHODS.has(p.expression.name.text) && first && ts.isStringLiteral(first))
          return `${p.expression.name.text.toUpperCase()} ${first.text}`;
      }
    }
  }
  return '(module)';
}

/** Every `selectAll` and `returningAll` in one source that reads a guarded table. */
function sitesIn(file: string, text: string): Site[] {
  const out: Site[] = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === 'selectAll' || node.expression.name.text === 'returningAll')
    ) {
      // Down the chain to where the query starts, every table and alias on the way.
      const aliases = new Map<string, string>();
      const all: string[] = [];
      let e: ts.Expression = node.expression.expression;
      for (;;) {
        if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
          const name = e.expression.name.text;
          const arg = e.arguments[0];
          if (NAMES_A_TABLE.has(name) && arg && ts.isStringLiteralLike(arg)) {
            const [table = '', alias] = arg.text.split(/\s+as\s+/);
            aliases.set(alias ?? table, table);
            all.push(table);
          }
          if (STARTS.has(name)) break;
          e = e.expression.expression;
        } else if (
          ts.isPropertyAccessExpression(e) ||
          ts.isNonNullExpression(e) ||
          ts.isParenthesizedExpression(e) ||
          ts.isAsExpression(e)
        )
          e = e.expression;
        else break;
      }
      const named = node.arguments.flatMap((a) =>
        ts.isStringLiteralLike(a)
          ? [a.text]
          : ts.isArrayLiteralExpression(a)
            ? a.elements.filter(ts.isStringLiteralLike).map((x) => x.text)
            : [],
      );
      const tables = (named.length ? named.map((a) => aliases.get(a) ?? a) : all).filter((t) =>
        GUARDED.has(t),
      );
      if (tables.length)
        out.push({
          file,
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          tables,
          fn: enclosing(node),
        });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** The same over the server's whole source. */
function sites(): Site[] {
  const root = join(__dirname, '..', 'src');
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) => {
      const text = readFileSync(join(root, file), 'utf8');
      return /selectAll\(|returningAll\(/.test(text) ? sitesIn(file, text) : [];
    });
}

describe('whole rows only where every column is needed (M16 D1)', () => {
  const found = sites();
  const allowed = (s: Site) =>
    !s.tables.includes('messages') && (CATALOG_READERS[s.file] ?? []).includes(s.fn);

  it('reads a person, an organization or a message by its columns everywhere else', () => {
    expect(
      found.filter((s) => !allowed(s)).map((s) => `${s.file}:${s.line} ${s.fn} (${s.tables})`),
    ).toEqual([]);
  });

  it('lists no catalog reader that no longer reads the catalog', () => {
    const used = new Set(found.filter(allowed).map((s) => `${s.file} ${s.fn}`));
    const listed = Object.entries(CATALOG_READERS).flatMap(([file, fns]) =>
      fns.map((fn) => `${file} ${fn}`),
    );
    expect(listed.filter((entry) => !used.has(entry))).toEqual([]);
  });

  it('sees through an alias, a join and a where', () => {
    // The shapes the guard it replaces let pass, each in a function of its own.
    const shapes: Array<[string, string]> = [
      [
        "db.selectFrom('participants as p').innerJoin('users as u', 'u.id', 'p.user_id').selectAll('u')",
        'users',
      ],
      ["db.selectFrom('messages').where('id', '=', id).selectAll()", 'messages'],
      [
        "db.selectFrom('org_members as m').innerJoin('organizations as o', 'o.id', 'm.org_id').selectAll()",
        'organizations',
      ],
      ["db.updateTable('messages').set({ body }).where('id', '=', id).returningAll()", 'messages'],
    ];
    for (const [shape, table] of shapes)
      expect(sitesIn('x.ts', `async function read() { return ${shape}; }`), shape).toEqual([
        { file: 'x.ts', line: 1, tables: [table], fn: 'read' },
      ]);
    // And what reads another table, or names its columns, is nobody's business here.
    expect(
      sitesIn(
        'x.ts',
        "const read = () => db.selectFrom('participants as p').innerJoin('users as u', 'u.id', 'p.user_id').selectAll('p');",
      ),
    ).toEqual([]);
  });
});
