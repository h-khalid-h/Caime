import { describe, expect, it } from 'vitest';
import { chatIntent } from './chat-intent';
import { CHAT_INTENT_GOLDEN, type IntentLine } from './fixtures/chat-intent-golden';

/**
 * What the rules answer of what's written to Cai and the friends, per language (M16 G10): how
 * many lines get the answer they should (an intent, or null for the model), and how many of the
 * rules' own answers are right, since a list answering the wrong question costs more than the
 * model's reply. When first measured (2026-10-19) a third of the lines were missed in every
 * language, "summarise my week" got the week's list and "what am I waiting for from Ana?" every
 * wait; the floors are what was measured once that was fixed, and only ever move up.
 */
const LANGUAGES = ['en', 'ar', 'fr', 'tr'] as const;
const FLOORS: Record<IntentLine['lang'], { accuracy: number; answeredRight: number }> = {
  en: { accuracy: 1, answeredRight: 1 },
  ar: { accuracy: 1, answeredRight: 1 },
  fr: { accuracy: 1, answeredRight: 1 },
  tr: { accuracy: 1, answeredRight: 1 },
};

describe('the chat intents golden set', () => {
  for (const lang of LANGUAGES) {
    it(`${lang}: answers at or above its floors`, () => {
      const lines = CHAT_INTENT_GOLDEN.filter((l) => l.lang === lang);
      let right = 0;
      let answered = 0;
      let answeredRight = 0;
      const wrong: string[] = [];
      for (const line of lines) {
        const got = chatIntent(line.text);
        if (got === line.intent) right += 1;
        else wrong.push(`  ${line.text} → ${got} (wanted ${line.intent})`);
        if (got) {
          answered += 1;
          if (got === line.intent) answeredRight += 1;
        }
      }
      const report = `${lang}: ${right} of ${lines.length} right, ${answeredRight} of ${answered} rule answers\n${wrong.join('\n')}`;
      expect(right / lines.length, report).toBeGreaterThanOrEqual(FLOORS[lang].accuracy);
      expect(answered ? answeredRight / answered : 1, report).toBeGreaterThanOrEqual(
        FLOORS[lang].answeredRight,
      );
    });
  }

  it('holds every intent and the model’s share in each language', () => {
    for (const lang of LANGUAGES) {
      const lines = CHAT_INTENT_GOLDEN.filter((l) => l.lang === lang);
      for (const intent of ['waiting', 'asked', 'mine', 'coming', 'greeting', 'help', 'thanks'])
        expect(
          lines.some((l) => l.intent === intent),
          `${lang} ${intent}`,
        ).toBe(true);
      expect(lines.filter((l) => l.intent === null).length, lang).toBeGreaterThanOrEqual(5);
    }
  });
});
