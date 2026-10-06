/**
 * Generates every brand asset from code (docs/BRAND.md): the wordmark from Nunito Black outlines,
 * the heart-with-a-face icon mark, the app icon set, splash, favicon and a review sheet.
 *
 *   pnpm --filter @caime/brand assets
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
/** Served at the web app's root (the export copies it): what the page's head links to. */
const webPublic = join(root, 'apps/app/public');

const INK = '#3B2E5B';
const PINK = '#FF8FB1';
const PINK_STRONG = '#C8285F';

const HEART =
  'M12 21.2s-8.6-5.2-10.6-10.3C0 7.1 2.4 3.6 6 3.6c2.2 0 3.7 1.2 4.6 2.6.3.5.6.9.9 1.4.3-.5.6-.9.9-1.4.9-1.4 2.4-2.6 4.6-2.6 3.6 0 6 3.5 4.6 7.3C20.6 16 12 21.2 12 21.2Z';

/**
 * The icon mark's face, in its 256 box: the favicon's heart and face, and the app's own mark
 * (`IconMark`), are drawn from this one description.
 */
const MARK = {
  viewBox: '0 0 256 256',
  heartTransform: 'translate(26 30) scale(8.5)',
  eyes: [
    { cx: 102, cy: 126, rx: 12, ry: 13 },
    { cx: 154, cy: 126, rx: 12, ry: 13 },
  ],
  glints: [
    { cx: 106, cy: 121, r: 4 },
    { cx: 158, cy: 121, r: 4 },
  ],
  smile: 'M114 150 q14 14 28 0',
  smileWidth: 8,
  cheeks: [
    { cx: 80, cy: 150, rx: 12, ry: 7 },
    { cx: 176, cy: 150, rx: 12, ry: 7 },
  ],
  cheekOpacity: 0.35,
};

function round(n: number) {
  return Math.round(n * 10) / 10;
}

async function buildWordmark() {
  const buf = await readFile(fontPath);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const size = 200;
  const tracking = -0.02 * size;
  const text = 'Caıme'; // dotless i: the heart is its dot
  let x = 0;
  const baseline = 200;
  const parts: string[] = [];
  let iBox: { x1: number; x2: number; y1: number } | null = null;
  // How far the letters reach below the baseline ("Caıme" has nothing that does).
  let bottom = baseline;
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    const path = glyph.getPath(x, baseline, size);
    parts.push(path.toPathData(1));
    bottom = Math.max(bottom, path.getBoundingBox().y2);
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
  const maxY = bottom + 4;
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
  const heartPath = `<path transform="${MARK.heartTransform}" d="${HEART}" fill="${fill}"${opts.monochrome ? ' mask="url(#m)"' : ''}/>`;
  const features = opts.monochrome
    ? ''
    : MARK.eyes
        .map(
          (e) =>
            `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="${faceColor}"/>`,
        )
        .join('') +
      MARK.glints
        .map((g) => `<circle cx="${g.cx}" cy="${g.cy}" r="${g.r}" fill="#FFFFFF"/>`)
        .join('') +
      `<path d="${MARK.smile}" stroke="${faceColor}" stroke-width="${MARK.smileWidth}" fill="none" stroke-linecap="round"/>` +
      MARK.cheeks
        .map(
          (c) =>
            `<ellipse cx="${c.cx}" cy="${c.cy}" rx="${c.rx}" ry="${c.ry}" fill="#FFFFFF" opacity="${MARK.cheekOpacity}"/>`,
        )
        .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${face}${bg}${heartPath}${features}</svg>`;
}

function appIconSvg() {
  // Light Pink tile (the boards' "light version") so Caishy's pink hood stands out.
  const character = characterSvg('caishy', { detail: true })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE3EC"/><stop offset="1" stop-color="#FFC7D8"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/><g transform="translate(24 30) scale(0.8125)">${character}</g></svg>`;
}

/** The app icon for masks (an installed web app on Android): the character inside the safe circle. */
function maskableIconSvg() {
  const inner = adaptiveForegroundSvg()
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE3EC"/><stop offset="1" stop-color="#FFC7D8"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/>${inner}</svg>`;
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

/** A .ico of PNGs (as browsers read them since Vista), for the few without SVG favicons. */
async function ico(svg: string, sizes: number[], file: string) {
  const images = await Promise.all(
    sizes.map((size) =>
      sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toBuffer(),
    ),
  );
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, i) => {
    const at = 6 + 16 * i;
    const size = sizes[i] as number;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(image.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += image.length;
  });
  await writeFile(file, Buffer.concat([header, ...images]));
}

/**
 * The card a shared link shows (Open Graph, 1200 x 630, R70): the desktop brand panel's three
 * friends under the wordmark on the soft pink, with no words to translate, since it's shown in
 * every language. Drawn at twice the size and brought down, so every edge stays sharp.
 */
async function socialCard(w: Awaited<ReturnType<typeof buildWordmark>>, file: string) {
  const [width, height, scale] = [1200, 630, 2];
  const draw = (svg: string, size: number) =>
    sharp(Buffer.from(svg), { density: 600 })
      .resize(size * scale, size * scale)
      .png()
      .toBuffer();
  const mark = await sharp(Buffer.from(wordmarkSvg(w, INK)), { density: 600 })
    .resize({ height: 132 * scale })
    .png()
    .toBuffer();
  const { width: markWidth = 0 } = await sharp(mark).metadata();
  const friends = [
    { name: 'momo', size: 196, expression: 'excited' },
    { name: 'caishy', size: 300, expression: 'happy' },
    { name: 'niko', size: 196, expression: 'wink' },
  ] as const;
  const gap = 12;
  const rowWidth = friends.reduce((n, f) => n + f.size, 0) + gap * (friends.length - 1);
  let left = (width - rowWidth) / 2;
  const base = 560;
  const layers = [
    { input: mark, top: 70 * scale, left: Math.round((width * scale - markWidth) / 2) },
  ];
  for (const f of friends) {
    layers.push({
      input: await draw(characterSvg(f.name, { expression: f.expression, detail: true }), f.size),
      top: (base - f.size) * scale,
      left: Math.round(left * scale),
    });
    left += f.size + gap;
  }
  const large = await sharp({
    create: { width: width * scale, height: height * scale, channels: 4, background: '#FFD6E7' },
  })
    .composite(layers)
    .png()
    .toBuffer();
  await sharp(large).resize(width, height).png({ compressionLevel: 9 }).toFile(file);
}

async function main() {
  await mkdir(appAssets, { recursive: true });
  await mkdir(generated, { recursive: true });
  const w = await buildWordmark();

  await writeFile(
    join(generated, 'wordmark.ts'),
    `// Generated by scripts/build-assets.mts from Nunito Black. Do not edit.\nexport const WORDMARK = ${JSON.stringify(w, null, 2)} as const;\nexport const HEART_PATH = ${JSON.stringify(HEART)};\nexport const ICON_MARK = ${JSON.stringify(MARK, null, 2)} as const;\n`,
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
    const svg = raw.replace(/^<svg([^>]*)>/, '<svg$1 role="img"><title>Caime</title>');
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

  // The web app's root: a vector favicon (sharp at any size and density), the home screen icon
  // iOS asks for, the notification icon, and the install manifest's icons.
  await mkdir(webPublic, { recursive: true });
  await writeFile(
    join(webPublic, 'favicon.svg'),
    iconMarkSvg().replace(/^<svg([^>]*)>/, '<svg$1 role="img"><title>Caime</title>'),
  );
  await ico(iconMarkSvg(), [16, 32, 48], join(webPublic, 'favicon.ico'));
  await png(appIconSvg(), 180, join(webPublic, 'apple-touch-icon.png'));
  await png(appIconSvg(), 192, join(webPublic, 'icon-192.png'));
  await png(appIconSvg(), 512, join(webPublic, 'icon-512.png'));
  await png(maskableIconSvg(), 512, join(webPublic, 'icon-maskable-512.png'));
  await png(iconMarkSvg({ monochrome: true }), 96, join(webPublic, 'notification-icon.png'));
  await socialCard(w, join(webPublic, 'og-card.png'));

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

  // Stripe's branding (Settings → Branding): a square icon at least 128 px and a logo, each a
  // PNG under 512 KB. The logo sits on the brand colour (INK) in Checkout, the consent page and
  // receipts, so it's the reversed wordmark with room around it; a plain one for a light colour.
  const stripe = join(docsAssets, 'stripe');
  await mkdir(stripe, { recursive: true });
  // The heart mark, never a character: Checkout and receipts are money surfaces (BRAND.md B2).
  await png(iconMarkSvg(), 512, join(stripe, 'stripe-icon.png'));
  for (const [name, color] of [
    ['stripe-logo.png', '#FFFFFF'],
    ['stripe-logo-dark.png', INK],
  ] as const) {
    const mark = await sharp(Buffer.from(wordmarkSvg(w, color)), { density: 300 })
      .resize({ height: 200 })
      .png()
      .toBuffer();
    const { width = 0 } = await sharp(mark).metadata();
    await sharp({
      create: {
        width: width + 120,
        height: 320,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: mark, top: 60, left: 60 }])
      .png()
      .toFile(join(stripe, name));
  }
  console.log('brand assets written');
}

await main();
