import { describe, expect, it } from 'vitest';
import { surenessLine, surenessOf, surenessWord } from './sureness';

describe('how sure a suggestion is, in words (M11)', () => {
  it.each([
    [0.9, 'sure'],
    [0.85, 'sure'],
    [0.8, 'fairly'],
    [0.7, 'fairly'],
    [0.6, 'guess'],
    [0, 'guess'],
    [Number.NaN, 'guess'],
  ] as const)('%s → %s', (confidence, sureness) => {
    expect(surenessOf(confidence)).toBe(sureness);
  });

  it('says it in words, never a number', () => {
    expect(surenessWord(0.9)).toBe('Quite sure');
    expect(surenessWord(0.75)).toBe('Fairly sure');
    expect(surenessWord(0.6)).toBe('A guess');
    expect(surenessWord(0.9)).not.toMatch(/\d/);
  });

  it('puts the reason after it, or stands alone', () => {
    expect(surenessLine(0.9, 'Sam wrote “I’ll send it Friday”')).toBe(
      'Quite sure · Sam wrote “I’ll send it Friday”',
    );
    expect(surenessLine(0.6, '  ')).toBe('A guess');
  });
});
