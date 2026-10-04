import { describe, expect, it } from 'vitest';
import { leanFrom, learnedOf, placeByLean } from './learning';

describe('what a person’s choices teach (M11)', () => {
  it('learns from the same person first, then from the kind, and only with enough decided', () => {
    // Two decided: nothing yet.
    expect(leanFrom({ accepted: 0, dismissed: 2 }, { accepted: 0, dismissed: 2 })).toBeNull();
    // Three of Sam's passed on: quieter, said as Sam's.
    expect(leanFrom({ accepted: 0, dismissed: 3 }, { accepted: 0, dismissed: 3 })).toEqual({
      lean: 'quiet',
      accepted: 0,
      dismissed: 3,
      of: 'person',
    });
    // Three of Sam's taken: readier.
    expect(leanFrom({ accepted: 3, dismissed: 1 }, { accepted: 3, dismissed: 1 })?.lean).toBe(
      'favoured',
    );
    // Sam's are mixed and enough to say so: nothing, whatever the kind at large says.
    expect(leanFrom({ accepted: 2, dismissed: 2 }, { accepted: 0, dismissed: 9 })).toBeNull();
    // No history with this person: the kind decides, with five or more.
    expect(leanFrom(null, { accepted: 0, dismissed: 4 })).toBeNull();
    expect(leanFrom(null, { accepted: 1, dismissed: 4 })).toEqual({
      lean: 'quiet',
      accepted: 1,
      dismissed: 4,
      of: 'kind',
    });
    expect(leanFrom({ accepted: 1, dismissed: 0 }, { accepted: 5, dismissed: 0 })?.of).toBe('kind');
  });

  it('reads a lean from a payload and nothing from noise', () => {
    expect(
      learnedOf({ learned: { lean: 'quiet', accepted: 0, dismissed: 3, of: 'person' } }),
    ).toEqual({ lean: 'quiet', accepted: 0, dismissed: 3, of: 'person' });
    expect(learnedOf({ learned: { lean: 'loud' } })).toBeNull();
    expect(learnedOf({})).toBeNull();
    expect(learnedOf(null)).toBeNull();
  });

  it('places the favoured first and the quiet apart, keeping the rest in order', () => {
    const s = (id: string, lean?: 'favoured' | 'quiet') => ({
      id,
      payload: lean ? { learned: { lean, accepted: 3, dismissed: 0, of: 'person' } } : {},
    });
    const { shown, quiet } = placeByLean([s('a'), s('b', 'quiet'), s('c', 'favoured'), s('d')]);
    expect(shown.map((x) => x.id)).toEqual(['c', 'a', 'd']);
    expect(quiet.map((x) => x.id)).toEqual(['b']);
  });
});
