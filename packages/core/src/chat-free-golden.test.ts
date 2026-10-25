import { describe, expect, it } from 'vitest';
import { chatFree } from './chat-free';
import { chatIntent } from './chat-intent';
import { CHAT_FREE_GOLDEN } from './fixtures/chat-free-golden';

describe('Cai asked when its writer is free, in every language (M17 I7)', () => {
  for (const lang of ['en', 'ar', 'fr', 'tr'] as const)
    it(`reads every ${lang} line as it was labelled`, () => {
      const lines = CHAT_FREE_GOLDEN.filter((l) => l.lang === lang);
      expect(lines.filter((l) => l.free).length).toBeGreaterThanOrEqual(5);
      expect(lines.filter((l) => !l.free).length).toBeGreaterThanOrEqual(4);
      const wrong = lines
        .filter((l) => chatFree(l.text) !== l.free)
        .map((l) => `${l.free ? 'missed' : 'took'}: ${l.text}`);
      expect(wrong).toEqual([]);
    });

  it('never takes one of the four questions about open things', () => {
    for (const text of ["what's on this week", 'Do I have anything today?', 'what am i waiting on'])
      expect([text, chatFree(text), chatIntent(text)]).toEqual([text, false, chatIntent(text)]);
  });
});
