import { describe, expect, it } from 'vitest';
import { EMPTIED_ECHO_MS, echoesAfterEmpty } from './emptiedRule';

describe('a box emptied after a send (2026-10-25)', () => {
  const at = 10_000;
  it('drops the keyboard’s echo of the words into the emptied box, on a phone', () => {
    const echo = {
      native: true,
      emptiedAt: at,
      now: at + 50,
      current: '',
      next: 'Did you updated its due dates',
    };
    expect(echoesAfterEmpty(echo)).toBe(true);
    // The web's inputs never echo.
    expect(echoesAfterEmpty({ ...echo, native: false })).toBe(false);
  });
  it('keeps typing: one letter at once, or anything once the moment has passed', () => {
    expect(
      echoesAfterEmpty({ native: true, emptiedAt: at, now: at + 50, current: '', next: 'D' }),
    ).toBe(false);
    expect(
      echoesAfterEmpty({
        native: true,
        emptiedAt: at,
        now: at + EMPTIED_ECHO_MS,
        current: '',
        next: 'Did you',
      }),
    ).toBe(false);
    // A box with words in it is being edited, never echoed into.
    expect(
      echoesAfterEmpty({ native: true, emptiedAt: at, now: at + 50, current: 'Di', next: 'Did' }),
    ).toBe(false);
  });
});
