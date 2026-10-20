import { describe, expect, it } from 'vitest';
import { chatAbout, chatIntent } from './chat-intent';
import { chatSave, keptTitle } from './chat-save';
import { ABOUT_GOLDEN, CHAT_INTENT_GOLDEN } from './fixtures/chat-intent-golden';
import { SAVE_GOLDEN, type SaveLine } from './fixtures/chat-save-golden';
import { firstFutureWhen } from './when';

/**
 * What someone asks Cai or a friend to keep (M16 G13), per language: whether it's an ask, a
 * reminder or an action, the title it keeps and the time it's for. When first measured
 * (2026-10-20), before the rules met these lines, 78 of 80 were read right; with the lines added
 * since (a question to Cai that opens like one, a polite lead the rules didn't take off) every
 * line is, and the floors stay there: a wrong keep writes into someone's actions.
 */
const LANGUAGES = ['en', 'ar', 'fr', 'tr'] as const;
const LOCALES: Record<SaveLine['lang'], string> = {
  en: 'en-GB',
  ar: 'ar-EG',
  fr: 'fr-FR',
  tr: 'tr-TR',
};
const NOW = new Date('2026-10-20T10:00:00Z');

/** What the server keeps of a line: as `keepFor` reads it. */
function kept(line: SaveLine) {
  const ask = chatSave(line.text);
  if (!ask) return { save: null, when: null };
  const opts = { now: NOW, timeZone: 'Africa/Cairo', locale: LOCALES[line.lang] };
  const when = firstFutureWhen(ask.words ?? line.text, opts) ?? null;
  const title = ask.words
    ? keptTitle(ask.words, when && ask.words.includes(when.text) ? when.text : null, ask.lang)
    : '';
  return { save: { remind: ask.remind, title }, when: when?.text ?? null };
}

describe('asks to keep something', () => {
  for (const lang of LANGUAGES) {
    it(`${lang}: every line read right`, () => {
      const lines = SAVE_GOLDEN.filter((l) => l.lang === lang);
      const wrong = lines.flatMap((l) => {
        const got = kept(l);
        const right =
          JSON.stringify(got.save) === JSON.stringify(l.save) &&
          (l.save === null || got.when === (l.when ?? null));
        return right
          ? []
          : [
              `  ${l.text} → ${JSON.stringify(got)} (wanted ${JSON.stringify({ save: l.save, when: l.when ?? null })})`,
            ];
      });
      expect(wrong, `${lang}: ${lines.length - wrong.length} of ${lines.length}`).toEqual([]);
    });
  }

  it('holds asks of each kind and near-misses in each language', () => {
    for (const lang of LANGUAGES) {
      const lines = SAVE_GOLDEN.filter((l) => l.lang === lang);
      expect(lines.filter((l) => l.save?.remind === true).length, lang).toBeGreaterThanOrEqual(4);
      expect(lines.filter((l) => l.save?.remind === false).length, lang).toBeGreaterThanOrEqual(4);
      expect(lines.filter((l) => l.save?.title === '').length, lang).toBeGreaterThanOrEqual(3);
      expect(lines.filter((l) => l.save === null).length, lang).toBeGreaterThanOrEqual(5);
    }
  });

  it('never reads a question to Cai, or one about someone, as an ask to keep', () => {
    for (const line of [...CHAT_INTENT_GOLDEN, ...ABOUT_GOLDEN])
      expect([line.text, chatSave(line.text)]).toEqual([line.text, null]);
  });

  it('leaves the rule answers to what they answer', () => {
    // An ask to keep is never read as one of the four questions or small talk, either way.
    for (const line of SAVE_GOLDEN.filter((l) => l.save))
      expect([line.text, chatIntent(line.text), chatAbout(line.text)]).toEqual([
        line.text,
        null,
        null,
      ]);
  });
});

describe('a kept title', () => {
  it('cuts the time, the joiners and "me" out, and reads as a sentence', () => {
    expect(keptTitle('tomorrow at 9 to call Sam', 'tomorrow at 9', 'en')).toBe('Call Sam');
    expect(keptTitle('de payer le loyer vendredi', 'vendredi', 'fr')).toBe('Payer le loyer');
    expect(keptTitle('bana ilaç almayı', null, 'tr')).toBe('İlaç al');
    expect(keptTitle('بالاجتماع', null, 'ar')).toBe('الاجتماع');
  });

  it('is empty when nothing but the time or a pointer is left', () => {
    expect(keptTitle('tomorrow', 'tomorrow', 'en')).toBe('');
    expect(keptTitle('about it', null, 'en')).toBe('');
    expect(keptTitle('bunu bana yarın', 'yarın', 'tr')).toBe('');
    expect(keptTitle('بيها بكرة', 'بكرة', 'ar')).toBe('');
  });
});
