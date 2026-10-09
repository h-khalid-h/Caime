// The web's fonts (R69, R73): the WOFF2 cuts Fontsource makes of the brand's faces, copied into
// apps/app/public/fonts, and the shell's `caime-fonts` block in apps/app/public/index.html
// written from them, so a face is added here, once, never by hand. The app on the web and the
// server's own pages ask for the two families by name, `Inter` and `Nunito`, and the browser
// picks the file by weight and by the letters drawn (`unicode-range`): Latin from Inter and
// Nunito, Arabic from the faces paired with them, Noto Sans Arabic and Baloo Bhaijaan 2, so an
// Arabic reader downloads those and nobody else does. `theme/fonts.test.ts` holds the type scale
// to what's declared. Run: `pnpm fonts`.

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packages = join(root, 'node_modules', '@fontsource');
const fonts = join(root, 'apps', 'app', 'public', 'fonts');
const shell = join(root, 'apps', 'app', 'public', 'index.html');

/**
 * Each face: the family the app asks for, the Fontsource package that draws it, which cuts, at
 * which weights; `as` names a file's weight under another the type scale asks for (Nunito 900
 * is Baloo Bhaijaan 2's 800, its heaviest).
 */
const FACES = [
  { family: 'Inter', pkg: 'inter', subsets: ['latin-ext', 'latin'], weights: [400, 500, 600, 700] },
  {
    family: 'Nunito',
    pkg: 'nunito',
    subsets: ['latin-ext', 'latin'],
    weights: [600, 700, 800, 900],
  },
  // Arabic (R73): paired with the Latin faces under their names, by unicode-range.
  { family: 'Inter', pkg: 'noto-sans-arabic', subsets: ['arabic'], weights: [400, 500, 600, 700] },
  {
    family: 'Nunito',
    pkg: 'baloo-bhaijaan-2',
    subsets: ['arabic'],
    weights: [600, 700, 800],
    as: { 800: [800, 900] },
  },
];

/** The unicode-range Fontsource declares for a package's cut, read from its own CSS. */
function rangeOf(pkg, subset, weight) {
  const css = readFileSync(join(packages, pkg, `${weight}.css`), 'utf8');
  const block = css
    .split('@font-face')
    .find((b) => b.includes(`${pkg}-${subset}-${weight}-normal.woff2`));
  const range = /unicode-range:\s*([^;]+);/.exec(block ?? '')?.[1];
  if (!range) throw new Error(`no unicode-range for ${pkg} ${subset} ${weight}`);
  return range.replace(/\s+/g, ' ').trim();
}

const rules = [];
for (const face of FACES) {
  copyFileSync(join(packages, face.pkg, 'LICENSE'), join(fonts, `LICENSE-${face.pkg}.txt`));
  for (const weight of face.weights)
    for (const subset of face.subsets) {
      const file = `${face.pkg}-${subset}-${weight}-normal.woff2`;
      copyFileSync(join(packages, face.pkg, 'files', file), join(fonts, file));
      const range = rangeOf(face.pkg, subset, weight);
      for (const declared of face.as?.[weight] ?? [weight])
        rules.push(
          [
            '      @font-face {',
            `        font-family: '${face.family}';`,
            '        font-style: normal;',
            `        font-weight: ${declared};`,
            '        font-display: swap;',
            `        src: url(/fonts/${file}) format('woff2');`,
            `        unicode-range: ${range};`,
            '      }',
          ].join('\n'),
        );
    }
}

const html = readFileSync(shell, 'utf8');
const block = `<style id="caime-fonts">\n${rules.join('\n')}\n    </style>`;
const next = html.replace(/<style id="caime-fonts">[\s\S]*?<\/style>/, block);
if (!next.includes(block)) throw new Error('index.html has no caime-fonts block');
writeFileSync(shell, next);
console.log(`${rules.length} faces declared from ${FACES.length} packages`);
