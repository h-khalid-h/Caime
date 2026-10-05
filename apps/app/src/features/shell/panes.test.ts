import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The desktop panes and the tabs that show them are taken lazily from `panes.ts`, so none is in
 * the first download (CLAUDE.md). A static import of one of them anywhere would pull it, and
 * whatever it shares, into the startup chunk; this holds the rule.
 */
const src = join(__dirname, '..', '..');
const panes = readFileSync(join(__dirname, 'panes.ts'), 'utf8');
const lazyTargets = [...panes.matchAll(/import\('(@\/features\/[^']+)'\)/g)].flatMap((m) =>
  m[1] ? [m[1]] : [],
);

const files = readdirSync(src, { recursive: true })
  .map(String)
  .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));

describe('the panes stay out of the first download', () => {
  it('names at least the four panes', () => {
    expect(lazyTargets.length).toBeGreaterThanOrEqual(4);
  });

  it('nothing imports a pane statically', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(src, f), 'utf8');
      for (const target of lazyTargets) {
        if (new RegExp(`from '${target.replaceAll('/', '\\/')}'`).test(text))
          offenders.push(`${f} imports ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
