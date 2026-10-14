import { describe, expect, it } from 'vitest';
import {
  initiativeOf,
  offersSuggestion,
  QUITE_SURE,
  quietWaitAfterMs,
  tellsBeforeMeetings,
} from './initiative';
import { surenessOf } from './sureness';

describe('how much Cai does unasked (R66)', () => {
  it('is "usual" unless a known choice was made', () => {
    expect(initiativeOf(undefined)).toBe('usual');
    expect(initiativeOf({})).toBe('usual');
    expect(initiativeOf({ caiInitiative: 'loud' })).toBe('usual');
    expect(initiativeOf({ caiInitiative: 'less' })).toBe('less');
  });

  it('usual and more offer every suggestion; less only what reads "Quite sure"', () => {
    for (const c of [0.6, 0.7, 0.8, 0.9]) {
      expect(offersSuggestion('usual', c)).toBe(true);
      expect(offersSuggestion('more', c)).toBe(true);
      expect(offersSuggestion('less', c)).toBe(surenessOf(c) === 'sure');
    }
    expect(offersSuggestion('less', QUITE_SURE)).toBe(true);
  });

  it('asks about a quiet wait after three days, a day with more, never with less', () => {
    expect(quietWaitAfterMs('usual')).toBe(3 * 86_400_000);
    expect(quietWaitAfterMs('more')).toBe(86_400_000);
    expect(quietWaitAfterMs('less')).toBeNull();
    expect(tellsBeforeMeetings('less')).toBe(false);
    expect(tellsBeforeMeetings('usual')).toBe(true);
  });
});
