import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A route module holds routes and nothing another module imports (CLAUDE.md, layout): what two
 * modules share lives in `lib/`, and `lib/` never reaches back into a module (review
 * 2026-10-09 M22 found eight such imports).
 */
const src = join(__dirname, '..', 'src');
const files = (dir: string) =>
  readdirSync(join(src, dir), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(dir, f));

describe('route modules hold routes', () => {
  it('no module imports another module', () => {
    const offenders = files('modules').filter((f) =>
      /from '\.\/[^']+'/.test(readFileSync(join(src, f), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
  it('nothing in lib imports a module', () => {
    const offenders = files('lib').filter((f) =>
      /from '\.\.\/modules\//.test(readFileSync(join(src, f), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
