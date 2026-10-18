import { describe, expect, it } from 'vitest';
import { emojiOnly, isEmoji } from './emoji';

describe('one emoji', () => {
  it('whole, however it is made', () => {
    for (const e of ['🌴', '❤️', '👍🏽', '👩🏽‍💻', '🧑‍💻', '🏳️‍🌈', '🇪🇬', '1️⃣', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '☕'])
      expect(isEmoji(e)).toBe(true);
  });

  it('never words, two of them, or one cut short', () => {
    for (const e of ['ab', '🌴🌴', '🌴 ', '', '🧑‍\ud83d', '‍', '🇪', 'x🌴'])
      expect(isEmoji(e)).toBe(false);
  });
});

describe('a message of emoji alone (M16 E3)', () => {
  it('counts one to three, however each is made, spaces between allowed', () => {
    expect(emojiOnly('👍')).toBe(1);
    expect(emojiOnly(' ❤️ ')).toBe(1);
    expect(emojiOnly('😂😂')).toBe(2);
    expect(emojiOnly('👩🏽‍💻 🇪🇬 1️⃣')).toBe(3);
  });

  it('is nothing with a word, a digit or a fourth', () => {
    for (const t of ['ok 👍', '👍!', '2', '🌴🌴🌴🌴', '', '   ', 'x']) expect(emojiOnly(t)).toBe(0);
  });
});
