import { describe, expect, it } from 'vitest';
import { chatAct } from './chat-act';
import { chatAbout, chatIntent } from './chat-intent';
import { chatSave } from './chat-save';
import { ACT_GOLDEN } from './fixtures/chat-act-golden';
import { ABOUT_GOLDEN, CHAT_INTENT_GOLDEN } from './fixtures/chat-intent-golden';
import { SAVE_GOLDEN } from './fixtures/chat-save-golden';

/**
 * What someone asks Cai or a friend to do for them (M16 G14), per language: a message and its
 * words, a call, a meeting and its time, a search, read as the server reads it (an ask to keep
 * first, so "remind me to call Sami" is a reminder). Every line is read right, and stays so: a
 * wrong act puts a draft or a call in front of someone.
 */
const LANGUAGES = ['en', 'ar', 'fr', 'tr'] as const;

const read = (text: string) => {
  if (chatSave(text)) return null;
  const a = chatAct(text);
  return a
    ? {
        kind: a.kind,
        who: a.who,
        words: a.words,
        ...(a.title ? { title: a.title } : {}),
        ...(a.video ? { video: true } : {}),
        ...(a.kind === 'move' ? { from: a.from } : {}),
      }
    : null;
};

describe('asks to do something', () => {
  for (const lang of LANGUAGES) {
    it(`${lang}: every line read right`, () => {
      const lines = ACT_GOLDEN.filter((l) => l.lang === lang);
      const wrong = lines.flatMap((l) => {
        const got = read(l.text);
        return JSON.stringify(got) === JSON.stringify(l.act)
          ? []
          : [`  ${l.text} → ${JSON.stringify(got)} (wanted ${JSON.stringify(l.act)})`];
      });
      expect(wrong, `${lang}: ${lines.length - wrong.length} of ${lines.length}`).toEqual([]);
    });
  }

  it('holds each act and near-misses in each language', () => {
    for (const lang of LANGUAGES) {
      const lines = ACT_GOLDEN.filter((l) => l.lang === lang);
      for (const kind of ['message', 'call', 'meeting', 'find', 'move'] as const)
        expect(lines.filter((l) => l.act?.kind === kind).length, `${lang} ${kind}`).toBeGreaterThan(
          0,
        );
      expect(lines.filter((l) => l.act === null).length, lang).toBeGreaterThanOrEqual(3);
    }
  });

  it('never reads a question the rules answer, or an ask to keep, as an act', () => {
    const questions = [
      ...CHAT_INTENT_GOLDEN.filter((l) => l.intent),
      ...ABOUT_GOLDEN.filter((l) => l.about),
    ];
    for (const line of questions)
      expect([line.text, chatAct(line.text)]).toEqual([line.text, null]);
    for (const line of SAVE_GOLDEN.filter((l) => l.save))
      expect([line.text, read(line.text)]).toEqual([line.text, null]);
  });

  it('leaves the rule answers to what they answer', () => {
    for (const line of ACT_GOLDEN.filter((l) => l.act))
      expect([line.text, chatIntent(line.text), chatAbout(line.text)]).toEqual([
        line.text,
        null,
        null,
      ]);
  });
});
