/**
 * The Caishy Friends as vector art (docs/BRAND.md "Characters"). Flat recreations of the brand
 * boards' characters, built from shared parts so every size — app icon, sticker, empty state —
 * stays consistent. Each builder returns SVG markup for a 256×256 viewBox.
 */

export const CHARACTERS = ['caishy', 'momo', 'panda', 'lumi', 'pico', 'niko', 'zuzu'] as const;
export type Character = (typeof CHARACTERS)[number];

export const EXPRESSIONS = [
  'happy',
  'wink',
  'excited',
  'curious',
  'sad',
  'surprised',
  'sleepy',
  'grumpy',
  'shy',
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export const CHARACTER_INFO: Record<
  Character,
  { name: string; trait: string; line: string; color: string }
> = {
  caishy: {
    name: 'Caishy',
    trait: 'The Dreamer',
    line: 'Always finds kindness.',
    color: '#FF8FB1',
  },
  momo: { name: 'Momo', trait: 'The Cheerful', line: 'Spreads joy everywhere.', color: '#FFD166' },
  panda: { name: 'Panda', trait: 'The Loyal', line: 'Always by your side.', color: '#3B2E5B' },
  lumi: { name: 'Lumi', trait: 'The Creative', line: 'Turns ideas into magic.', color: '#C8B4FF' },
  pico: { name: 'Pico', trait: 'The Curious', line: 'Asks the best questions.', color: '#A7F3D0' },
  niko: { name: 'Niko', trait: 'The Brave', line: 'Faces new adventures.', color: '#7DD3FC' },
  zuzu: { name: 'Zuzu', trait: 'The Wise', line: 'Sees the good in everything.', color: '#F2DDB5' },
};

const INK = '#2B2340';
const BLUSH = '#FF8FB1';
const WHITE = '#FFFFFF';

interface FaceOpts {
  cx: number;
  cy: number;
  spread: number;
  eye: number;
  expression: Expression;
  /** Dark patches behind the eyes (Panda) need white highlights to stay visible. */
  onDark?: boolean;
  blush?: string;
  mouthY?: number;
  beak?: string;
}

function eyes({ cx, cy, spread, eye, expression, onDark }: FaceOpts): string {
  const lx = cx - spread;
  const rx = cx + spread;
  const openEye = (x: number, big = 1) =>
    `<ellipse cx="${x}" cy="${cy}" rx="${eye * 0.85 * big}" ry="${eye * big}" fill="${INK}"/>` +
    `<circle cx="${x + eye * 0.32}" cy="${cy - eye * 0.38}" r="${eye * 0.36 * big}" fill="${WHITE}"/>` +
    `<circle cx="${x - eye * 0.3}" cy="${cy + eye * 0.35}" r="${eye * 0.16 * big}" fill="${WHITE}" opacity="0.9"/>`;
  const arc = (x: number, up: boolean) =>
    `<path d="M ${x - eye} ${cy} Q ${x} ${up ? cy - eye * 1.2 : cy + eye * 1.1} ${x + eye} ${cy}" fill="none" stroke="${onDark ? WHITE : INK}" stroke-width="${eye * 0.42}" stroke-linecap="round"/>`;
  switch (expression) {
    case 'wink':
      return arc(lx, true) + openEye(rx);
    case 'excited':
    case 'shy':
      return arc(lx, true) + arc(rx, true);
    case 'sleepy':
      return arc(lx, false) + arc(rx, false);
    case 'surprised':
      return openEye(lx, 1.12) + openEye(rx, 1.12);
    case 'grumpy':
      return (
        openEye(lx, 0.9) +
        openEye(rx, 0.9) +
        `<path d="M ${lx - eye} ${cy - eye * 1.7} L ${lx + eye * 0.8} ${cy - eye * 1.15}" stroke="${onDark ? WHITE : INK}" stroke-width="${eye * 0.36}" stroke-linecap="round"/>` +
        `<path d="M ${rx + eye} ${cy - eye * 1.7} L ${rx - eye * 0.8} ${cy - eye * 1.15}" stroke="${onDark ? WHITE : INK}" stroke-width="${eye * 0.36}" stroke-linecap="round"/>`
      );
    case 'sad':
      return (
        openEye(lx) +
        openEye(rx) +
        `<path d="M ${rx + eye * 0.9} ${cy + eye * 0.8} q ${eye * 0.5} ${eye * 0.9} 0 ${eye * 1.3} q ${-eye * 0.5} ${-eye * 0.4} 0 ${-eye * 1.3} z" fill="#7DD3FC"/>`
      );
    default:
      return openEye(lx) + openEye(rx);
  }
}

function mouth({ cx, cy, eye, expression, mouthY, beak }: FaceOpts): string {
  const y = mouthY ?? cy + eye * 1.9;
  const w = eye * 0.9;
  if (beak) {
    const open = expression === 'excited' || expression === 'surprised' || expression === 'happy';
    return (
      `<path d="M ${cx - w * 1.1} ${y - w * 0.3} Q ${cx} ${y - w * 1.1} ${cx + w * 1.1} ${y - w * 0.3} Q ${cx} ${y + w * 0.5} ${cx - w * 1.1} ${y - w * 0.3} z" fill="${beak}"/>` +
      (open
        ? `<path d="M ${cx - w * 0.8} ${y - w * 0.1} Q ${cx} ${y + w * 1.1} ${cx + w * 0.8} ${y - w * 0.1} z" fill="#F07A3A"/>`
        : '')
    );
  }
  const stroke = `stroke="${INK}" stroke-width="${eye * 0.3}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  switch (expression) {
    case 'excited':
    case 'happy':
      return `<path d="M ${cx - w} ${y - w * 0.2} Q ${cx} ${y + w * 1.5} ${cx + w} ${y - w * 0.2} Z" fill="#E0457B"/><path d="M ${cx - w * 0.55} ${y + w * 0.55} Q ${cx} ${y + w * 0.1} ${cx + w * 0.55} ${y + w * 0.55}" fill="#FF9CC0"/>`;
    case 'surprised':
      return `<ellipse cx="${cx}" cy="${y + w * 0.2}" rx="${w * 0.45}" ry="${w * 0.6}" fill="#E0457B"/>`;
    case 'sad':
    case 'grumpy':
      return `<path d="M ${cx - w * 0.7} ${y + w * 0.4} Q ${cx} ${y - w * 0.4} ${cx + w * 0.7} ${y + w * 0.4}" ${stroke}/>`;
    case 'sleepy':
      return `<ellipse cx="${cx}" cy="${y + w * 0.1}" rx="${w * 0.3}" ry="${w * 0.24}" fill="#E0457B"/>`;
    default:
      // The little "ω" cat mouth.
      return `<path d="M ${cx - w} ${y - w * 0.15} Q ${cx - w * 0.5} ${y + w * 0.6} ${cx} ${y - w * 0.1} Q ${cx + w * 0.5} ${y + w * 0.6} ${cx + w} ${y - w * 0.15}" ${stroke}/>`;
  }
}

function cheeks({ cx, cy, spread, eye, blush, expression }: FaceOpts): string {
  const color = blush ?? BLUSH;
  const o = expression === 'shy' ? 0.75 : 0.5;
  const y = cy + eye * 1.4;
  return (
    `<ellipse cx="${cx - spread - eye * 1.1}" cy="${y}" rx="${eye * 1.05}" ry="${eye * 0.62}" fill="${color}" opacity="${o}"/>` +
    `<ellipse cx="${cx + spread + eye * 1.1}" cy="${y}" rx="${eye * 1.05}" ry="${eye * 0.62}" fill="${color}" opacity="${o}"/>`
  );
}

function face(o: FaceOpts): string {
  return cheeks(o) + eyes(o) + mouth(o);
}

function extras(expression: Expression): string {
  switch (expression) {
    case 'curious':
      return `<text x="206" y="70" font-family="Nunito, Arial Rounded MT Bold, sans-serif" font-weight="900" font-size="54" fill="${INK}">?</text>`;
    case 'sleepy':
      return `<text x="190" y="62" font-family="Nunito, sans-serif" font-weight="900" font-size="30" fill="${INK}">z</text><text x="212" y="40" font-family="Nunito, sans-serif" font-weight="900" font-size="22" fill="${INK}">z</text>`;
    case 'shy':
    case 'excited':
      return heart(210, 50, 22, '#FF6FA0');
    case 'surprised':
      return `<path d="M 214 30 l -8 26 M 230 42 l -18 20" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
    default:
      return '';
  }
}

export function heart(cx: number, cy: number, size: number, color = '#FF8FB1'): string {
  const s = size / 24;
  return `<path transform="translate(${cx - 12 * s} ${cy - 11 * s}) scale(${s})" d="M12 21.2s-8.6-5.2-10.6-10.3C0 7.1 2.4 3.6 6 3.6c2.2 0 3.7 1.2 4.6 2.6.3.5.6.9.9 1.4.3-.5.6-.9.9-1.4.9-1.4 2.4-2.6 4.6-2.6 3.6 0 6 3.5 4.6 7.3C20.6 16 12 21.2 12 21.2Z" fill="${color}"/>`;
}

// --- Characters ----------------------------------------------------------------------------------

function caishy(expression: Expression, detail: boolean): string {
  const pink = '#FF8FB1';
  const pinkDeep = '#F7739C';
  const inner = '#FFD6E7';
  return (
    // Ears of the hood
    `<path d="M44 118 Q34 50 70 30 Q98 48 116 72 Z" fill="${pink}"/>` +
    `<path d="M212 118 Q222 50 186 30 Q158 48 140 72 Z" fill="${pink}"/>` +
    `<path d="M58 104 Q54 62 74 48 Q90 60 102 76 Z" fill="${inner}"/>` +
    `<path d="M198 104 Q202 62 182 48 Q166 60 154 76 Z" fill="${inner}"/>` +
    // Hood
    `<ellipse cx="128" cy="146" rx="102" ry="92" fill="${pink}"/>` +
    `<ellipse cx="128" cy="232" rx="70" ry="10" fill="${pinkDeep}" opacity="0.35"/>` +
    // Face
    `<ellipse cx="128" cy="162" rx="80" ry="67" fill="${WHITE}"/>` +
    (detail
      ? // The little face emblem on the hood (board v3).
        `<rect x="104" y="72" width="48" height="24" rx="12" fill="${inner}"/>` +
        `<circle cx="117" cy="84" r="3" fill="${INK}"/><circle cx="139" cy="84" r="3" fill="${INK}"/>` +
        `<path d="M124 88 q4 4 8 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
      : '') +
    face({ cx: 128, cy: 158, spread: 32, eye: 14, expression })
  );
}

function momo(expression: Expression): string {
  const y = '#FFD166';
  const yDeep = '#F4B942';
  return (
    `<path d="M120 44 Q112 16 128 12 Q138 30 132 46 Z" fill="${yDeep}"/>` +
    `<path d="M132 46 Q144 20 160 26 Q156 44 138 52 Z" fill="${y}"/>` +
    `<path d="M120 46 Q100 26 90 36 Q98 50 118 54 Z" fill="${y}"/>` +
    `<circle cx="128" cy="140" r="98" fill="${y}"/>` +
    `<ellipse cx="128" cy="200" rx="70" ry="34" fill="${yDeep}" opacity="0.35"/>` +
    face({ cx: 128, cy: 132, spread: 36, eye: 14, expression, beak: '#FF9F43', mouthY: 166 })
  );
}

function panda(expression: Expression): string {
  const open = !['wink', 'excited', 'shy', 'sleepy'].includes(expression);
  return (
    `<circle cx="58" cy="62" r="34" fill="${INK}"/><circle cx="198" cy="62" r="34" fill="${INK}"/>` +
    `<circle cx="128" cy="140" r="100" fill="${WHITE}" stroke="#EDE8F4" stroke-width="4"/>` +
    `<ellipse cx="92" cy="136" rx="28" ry="34" transform="rotate(-22 92 136)" fill="${INK}"/>` +
    `<ellipse cx="164" cy="136" rx="28" ry="34" transform="rotate(22 164 136)" fill="${INK}"/>` +
    // White rings so open eyes read on the dark patches.
    (open
      ? `<circle cx="94" cy="134" r="15" fill="${WHITE}"/><circle cx="162" cy="134" r="15" fill="${WHITE}"/>`
      : '') +
    `<ellipse cx="128" cy="166" rx="11" ry="7" fill="${INK}"/>` +
    face({ cx: 128, cy: 134, spread: 34, eye: 11, expression, onDark: !open, mouthY: 182 })
  );
}

function lumi(expression: Expression): string {
  const lilac = '#C8B4FF';
  const inner = '#F1E8FF';
  return (
    `<path d="M78 104 Q54 30 84 18 Q108 32 108 96 Z" fill="${lilac}"/>` +
    `<path d="M178 104 Q202 30 172 18 Q148 32 148 96 Z" fill="${lilac}"/>` +
    `<path d="M86 94 Q72 44 88 34 Q100 46 100 90 Z" fill="${inner}"/>` +
    `<path d="M170 94 Q184 44 168 34 Q156 46 156 90 Z" fill="${inner}"/>` +
    `<circle cx="128" cy="150" r="94" fill="${lilac}"/>` +
    `<ellipse cx="128" cy="162" rx="70" ry="58" fill="#E9D5FF"/>` +
    `<path transform="translate(128 92)" d="M0 -14 L4 -4 L14 -4 L6 3 L9 13 L0 7 L-9 13 L-6 3 L-14 -4 L-4 -4 Z" fill="#FFD166"/>` +
    face({ cx: 128, cy: 158, spread: 32, eye: 14, expression })
  );
}

function pico(expression: Expression): string {
  const mint = '#A7F3D0';
  const deep = '#6EE7B7';
  return (
    `<path d="M128 50 Q126 30 140 20" stroke="#10B981" stroke-width="6" fill="none" stroke-linecap="round"/>` +
    `<path d="M140 22 Q160 10 168 26 Q152 38 140 22 Z" fill="#34D399"/>` +
    `<path d="M136 30 Q116 16 106 30 Q122 42 136 30 Z" fill="#6EE7B7"/>` +
    `<circle cx="60" cy="84" r="24" fill="${deep}"/><circle cx="196" cy="84" r="24" fill="${deep}"/>` +
    `<circle cx="128" cy="146" r="98" fill="${mint}"/>` +
    `<ellipse cx="128" cy="206" rx="64" ry="26" fill="${deep}" opacity="0.35"/>` +
    face({ cx: 128, cy: 146, spread: 34, eye: 14, expression })
  );
}

function niko(expression: Expression): string {
  const blue = '#7DD3FC';
  return (
    `<path d="M126 46 Q120 24 136 14 Q142 32 136 48 Z" fill="#38BDF8"/>` +
    `<circle cx="128" cy="144" r="100" fill="${blue}"/>` +
    `<path d="M128 214 C 70 214 52 168 60 138 C 66 112 92 104 128 128 C 164 104 190 112 196 138 C 204 168 186 214 128 214 Z" fill="${WHITE}"/>` +
    face({ cx: 128, cy: 148, spread: 32, eye: 14, expression, beak: '#FF9F43', mouthY: 180 })
  );
}

function zuzu(expression: Expression): string {
  const wool = '#FFF7E9';
  const edge = '#F2DDB5';
  const puffs = [
    [128, 56],
    [84, 70],
    [172, 70],
    [56, 108],
    [200, 108],
    [48, 152],
    [208, 152],
    [66, 192],
    [190, 192],
    [104, 216],
    [152, 216],
  ]
    .map(
      ([x, y]) =>
        `<circle cx="${x}" cy="${y}" r="34" fill="${wool}" stroke="${edge}" stroke-width="5"/>`,
    )
    .join('');
  return (
    puffs +
    `<circle cx="128" cy="140" r="86" fill="${wool}"/>` +
    `<ellipse cx="46" cy="140" rx="22" ry="12" fill="${edge}" transform="rotate(-20 46 140)"/>` +
    `<ellipse cx="210" cy="140" rx="22" ry="12" fill="${edge}" transform="rotate(20 210 140)"/>` +
    `<ellipse cx="128" cy="156" rx="60" ry="52" fill="#FFFBF5"/>` +
    face({ cx: 128, cy: 154, spread: 28, eye: 13, expression, blush: '#FFB3C6' })
  );
}

export interface CharacterSvgOptions {
  expression?: Expression;
  /** Small emblems and accents; off below ~48 px where they would blur. */
  detail?: boolean;
  /** Include the expression's floating accents (?, zZ, hearts). */
  accents?: boolean;
  /** Tile background (app icons). */
  background?: string | null;
  /** Width/height attributes; the viewBox is always 0 0 256 256. */
  size?: number;
}

export function characterSvg(character: Character, opts: CharacterSvgOptions = {}): string {
  const expression = opts.expression ?? 'happy';
  const detail = opts.detail ?? true;
  const body = {
    caishy: () => caishy(expression, detail),
    momo: () => momo(expression),
    panda: () => panda(expression),
    lumi: () => lumi(expression),
    pico: () => pico(expression),
    niko: () => niko(expression),
    zuzu: () => zuzu(expression),
  }[character]();
  const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
  const bg = opts.background
    ? `<rect width="256" height="256" rx="58" fill="${opts.background}"/>`
    : '';
  const inner = opts.background ? `<g transform="translate(28 30) scale(0.78)">${body}</g>` : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"${size}>${bg}${inner}${opts.accents ? extras(expression) : ''}</svg>`;
}
