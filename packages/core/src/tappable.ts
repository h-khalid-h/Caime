/**
 * What may be tapped in a message's words (M17 I9d): a day or a time ahead, a phone number, an
 * email address, each where the words say it. Nothing is read here: the server kept what it found
 * as the message was sent (`entities`, on its writer's clock), and this only finds those words
 * again in the text a reader sees, so a bubble marks them without loading a reader. A day gone by
 * isn't offered, nor "before the meeting" (M17 I9e), whose time is a meeting's already; a link
 * keeps its own tap, and a mention wins over anything inside it.
 */

export type Tappable =
  | { kind: 'date'; at: string; hasTime: boolean }
  | { kind: 'phone'; number: string }
  | { kind: 'email'; address: string };

export interface TapSpan {
  start: number;
  end: number;
  tap: Tappable;
}

interface KeptDate {
  text?: unknown;
  at?: unknown;
  time?: unknown;
  past?: unknown;
  card?: unknown;
}

/** What was kept, and whether it's a number kept as its digits alone. */
interface Kept {
  text: string;
  tap: Tappable;
  digits?: true;
}

/** The kept entities as a message carries them, checked: anything else is left out. */
function kept(entities: unknown): Kept[] {
  if (!entities || typeof entities !== 'object') return [];
  const e = entities as { dates?: unknown; phones?: unknown; emails?: unknown };
  const out: Kept[] = [];
  if (Array.isArray(e.dates))
    for (const d of e.dates as KeptDate[]) {
      if (!d || typeof d.text !== 'string' || typeof d.at !== 'string' || d.past === true) continue;
      if (d.card === true) continue;
      out.push({ text: d.text, tap: { kind: 'date', at: d.at, hasTime: Boolean(d.time) } });
    }
  // A number is kept as its digits and its plus ("+201001234567"), however it was written.
  if (Array.isArray(e.phones))
    for (const p of e.phones)
      if (typeof p === 'string' && /^\+?\d{6,}$/.test(p))
        out.push({ text: p, tap: { kind: 'phone', number: p }, digits: true });
  if (Array.isArray(e.emails))
    for (const a of e.emails)
      if (typeof a === 'string' && a.includes('@'))
        out.push({ text: a, tap: { kind: 'email', address: a } });
  return out;
}

/**
 * Where each kept thing sits in the words, in order and never overlapping: the first place each
 * one is written that nothing earlier took.
 */
export function tappableSpans(text: string, entities: unknown): TapSpan[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const taken: TapSpan[] = [];
  const free = (start: number, end: number) => !taken.some((s) => start < s.end && end > s.start);
  for (const { text: said, tap, digits } of kept(entities)) {
    if (!said) continue;
    if (digits) {
      // Its digits in order, with the spaces, dots, dashes and brackets it was written with; the
      // number is shown as written.
      const written = new RegExp(
        [...said].map((c) => (c === '+' ? '\\+' : c)).join('[\\s().-]*'),
        'g',
      );
      for (const m of text.matchAll(written)) {
        if (!free(m.index, m.index + m[0].length)) continue;
        taken.push({
          start: m.index,
          end: m.index + m[0].length,
          tap: { kind: 'phone', number: m[0] },
        });
        break;
      }
      continue;
    }
    const needle = said.toLowerCase();
    // Case folded only when it keeps the length, so the indices stay the text's own.
    const hay = needle.length === said.length && lower.length === text.length ? lower : text;
    const what = hay === lower ? needle : said;
    let from = 0;
    while (from <= hay.length) {
      const start = hay.indexOf(what, from);
      if (start < 0) break;
      const end = start + said.length;
      if (free(start, end)) {
        taken.push({ start, end, tap });
        break;
      }
      from = start + 1;
    }
  }
  return taken.sort((a, b) => a.start - b.start);
}
