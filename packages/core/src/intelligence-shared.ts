/**
 * What the message intelligence's languages share: the shape one sentence is read into, and the
 * two helpers every language uses to take its dates out of a clause and to find its due date.
 */
import type { ActionClause } from './intelligence';
import type { WhenMatch } from './when';

/** One sentence as a language reads it (`intelligence-fr.ts`, `intelligence-tr.ts`). */
export interface SentenceReading {
  asks: boolean;
  confirms: boolean;
  decision: { title: string; quote: string } | null;
  commitment: ActionClause | null;
  request: ActionClause | null;
}

/** The sentence and where it sits in the message, with the message's dates. */
export interface SentenceContext {
  /** The sentence, quoted words blanked (`maskQuoted`). */
  text: string;
  /** Where it starts in the message. */
  index: number;
  /** The sentence as written, for the quote a suggestion carries. */
  said: string;
  dates: WhenMatch[];
}

/** The text with the dates inside it taken out ("send it tomorrow" → "send it "). */
export function removeRanges(text: string, offset: number, dates: WhenMatch[]): string {
  let out = text;
  const inside = dates
    .filter((d) => d.index >= offset && d.index < offset + text.length)
    .sort((a, b) => b.index - a.index);
  for (const d of inside) {
    const start = d.index - offset;
    out = out.slice(0, start) + out.slice(start + d.text.length);
  }
  return out;
}

/** The first date ahead inside a stretch of the message. */
export function firstDateIn(dates: WhenMatch[], index: number, length: number): WhenMatch | null {
  return dates.find((d) => d.index >= index && d.index < index + length && !d.past) ?? null;
}

/**
 * The date of what's said at `at`: the first ahead in its own clause ("je pourrai pas
 * aujourd'hui, mais je t'appelle demain" is tomorrow), else the first in the sentence.
 */
export function dateOfClause(ctx: SentenceContext, breaks: RegExp, at: number): WhenMatch | null {
  const folded = ctx.text.replace(/İ/g, 'i').toLowerCase();
  let from = 0;
  for (const b of folded.slice(0, at).matchAll(breaks)) from = b.index + b[0].length;
  let to = ctx.text.length;
  for (const b of folded.slice(at).matchAll(breaks)) {
    if (b.index > 0) {
      to = at + b.index;
      break;
    }
  }
  return (
    firstDateIn(ctx.dates, ctx.index + from, to - from) ??
    firstDateIn(ctx.dates, ctx.index, ctx.text.length)
  );
}
