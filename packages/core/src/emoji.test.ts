import { describe, expect, it } from 'vitest';
import { isEmoji } from './emoji';

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
