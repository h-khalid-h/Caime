/** The bake-off's score (scripts/speech-wer.mjs): Arabic heard the same scores the same. */
import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain module beside the scripts, without types
import { normalize, wer } from '../../../scripts/speech-wer.mjs';

describe('the speech bake-off score', () => {
  it('hears tashkeel, alef forms, ya and ta marbuta as the same word', () => {
    expect(normalize('أَرْسِلْ لي العَقْدَ غداً إلى المَكتبةِ')).toEqual(
      normalize('ارسل لي العقد غدا الي المكتبه'),
    );
    expect(normalize('٥ ريال')).toEqual(['5', 'ريال']);
  });
  it('is the edits over the reference’s words', () => {
    expect(wer('send me the deck tomorrow', 'send me the deck tomorrow')).toBe(0);
    expect(wer('send me the deck tomorrow', 'send me a deck')).toBeCloseTo(2 / 5);
    expect(wer('هبعتلك العقد بكرة', 'هبعتلك العقد')).toBeCloseTo(1 / 3);
    expect(wer('', 'anything at all')).toBe(1);
  });
});
