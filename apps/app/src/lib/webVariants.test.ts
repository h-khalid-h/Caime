import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Packages the web never runs (a phone's haptics, its keychain, AsyncStorage) are reached only
 * through a module with a `.web` twin, or from a phone's own file, so not a byte of them is in the
 * web's first download (M16 G9: 2.5 KB gzip of the startup chunk). A new import of one anywhere
 * else would put it back.
 */
const NATIVE_ONLY = [
  'expo-haptics',
  'expo-secure-store',
  '@react-native-async-storage/async-storage',
];
const src = join(__dirname, '..');
const files = readdirSync(src, { recursive: true })
  .map(String)
  .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));

describe('what the web never runs stays off it', () => {
  it('imports a native-only package only beside a .web twin, or in a phone’s own file', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(src, f), 'utf8');
      for (const pkg of NATIVE_ONLY) {
        if (!text.includes(`from '${pkg}'`)) continue;
        const native = /\.native\.tsx?$/.test(f);
        const twin = f.replace(/\.tsx?$/, (ext) => `.web${ext}`);
        if (!native && !existsSync(join(src, twin))) offenders.push(`${f} imports ${pkg}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
