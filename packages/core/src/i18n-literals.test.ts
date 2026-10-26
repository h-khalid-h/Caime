/**
 * English nobody translated (R54): a sentence built from fragments (`\`${n} more\``), a template
 * handed to `tr` as its key, JSX text, a string of words shown as a child or in a field a person
 * reads, and (M16 E1) any string of words anywhere else that isn't the code's own (an import, a
 * key, a type, a comparison, a log), since a variable or a helper's argument reaches a person too. `node scripts/i18n-keys.mjs bare` lists them; what's on the list below is data
 * a person never reads as the interface's words (a header, an id, markup, a rule's own French,
 * an error thrown at a developer), and nothing else is.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bareLiterals } from '../../../scripts/i18n-keys.mjs';

const DATA: ReadonlyArray<[file: string, text: string]> = [
  ['apps/app/src/api/client.ts', 'Bearer {}'],
  ['apps/app/src/features/orgs/OrgCheckout.tsx', 'Stripe {}'],
  // A weekday a repeating plan names, said again for the date reader alone (M17 I9c).
  ['packages/core/src/card-offer.ts', 'on {}'],
  ['packages/core/src/contact-return.ts', 'caime contacts v1 {}'],
  ['packages/core/src/contact-sources.ts', 'HTTP {}'],
  ['packages/core/src/contact-sources.ts', 'Bearer {}'],
  ['packages/core/src/e2ee.ts', '{} device'],
  ['packages/core/src/e2ee.ts', 'Appareil {}'],
  ['packages/core/src/e2ee-recovery.ts', '{} recovery'],
  ['packages/core/src/ics.ts', 'Not a date: {}'],
  ['packages/core/src/ics.ts', 'An event needs a date or a start: {}'],
  ['packages/core/src/intelligence-fr.ts', 'revenir {}'],
  ['packages/core/src/intelligence-fr.ts', 'faire {}'],
  // A message's words as a rule writes them in its writer's own language (M16 G14): "tell Sami
  // to call me" goes as "Could you call me?", never in the reader's language.
  ['packages/core/src/chat-act.ts', 'Could you {}?'],
  ['packages/core/src/chat-act.ts', 'Tu peux {} ?'],
  // Words the code reads, never the interface's (M16 E1's wider rule): a print sheet's CSS, a
  // socket's close reason, the system monospace's names, a drive's own name, a feed's protocol line.
  [
    'apps/app/src/features/kits/ReceiptSheet.tsx',
    '@media print{body *{visibility:hidden!important}#caime-receipt,#caime-receipt *{visibility:visible!important}#caime-receipt{position:fixed;inset:0;padding:24px}}',
  ],
  ['apps/app/src/realtime/client.ts', 'signed out'],
  [
    'apps/app/src/theme/fonts.web.ts',
    'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  ],
  ['packages/core/src/accounts.ts', 'Google Drive'],
  ['packages/core/src/ics.ts', 'PRODID:-//Caime//Calendar feed//EN'],
];

describe('the interface’s words all go through tr', () => {
  // One walk of the whole tree (seconds, longer on a busy machine), read by both cases.
  let found: ReturnType<typeof bareLiterals> = [];
  beforeAll(() => {
    found = bareLiterals();
  }, 120_000);
  it('shows no English outside tr, trn or msg', () => {
    const bare = found.filter(
      (b) =>
        !b.text.startsWith('<svg') &&
        !DATA.some(([file, text]) => b.file === file && b.text === text),
    );
    expect(bare.map((b) => `${b.file}:${b.line} [${b.kind}] ${b.text}`)).toEqual([]);
  });
  it('keeps its list of data to what is still there', () => {
    const seen = new Set(found.map((b) => `${b.file} ${b.text}`));
    for (const [file, text] of DATA)
      expect(seen.has(`${file} ${text}`), `${file}: ${text}`).toBe(true);
  });
});
