/**
 * What a person's own choices teach Caime (M11, R12): a kind of suggestion they keep taking
 * is offered more readily, one they keep passing on more quietly. Rules, not a model; the
 * counts are shown with the suggestion so the reason is always readable; nothing is hidden,
 * only placed; and it stops the moment the person turns it off (`learnFromChoices`).
 *
 * The history is the person's own decisions on suggestions of the same kind: first from the
 * same person (a promise from Sam, after three of Sam's), then of the kind at large, which
 * needs more evidence, since one person's habit says little about another's.
 */

export type Lean = 'favoured' | 'quiet';

/** What was learned, kept on the suggestion so the app can say it. */
export interface Learned {
  lean: Lean;
  /** Of the last decisions looked at, how many were taken and how many passed on. */
  accepted: number;
  dismissed: number;
  /** Whose history: this person's suggestions of the kind, or the kind at large. */
  of: 'person' | 'kind';
}

/** The last decisions looked at, and how many are needed before anything is learned. */
export const LEARN_WINDOW = { person: 6, kind: 10 } as const;
export const LEARN_NEEDS = { person: 3, kind: 5 } as const;

export interface ChoiceHistory {
  accepted: number;
  dismissed: number;
}

/** What one history teaches, if enough of it was decided. */
function lean(h: ChoiceHistory, needs: number): Lean | null {
  const decided = h.accepted + h.dismissed;
  if (decided < needs) return null;
  // Three of the last few passed on, with at most one taken: quieter. The reverse: readier.
  if (h.dismissed >= 3 && h.accepted <= 1) return 'quiet';
  if (h.accepted >= 3 && h.dismissed <= 1) return 'favoured';
  return null;
}

/**
 * What to learn for a new suggestion from the person's decisions: the same person's history
 * when it has enough, else the kind's. Null when there's nothing to learn yet, or the two
 * histories don't agree enough to say.
 */
export function leanFrom(person: ChoiceHistory | null, kind: ChoiceHistory): Learned | null {
  if (person) {
    const l = lean(person, LEARN_NEEDS.person);
    if (l) return { lean: l, accepted: person.accepted, dismissed: person.dismissed, of: 'person' };
    if (person.accepted + person.dismissed >= LEARN_NEEDS.person) return null;
  }
  const l = lean(kind, LEARN_NEEDS.kind);
  return l ? { lean: l, accepted: kind.accepted, dismissed: kind.dismissed, of: 'kind' } : null;
}

/** A suggestion's learned lean, from its payload, or null. */
export function learnedOf(payload: Record<string, unknown> | null | undefined): Learned | null {
  const l = payload?.learned as Partial<Learned> | undefined;
  return l && (l.lean === 'favoured' || l.lean === 'quiet') && typeof l.accepted === 'number'
    ? {
        lean: l.lean,
        accepted: l.accepted,
        dismissed: typeof l.dismissed === 'number' ? l.dismissed : 0,
        of: l.of === 'kind' ? 'kind' : 'person',
      }
    : null;
}

/**
 * How a list of suggestions is shown: the favoured first, the quiet ones apart (offered in one
 * line, never hidden), the rest in the order given.
 */
export function placeByLean<T extends { payload: Record<string, unknown> }>(
  list: T[],
): { shown: T[]; quiet: T[] } {
  const shown: T[] = [];
  const quiet: T[] = [];
  for (const s of list) {
    const l = learnedOf(s.payload);
    if (l?.lean === 'quiet') quiet.push(s);
    else if (l?.lean === 'favoured') shown.unshift(s);
    else shown.push(s);
  }
  return { shown, quiet };
}
