import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Query keys live in `qk` (keys.ts), so a live event invalidates exactly what it changes. */
describe('query keys', () => {
  it('are never written by hand outside keys.ts', () => {
    const src = join(__dirname, '..');
    const offenders = readdirSync(src, { recursive: true })
      .map(String)
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts') && f !== join('api', 'keys.ts'))
      .filter((f) => /queryKey: \[/.test(readFileSync(join(src, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
