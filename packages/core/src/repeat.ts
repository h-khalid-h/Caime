/**
 * How often a meeting repeats (R58), the light part: the choices and their words, and where a
 * meeting may repeat. The card's form, the card and the calendar read it without the series'
 * clock arithmetic (`series.ts`), so it costs the first download almost nothing.
 */
import { msg } from './i18n';

export const REPEATS = ['workday', 'week', 'fortnight', 'month'] as const;
export type Repeat = (typeof REPEATS)[number];

/** How often, as the card's field offers it and the calendar says it (keys, shown through `tr`). */
export const REPEAT_CHOICES: Array<{ value: Repeat; label: string }> = [
  // The days its proposer works (R76), kept on the series when it starts.
  { value: 'workday', label: msg('Every workday') },
  { value: 'week', label: msg('Every week') },
  { value: 'fortnight', label: msg('Every two weeks') },
  { value: 'month', label: msg('Every month') },
];

export function isRepeat(value: unknown): value is Repeat {
  return typeof value === 'string' && (REPEATS as readonly string[]).includes(value);
}

/**
 * Where a meeting may repeat: a chat or a group (a meeting's own space is one). A business
 * conversation books what repeats as appointments, one by one, through its catalog.
 */
export function repeatsIn(kind: string): boolean {
  return kind === 'direct' || kind === 'group';
}
