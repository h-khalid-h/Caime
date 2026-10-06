import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Each icon is imported where it's used, one file each (`lucide-react-native/icons/<name>`):
 * the package root would pull in every icon there is, and a module that re-exports icons puts
 * every one of them in the startup chunk, wherever they're used (it cost 2.4 KB gzip).
 */
const root = join(__dirname, '..');
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });

describe('icons', () => {
  it('come one file each, straight from their own module', () => {
    const wrong = sources(root).filter((path) => {
      const text = readFileSync(path, 'utf8');
      return (
        /from 'lucide-react-native'/.test(text) ||
        /export \{[^}]*\} from 'lucide-react-native\//.test(text)
      );
    });
    expect(wrong).toEqual([]);
  });
});
