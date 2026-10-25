import { describe, expect, it } from 'vitest';
import { calledCai, echoes } from './cai-call';
import { CAI_CALL_GOLDEN, type CaiCallLine } from './fixtures/cai-call-golden';

/**
 * Whether Cai hears its name in a call, per language and Arabic variety (M17 I13g): precision
 * (a line read as a call to Cai really is one, with the right question) and recall (a call to
 * Cai is read), floors set at what was measured when the set was written and only ever raised.
 * An answer aloud to a line that wasn't for Cai interrupts everyone, so precision's floor is
 * the higher.
 */
const GROUPS: Array<{ name: string; pick: (l: CaiCallLine) => boolean }> = [
  { name: 'en', pick: (l) => l.lang === 'en' },
  { name: 'ar (Standard)', pick: (l) => l.lang === 'ar' && !l.variety },
  { name: 'ar (Egyptian)', pick: (l) => l.variety === 'egyptian' },
  { name: 'ar (Gulf)', pick: (l) => l.variety === 'gulf' },
  { name: 'ar (Levantine)', pick: (l) => l.variety === 'levantine' },
  { name: 'ar (Maghrebi)', pick: (l) => l.variety === 'maghrebi' },
  { name: 'fr', pick: (l) => l.lang === 'fr' },
  { name: 'tr', pick: (l) => l.lang === 'tr' },
];
const FLOORS = { precision: 1, recall: 1 };

describe('Cai called by name (golden set)', () => {
  for (const group of GROUPS) {
    it(`${group.name}: reads at or above its floors`, () => {
      const lines = CAI_CALL_GOLDEN.filter(group.pick);
      expect(lines.length).toBeGreaterThan(0);
      let truePositives = 0;
      let readAsCalls = 0;
      let calls = 0;
      const wrong: string[] = [];
      for (const line of lines) {
        const read = calledCai(line.text);
        if (line.question) calls += 1;
        if (read) readAsCalls += 1;
        const right = line.question ? read?.question === line.question : read === null;
        if (right && line.question) truePositives += 1;
        if (!right) wrong.push(`${line.text} → ${read ? JSON.stringify(read.question) : 'null'}`);
      }
      const precision = readAsCalls ? truePositives / readAsCalls : 1;
      const recall = calls ? truePositives / calls : 1;
      expect(wrong, wrong.join('\n')).toEqual([]);
      expect(precision).toBeGreaterThanOrEqual(FLOORS.precision);
      expect(recall).toBeGreaterThanOrEqual(FLOORS.recall);
    });
  }

  it('is off when someone in the call is named Kai, Cai or Kay', () => {
    expect(calledCai('Kai, can you send me the file?', ['Kai Chen', 'Noor'])).toBeNull();
    expect(calledCai('Cai, what did we decide?', ['Cai Lopes'])).toBeNull();
    expect(calledCai('Cai, what did we decide?', ['Kaya', 'Noor'])).not.toBeNull();
    expect(calledCai('كاي، شو قررنا؟', ['كاي أحمد'])).toBeNull();
  });

  it('hears an echo of what Cai just said', () => {
    const spoken =
      'You decided on four hundred dirhams for the venue, with Sam confirming by Friday.';
    expect(
      echoes('you decided on four hundred dirhams for the venue with Sam confirming', spoken),
    ).toBe(true);
    expect(echoes('decided on four hundred', spoken)).toBe(true);
    expect(echoes('so what about the chairs for the venue then', spoken)).toBe(false);
    expect(echoes('', spoken)).toBe(false);
  });
});
