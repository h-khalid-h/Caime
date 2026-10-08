import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The readers of typed dates and amounts (`@caime/core/when`, `amounts`, and the message
 * intelligence around them) know every interface language's dates. Imported statically by two
 * routes, they sat in the startup chunk (French and Turkish dates took it 2.9 KB over budget);
 * they're loaded when a form opens instead, through `lib/useReaders`. A type import costs nothing.
 */
const root = join(__dirname, '..');
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

describe('the readers', () => {
  it('are never imported statically, but through useReaders', () => {
    const wrong = sources(root).filter((path) => {
      if (relative(root, path) === join('lib', 'readers.ts')) return false;
      const text = readFileSync(path, 'utf8');
      return /^(?:import|export) (?!type )[^;]*from '@caime\/core\/(?:when|amounts|intelligence|latin-language)'/m.test(
        text,
      );
    });
    expect(wrong.map((p) => relative(root, p))).toEqual([]);
  });
});
