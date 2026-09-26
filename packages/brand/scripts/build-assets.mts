/**
 * Generates every brand asset from code (docs/BRAND.md): the wordmark from Nunito Black outlines,
 * the heart-with-a-face icon mark, the app icon set, splash, favicon and a review sheet.
 *
 *   pnpm --filter @caishy/brand assets
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import sharp from 'sharp';
import { characterSvg } from '../src/characters.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const fontPath = join(root, 'node_modules/@expo-google-fonts/nunito/900Black/Nunito_900Black.ttf');
const appAssets = join(root, 'apps/app/assets/brand');
const docsAssets = join(root, 'docs/brand');
const generated = join(here, '..', 'src', 'generated');

const INK = '#3B2E5B';
const PINK = '#FF8FB1';
const PINK_STRONG = '#C8285F';

const HEART =
  'M12 21.2s-8.6-5.2-10.6-10.3C0 7.1 2.4 3.6 6 3.6c2.2 0 3.7 1.2 4.6 2.6.3.5.6.9.9 1.4.3-.5.6-.9.9-1.4.9-1.4 2.4-2.6 4.6-2.6 3.6 0 6 3.5 4.6 7.3C20.6 16 12 21.2 12 21.2Z';

function round(n: number) {
  return Math.round(n * 10) / 10;
}

async function buildWordmark() {
  const buf = await readFile(fontPath);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const size = 200;
  const tracking = -0.02 * size;
  const text = 'Caıshy'; // dotless i: the heart is its dot
  let x = 0;
  const baseline = 200;
  const parts: string[] = [];
  let iBox: { x1: number; x2: number; y1: number } | null = null;
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    const path = glyph.getPath(x, baseline, size);
    parts.push(path.toPathData(1));
    if (ch === 'ı') {
      const b = path.getBoundingBox();
      iBox = { x1: b.x1, x2: b.x2, y1: b.y1 };
    }
    x += (glyph.advanceWidth ?? 0) * (size / font.unitsPerEm) + tracking;
  }
  const letters = parts.join(' ');
  if (!iBox) throw new Error('no dotless i');
  const stem = iBox.x2 - iBox.x1;
  const heartSize = stem * 1.9;
  const heartScale = heartSize / 24;
  const heartCx = (iBox.x1 + iBox.x2) / 2;
  // Sit the heart where the dot of an "i" would be: just above the top of the stem.
  const heartCy = iBox.y1 - stem * 0.42 - heartSize * 0.42;
  const heartTransform = `translate(${round(heartCx - 12 * heartScale)} ${round(heartCy - 11 * heartScale)}) scale(${round(heartScale * 1000) / 1000})`;
  // Tight box around letters and heart.
  const minX = -4;
  const maxX = x - tracking + 4;
  const minY = heartCy - heartSize * 0.55;
  const descender = Math.abs((font.descender ?? -250) * (size / font.unitsPerEm));
  const maxY = baseline + descender * 0.95;
  const viewBox = `${round(minX)} ${round(minY)} ${round(maxX - minX)} ${round(maxY - minY)}`;
  return {
    letters,
    heartTransform,
    viewBox,
    width: round(maxX - minX),
    height: round(maxY - minY),
  };
}

function wordmarkSvg(
  w: Awaited<ReturnType<typeof buildWordmark>>,
  letterColor: string,
  heartColor = PINK,
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${w.viewBox}"><path d="${w.letters}" fill="${letterColor}"/><path transform="${w.heartTransform}" d="${HEART}" fill="${heartColor}"/></svg>`;
}

/** The icon mark: a heart with a face (board v2), for favicons and tiny sizes. */
function iconMarkSvg(
  opts: { fill?: string; face?: string; background?: string | null; monochrome?: boolean } = {},
) {
  const fill = opts.monochrome ? '#FFFFFF' : (opts.fill ?? PINK);
  const faceColor = opts.monochrome ? '#000000' : (opts.face ?? '#FFFFFF');
  const bg = opts.background ? `<rect width="256" height="256" fill="${opts.background}"/>` : '';
  const face = opts.monochrome
    ? // Monochrome icons use alpha only: cut the face out of the heart.
      `<mask id="m"><rect width="256" height="256" fill="#fff"/><circle cx="102" cy="126" r="11" fill="#000"/><circle cx="154" cy="126" r="11" fill="#000"/><path d="M114 150 q14 14 28 0" stroke="#000" stroke-width="9" fill="none" stroke-linecap="round"/></mask>`
    : '';
  const heartPath = `<path transform="translate(26 30) scale(8.5)" d="${HEART}" fill="${fill}"${opts.monochrome ? ' mask="url(#m)"' : ''}/>`;
  const features = opts.monochrome
    ? ''
    : `<ellipse cx="102" cy="126" rx="12" ry="13" fill="${faceColor}"/><ellipse cx="154" cy="126" rx="12" ry="13" fill="${faceColor}"/>` +
      `<circle cx="106" cy="121" r="4" fill="#FFFFFF"/><circle cx="158" cy="121" r="4" fill="#FFFFFF"/>` +
      `<path d="M114 150 q14 14 28 0" stroke="${faceColor}" stroke-width="8" fill="none" stroke-linecap="round"/>` +
      `<ellipse cx="80" cy="150" rx="12" ry="7" fill="#FFFFFF" opacity="0.35"/><ellipse cx="176" cy="150" rx="12" ry="7" fill="#FFFFFF" opacity="0.35"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${face}${bg}${heartPath}${features}</svg>`;
}

function appIconSvg() {
  // Light Pink tile (the boards' "light version") so Caishy's pink hood stands out.
  const character = characterSvg('caishy', { detail: true })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE3EC"/><stop offset="1" stop-color="#FFC7D8"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/><g transform="translate(24 30) scale(0.8125)">${character}</g></svg>`;
}

function adaptiveForegroundSvg() {
  const character = characterSvg('caishy', { detail: true })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
  // Android keeps the middle 66% visible under any mask.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g transform="translate(50 52) scale(0.61)">${character}</g></svg>`;
}

async function png(svg: string, size: number, file: string) {
  await mkdir(dirname(file), { recursive: true });
  await sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toFile(file);
}

async function main() {
  await mkdir(appAssets, { recursive: true });
  await mkdir(generated, { recursive: true });
  const w = await buildWordmark();

  await writeFile(
    join(generated, 'wordmark.ts'),
    `// Generated by scripts/build-assets.mts from Nunito Black. Do not edit.\nexport const WORDMARK = ${JSON.stringify(w, null, 2)} as const;\nexport const HEART_PATH = ${JSON.stringify(HEART)};\n`,
  );

  const svgs: Record<string, string> = {
    'wordmark.svg': wordmarkSvg(w, INK),
    'wordmark-reversed.svg': wordmarkSvg(w, '#FFFFFF'),
    'wordmark-pink.svg': wordmarkSvg(w, PINK_STRONG),
    'mark.svg': iconMarkSvg(),
    'app-icon.svg': appIconSvg(),
  };
  for (const [name, raw] of Object.entries(svgs)) {
    // Standalone files carry an accessible name; inline uses set their own.
    const svg = raw.replace(/^<svg([^>]*)>/, '<svg$1 role="img"><title>Caishy</title>');
    await writeFile(join(docsAssets, name), svg);
    await writeFile(join(appAssets, name), svg);
  }

  await png(appIconSvg(), 1024, join(appAssets, 'icon.png'));
  await png(adaptiveForegroundSvg(), 1024, join(appAssets, 'adaptive-foreground.png'));
  await png(iconMarkSvg({ monochrome: true }), 1024, join(appAssets, 'adaptive-monochrome.png'));
  await png(iconMarkSvg(), 256, join(appAssets, 'favicon.png'));
  await png(iconMarkSvg({ monochrome: true }), 96, join(appAssets, 'notification-icon.png'));
  await png(characterSvg('caishy', { detail: true }), 1024, join(appAssets, 'splash.png'));
  // Web app manifest icons.
  await png(appIconSvg(), 192, join(appAssets, 'icon-192.png'));
  await png(appIconSvg(), 512, join(appAssets, 'icon-512.png'));

  // Review sheet: wordmarks on light and dark, the icon mark and the app icon.
  const wordmarkPng = await sharp(Buffer.from(wordmarkSvg(w, INK)), { density: 300 })
    .resize({ width: 720 })
    .png()
    .toBuffer();
  const reversedPng = await sharp(Buffer.from(wordmarkSvg(w, '#FFFFFF')), { density: 300 })
    .resize({ width: 720 })
    .png()
    .toBuffer();
  const iconPng = await sharp(Buffer.from(appIconSvg())).resize(300, 300).png().toBuffer();
  const markPng = await sharp(Buffer.from(iconMarkSvg())).resize(160, 160).png().toBuffer();
  const sheet = sharp({
    create: { width: 1600, height: 760, channels: 4, background: '#FAF8FC' },
  }).composite([
    {
      input: Buffer.from(
        `<svg width="1600" height="760"><rect x="0" y="380" width="1600" height="380" fill="#3B2E5B"/></svg>`,
      ),
      top: 0,
      left: 0,
    },
    { input: wordmarkPng, top: 80, left: 60 },
    { input: reversedPng, top: 460, left: 60 },
    { input: iconPng, top: 40, left: 1220 },
    { input: markPng, top: 520, left: 1300 },
  ]);
  await sheet.png().toFile(join(docsAssets, 'brand-sheet.png'));
  console.log('brand assets written');
}

await main();
