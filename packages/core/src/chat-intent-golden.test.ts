import { afterEach, describe, expect, it } from 'vitest';
import { aboutRelationship, chatAbout, chatIntent } from './chat-intent';
import {
  ABOUT_GOLDEN,
  type AboutLine,
  CHAT_INTENT_GOLDEN,
  type IntentLine,
  RELATION_GOLDEN,
  type RelationLine,
} from './fixtures/chat-intent-golden';
import { english, makeTranslator, setTranslator, type Translator } from './i18n';
import { ar } from './locales/ar';
import { fr } from './locales/fr';
import { turkish } from './locales/tr';

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

/**
 * Questions about one person (M16 G11), read for the question and the name as typed. When first
 * measured (2026-10-19), before its rules met these lines: English 21 of 22, Arabic 18 of 22,
 * French 19 of 21, Turkish 17 of 21. The lines added once the rules met the server (a day where
 * a name would be, "to" or "@" before one, a day after one, a relationship in its place) left
 * them at 25 of 30, 25 of 28, 24 of 26 and 25 of 26; the floors are what was measured once each
 * was fixed.
 */
const ABOUT_FLOORS: Record<AboutLine['lang'], number> = { en: 1, ar: 1, fr: 1, tr: 1 };

describe('questions about one person', () => {
  for (const lang of LANGUAGES) {
    it(`${lang}: read at or above the floor`, () => {
      const lines = ABOUT_GOLDEN.filter((l) => l.lang === lang);
      const wrong = lines
        .map((l) => ({ l, got: chatAbout(l.text) }))
        .filter(({ l, got }) => JSON.stringify(got) !== JSON.stringify(l.about))
        .map(
          ({ l, got }) =>
            `  ${l.text} → ${JSON.stringify(got)} (wanted ${JSON.stringify(l.about)})`,
        );
      const share = 1 - wrong.length / lines.length;
      expect(share, `${lang}: ${share.toFixed(2)}\n${wrong.join('\n')}`).toBeGreaterThanOrEqual(
        ABOUT_FLOORS[lang],
      );
    });
  }

  it('holds each question and the ones about nobody in each language', () => {
    for (const lang of LANGUAGES) {
      const lines = ABOUT_GOLDEN.filter((l) => l.lang === lang);
      for (const intent of ['waiting', 'asked', 'mine', 'coming', 'agreed', 'paid'])
        expect(
          lines.filter((l) => l.about?.intent === intent).length,
          `${lang} ${intent}`,
        ).toBeGreaterThanOrEqual(3);
      expect(lines.filter((l) => l.about === null).length, lang).toBeGreaterThanOrEqual(3);
    }
  });

  it('never reads a question about everyone, or about oneself, as one person’s', () => {
    for (const line of CHAT_INTENT_GOLDEN.filter((l) => l.intent !== null))
      expect([line.text, chatAbout(line.text)]).toEqual([line.text, null]);
  });
});

/**
 * The relationship a question names someone by (G11), each read in its own reader's language.
 * When first measured (2026-10-19), as search had read such words (no "my" taken off, no "boss"
 * or "ماما"): English 2 of 10, Arabic 5 of 9, French 2 of 8, Turkish 6 of 8; the floors are
 * what was measured once that was fixed.
 */
const RELATION_FLOORS: Record<RelationLine['lang'], number> = { en: 1, ar: 1, fr: 1, tr: 1 };
const READERS: Record<RelationLine['lang'], Translator> = {
  en: english,
  ar: makeTranslator('ar', ar),
  fr: makeTranslator('fr', fr),
  tr: makeTranslator('tr', turkish),
};

describe('the relationship a question names', () => {
  afterEach(() => setTranslator(english));
  for (const lang of LANGUAGES) {
    it(`${lang}: read at or above the floor`, () => {
      setTranslator(READERS[lang]);
      const lines = RELATION_GOLDEN.filter((l) => l.lang === lang);
      const wrong = lines.flatMap((l) => {
        const got = aboutRelationship(l.words);
        const want = l.relationship;
        const right =
          want === null
            ? got === null
            : got !== null &&
              (want.sphere === undefined || got.sphere === want.sphere) &&
              (want.role === undefined || got.role === want.role);
        return right
          ? []
          : [`  ${l.words} → ${JSON.stringify(got)} (wanted ${JSON.stringify(want)})`];
      });
      const share = 1 - wrong.length / lines.length;
      expect(share, `${lang}: ${share.toFixed(2)}\n${wrong.join('\n')}`).toBeGreaterThanOrEqual(
        RELATION_FLOORS[lang],
      );
    });
  }

  it('holds relationships and names or things in each language', () => {
    for (const lang of LANGUAGES) {
      const lines = RELATION_GOLDEN.filter((l) => l.lang === lang);
      expect(lines.filter((l) => l.relationship).length, lang).toBeGreaterThanOrEqual(5);
      expect(lines.filter((l) => !l.relationship).length, lang).toBeGreaterThanOrEqual(2);
    }
  });
});
