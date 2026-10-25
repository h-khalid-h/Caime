import { describe, expect, it } from 'vitest';
import { analyzeMessage } from './intelligence';
import { MISSED_SHOWN, missedKindOf, missedLinesShown } from './missed';

const now = new Date('2026-10-25T10:00:00Z');
const read = (text: string) => analyzeMessage(text, { now, timeZone: 'Europe/London' });
const words = (text: string) => missedKindOf(read(text), { kind: 'text', cardStartAt: null }, now);

describe('what a new message is to its reader (M17 I3)', () => {
  it('sorts asks, promises and decisions, asks first', () => {
    expect(words('Can you send me the contract by Friday?')).toBe('ask');
    expect(words('When does the clinic open?')).toBe('ask');
    expect(words("I'll bring the keys tomorrow")).toBe('promise');
    expect(words('We decided to go with the blue one')).toBe('decision');
    // Asked and promised in one breath: the reader has to answer.
    expect(words("Could you check the dates? I'll book the room")).toBe('ask');
    expect(words('Thanks, see you then')).toBe(null);
  });

  it('reads a card as coming up only while its start is ahead', () => {
    const ahead = new Date(now.getTime() + 3_600_000);
    const past = new Date(now.getTime() - 3_600_000);
    expect(missedKindOf(null, { kind: 'kit', cardStartAt: ahead }, now)).toBe('coming');
    expect(missedKindOf(null, { kind: 'kit', cardStartAt: past }, now)).toBe(null);
    expect(missedKindOf(null, { kind: 'kit', cardStartAt: null }, now)).toBe(null);
    expect(missedKindOf(null, { kind: 'media', cardStartAt: null }, now)).toBe(null);
  });

  it('shows each kind as it came, asks first, at most MISSED_SHOWN', () => {
    const lines = [
      { kind: 'promise' as const, seq: 3 },
      { kind: 'ask' as const, seq: 1 },
      { kind: 'coming' as const, seq: 9 },
      { kind: 'ask' as const, seq: 7 },
      { kind: 'decision' as const, seq: 5 },
      { kind: 'ask' as const, seq: 4 },
    ];
    expect(missedLinesShown(lines).map((l) => `${l.kind}:${l.seq}`)).toEqual([
      'ask:1',
      'ask:4',
      'ask:7',
      'promise:3',
    ]);
    expect(missedLinesShown(lines)).toHaveLength(MISSED_SHOWN);
    expect(missedLinesShown(lines, 6).map((l) => l.kind)).toEqual([
      'ask',
      'ask',
      'ask',
      'promise',
      'decision',
      'coming',
    ]);
  });
});
