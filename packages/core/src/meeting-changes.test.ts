import { describe, expect, it } from 'vitest';
import {
  answerOf,
  answersAmong,
  answersKept,
  changeBlock,
  goingCount,
  meetingChange,
  stateByAnswers,
} from './meeting-changes';

describe('a meeting that changes (R123)', () => {
  const at = { at: '2026-10-29T08:00:00.000Z', hasTime: true };
  const fields = { title: 'Weekly sync', start: at, durationMinutes: 30, place: 'Caime' };

  it('asks again for a new time or place, and only tells for a new name', () => {
    expect(meetingChange(fields, { ...fields, title: 'Team sync' })).toEqual({
      fields: ['title'],
      asks: false,
    });
    expect(
      meetingChange(fields, {
        ...fields,
        start: { at: '2026-10-29T09:00:00.000Z', hasTime: true },
      }),
    ).toEqual({ fields: ['start'], asks: true });
    expect(meetingChange(fields, { ...fields, place: 'Café Riche' }).asks).toBe(true);
    expect(meetingChange(fields, { ...fields, durationMinutes: 60 }).asks).toBe(true);
    // The same instant written beside its zone is no change (R119).
    expect(
      meetingChange(fields, { ...fields, start: { ...at, zone: 'Africa/Cairo', local: 'x' } }),
    ).toEqual({ fields: [], asks: false });
  });

  it('is its organizer’s to change while it’s asked or on, and not once it’s over', () => {
    const now = new Date('2026-10-28T08:00:00.000Z');
    const card = { kit: 'meeting', state: 'accepted', fields };
    expect(changeBlock(card, Date.parse('2026-10-29T08:30:00.000Z'), now)).toBeNull();
    expect(changeBlock({ ...card, state: 'cancelled' }, null, now)).toBe('state');
    expect(changeBlock({ ...card, invitation: { uid: 'x' } }, null, now)).toBe('invitation');
    expect(changeBlock({ ...card, movedTo: { id: 'x' } }, null, now)).toBe('moved');
    expect(changeBlock({ ...card, kit: 'appointment' }, null, now)).toBe('kind');
    expect(changeBlock(card, Date.parse('2026-10-27T08:30:00.000Z'), now)).toBe('over');
  });

  it('keeps each person’s answer in a group short of a crowd, and none in a chat of two', () => {
    expect(answersKept('group', 3)).toBe(true);
    expect(answersKept('group', 101)).toBe(false);
    expect(answersKept('direct', 2)).toBe(false);
  });

  it('reads answers for the round they were given in, and the card from them', () => {
    const card = {
      round: 1,
      answers: {
        sara: { a: 'y', r: 1, at: '' },
        omar: { a: 'n', r: 1, at: '', s: '2026-10-30T12:00:00.000Z' },
        lina: { a: 'y', r: 0, at: '' },
      },
    };
    expect(answerOf(card, 'sara')).toBe('going');
    expect(answerOf(card, 'omar')).toBe('not_going');
    // Lina said yes to the old time: asked again, she hasn't answered.
    expect(answerOf(card, 'lina')).toBeNull();
    expect(goingCount(card)).toBe(1);
    const among = answersAmong(card, ['sara', 'omar', 'lina']);
    expect(among).toEqual({
      going: ['sara'],
      notGoing: ['omar'],
      waiting: ['lina'],
      suggested: [{ userId: 'omar', at: '2026-10-30T12:00:00.000Z' }],
    });
    expect(stateByAnswers(card, ['sara', 'omar', 'lina'])).toBe('accepted');
    expect(
      stateByAnswers({ round: 1, answers: { omar: card.answers.omar } }, ['omar', 'lina']),
    ).toBe('proposed');
    expect(stateByAnswers({ round: 1, answers: { omar: card.answers.omar } }, ['omar'])).toBe(
      'declined',
    );
    // Nothing a device made up counts.
    expect(answerOf({ answers: { x: { a: 'maybe', r: 0 } } }, 'x')).toBeNull();
  });
});
