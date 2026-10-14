/**
 * How much Cai does unasked (R66): one choice in Settings · Cai, read wherever Cai acts without
 * being asked. "Usual" is what Cai has always done, so nothing changes for anyone who never
 * chooses. Less: only suggestions it's quite sure of, no asking about a quiet wait and no notice
 * before a meeting (the brief still opens from the card). More: as usual, and a wait gone quiet
 * is asked about after a day rather than three. What a person asks for (a catch-up, "Find
 * actions", Ask Cai) is never held back by it.
 */
import { msg } from './i18n';

export const INITIATIVES = ['less', 'usual', 'more'] as const;
export type Initiative = (typeof INITIATIVES)[number];

/** The choices as Settings · Cai offers them (keys, shown through `tr`). */
export const INITIATIVE_CHOICES: Array<{ value: Initiative; label: string; detail: string }> = [
  {
    value: 'less',
    label: msg('Less'),
    detail: msg(
      'Only suggestions it’s quite sure of. It doesn’t ask about a wait or tell you before a meeting; the brief still opens from the card.',
    ),
  },
  {
    value: 'usual',
    label: msg('Usual'),
    detail: msg(
      'Suggests what it reads in your conversations, says how sure it is, and asks about a wait after three quiet days.',
    ),
  },
  {
    value: 'more',
    label: msg('More'),
    detail: msg('As usual, and asks about a wait after one quiet day.'),
  },
];

/** "Quite sure" (core `sureness.ts`): what a suggestion needs to be offered with `less`. */
export const QUITE_SURE = 0.85;

const DAY_MS = 86_400_000;

export function initiativeOf(preferences: unknown): Initiative {
  const value = (preferences as { caiInitiative?: unknown } | null | undefined)?.caiInitiative;
  return (INITIATIVES as readonly unknown[]).includes(value) ? (value as Initiative) : 'usual';
}

/** Whether a suggestion Cai made on its own is offered at all. */
export function offersSuggestion(initiative: Initiative, confidence: number): boolean {
  return initiative !== 'less' || confidence >= QUITE_SURE;
}

/** How long a wait is quiet before Cai asks about it, or null: it doesn't ask. */
export function quietWaitAfterMs(initiative: Initiative): number | null {
  return initiative === 'less' ? null : initiative === 'more' ? DAY_MS : 3 * DAY_MS;
}

/** Whether Cai tells someone an hour before a meeting that its brief is ready. */
export function tellsBeforeMeetings(initiative: Initiative): boolean {
  return initiative !== 'less';
}
