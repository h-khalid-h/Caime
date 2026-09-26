/** WCAG 2.2 relative luminance and contrast ratio for `#RRGGBB` colours. */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mix two colours; `amount` 0 returns `a`, 1 returns `b`. Used for hover and pressed states. */
export function mix(a: string, b: string, amount: number): string {
  const pa = a.replace('#', '');
  const pb = b.replace('#', '');
  const out = [0, 2, 4].map((i) => {
    const va = Number.parseInt(pa.slice(i, i + 2), 16);
    const vb = Number.parseInt(pb.slice(i, i + 2), 16);
    return Math.round(va + (vb - va) * amount)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${out.join('').toUpperCase()}`;
}

/** `#RRGGBB` plus an alpha 0–1 as `rgba()`, for overlays and shadows. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
