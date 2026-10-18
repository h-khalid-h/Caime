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
/**
 * Loaded apart as well (R77's budget), each by its one dynamic import: what the first screen
 * never needs. `leftConversation` is reached through `realtime/client`, never `realtime/apply`.
 */
const APART: Array<[module: string, importer: string]> = [
  ['@/realtime/apply', 'realtime/client.ts'],
  ['./apply', 'realtime/client.ts'],
  ['@/features/shell/shortcuts', 'app/(app)/_layout.tsx'],
  ['./YouSheetBody', 'features/shell/YouButton.tsx'],
  ['@/features/shell/YouSheetBody', 'features/shell/YouButton.tsx'],
  ['./OrgDetails', 'features/orgs/OrgScreen.tsx'],
  ['@/features/orgs/OrgDetails', 'features/orgs/OrgScreen.tsx'],
];

/**
 * Shared by several screens and needed by none at first, so each loads it with `lazyPart` (a
 * part) or `import()` (a function) (R79's budget trim): a static import anywhere would put it
 * back in the shared startup chunk.
 */
const LAZY_EVERYWHERE = [
  '@/features/people/PeoplePicker',
  '@/features/geo/TimeZoneField',
  '@/features/people/generalInvite',
  '@/features/join/JoinLinks',
  '@/features/join/JoinRequests',
];

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

  it('nothing imports statically what every screen loads lazily', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(src, f), 'utf8');
      for (const target of LAZY_EVERYWHERE)
        if (new RegExp(`from '${target.replaceAll('/', '\\/')}'`).test(text))
          offenders.push(`${f} imports ${target} statically (lazyPart it)`);
    }
    expect(offenders).toEqual([]);
  });

  it('nothing imports statically what loads apart', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(src, f), 'utf8');
      for (const [target, importer] of APART) {
        const relative = target.startsWith('./');
        if (relative && !f.startsWith(importer.slice(0, importer.lastIndexOf('/')))) continue;
        if (new RegExp(`from '${target.replaceAll('/', '\\/').replace('.', '\\.')}'`).test(text))
          offenders.push(`${f} imports ${target} (only ${importer} may, and only dynamically)`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
