/**
 * English nobody translated (R54): a sentence built from fragments (`\`${n} more\``), a template
 * handed to `tr` as its key, JSX text, or a string of words shown as a child or in a field a
 * person reads. `node scripts/i18n-keys.mjs bare` lists them; what's on the list below is data
 * a person never reads as the interface's words (a header, an id, markup, a rule's own French,
 * an error thrown at a developer), and nothing else is.
 */
import { describe, expect, it } from 'vitest';
import { bareLiterals } from '../../../scripts/i18n-keys.mjs';

const DATA: ReadonlyArray<[file: string, text: string]> = [
  ['apps/app/src/api/client.ts', 'Bearer {}'],
  ['apps/app/src/features/orgs/OrgCheckout.tsx', 'Stripe {}'],
  ['packages/core/src/e2ee-recovery.ts', '{} recovery'],
  ['packages/core/src/ics.ts', 'Not a date: {}'],
  ['packages/core/src/ics.ts', 'An event needs a date or a start: {}'],
  ['packages/core/src/intelligence-fr.ts', 'revenir {}'],
  ['packages/core/src/intelligence-fr.ts', 'faire {}'],
];

describe('the interface’s words all go through tr', () => {
  it('shows no English outside tr, trn or msg', () => {
    const bare = bareLiterals().filter(
      (b) =>
        !b.text.startsWith('<svg') &&
        !DATA.some(([file, text]) => b.file === file && b.text === text),
    );
    expect(bare.map((b) => `${b.file}:${b.line} [${b.kind}] ${b.text}`)).toEqual([]);
  });
  it('keeps its list of data to what is still there', () => {
    const seen = new Set(bareLiterals().map((b) => `${b.file} ${b.text}`));
    for (const [file, text] of DATA)
      expect(seen.has(`${file} ${text}`), `${file}: ${text}`).toBe(true);
  });
});
