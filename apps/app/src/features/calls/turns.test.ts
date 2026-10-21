/**
 * A call's notes as turns (M17 F8a): a speaker's lines with nobody between them are one
 * paragraph; anyone else, or a minute's quiet, starts another.
 */
import type { CallNoteLineView } from '@caime/core/api';
import { describe, expect, it } from 'vitest';
import { turnsOf, turnText } from './turns';

const hk = { id: 'hk', displayName: 'Hussein Khalid', avatarUrl: null };
const nd = { id: 'nd', displayName: 'Nadeem', avatarUrl: null };
let n = 0;
const line = (
  speaker: typeof hk,
  second: number,
  text: string | null,
  mine = speaker === hk,
): CallNoteLineView => ({
  id: `l${++n}`,
  speaker,
  at: new Date(Date.UTC(2026, 9, 21, 16, 53, 0) + second * 1000).toISOString(),
  text,
  language: 'en',
  mine,
});

describe('a call’s notes as turns (M17 F8a)', () => {
  it('joins a speaker’s lines into one paragraph until someone else speaks', () => {
    const turns = turnsOf([
      line(hk, 0, 'If we find that this store'),
      line(hk, 3, 'The mapped store has multiple'),
      line(hk, 6, 'channels'),
      line(nd, 9, 'Yeah'),
      line(hk, 11, 'Okay'),
    ]);
    expect(turns.map((t) => [t.speaker.id, turnText(t)])).toEqual([
      ['hk', 'If we find that this store The mapped store has multiple channels'],
      ['nd', 'Yeah'],
      ['hk', 'Okay'],
    ]);
    expect(turns[0]?.lines).toHaveLength(3);
    expect(turns[0]?.at).toBe(turns[0]?.lines[0]?.at);
  });

  it('starts a new paragraph after a minute with nothing from anyone', () => {
    const turns = turnsOf([line(hk, 0, 'First'), line(hk, 61, 'Later')]);
    expect(turns.map(turnText)).toEqual(['First', 'Later']);
  });

  it('says nothing for a turn still being written, and the written part of one under way', () => {
    const [waiting, partly] = turnsOf([line(nd, 0, null), line(hk, 2, 'Heard'), line(hk, 4, null)]);
    expect(waiting && turnText(waiting)).toBeNull();
    expect(partly && turnText(partly)).toBe('Heard');
  });
});
