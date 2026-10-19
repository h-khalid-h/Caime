import { describe, expect, it } from 'vitest';
import type { BookingHours } from './booking';
import { nextOpening, openAt } from './opening';
import { matchingReplies, quickReplyQuery } from './quick-replies';

// Cairo, Sunday to Thursday 9:00 to 17:00; a branch open Saturday mornings; a holiday.
const hours: BookingHours = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  days: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
  leadMinutes: 0,
  horizonDays: 30,
  placeHours: [{ placeId: 'branch', days: [{ weekday: 6, start: '10:00', end: '13:00' }] }],
  closed: [{ from: '2026-10-21', to: '2026-10-21' }],
};

describe('when a host is open (M16 H2)', () => {
  it('reads its week on its own clock, its branches’ weeks and its closed days', () => {
    // Sunday 18 October 2026: 10:00 in Cairo is 07:00 UTC.
    expect(openAt(hours, new Date('2026-10-18T07:00:00Z'))).toBe(true);
    // 17:00 is closing time: closed from then.
    expect(openAt(hours, new Date('2026-10-18T14:00:00Z'))).toBe(false);
    // Friday: nobody's open.
    expect(openAt(hours, new Date('2026-10-23T08:00:00Z'))).toBe(false);
    // Saturday morning the branch is.
    expect(openAt(hours, new Date('2026-10-24T08:00:00Z'))).toBe(true);
    // Wednesday 21 is a holiday whatever the week says.
    expect(openAt(hours, new Date('2026-10-21T08:00:00Z'))).toBe(false);
  });

  it('says when it opens next, past closed days, and never when it has no hours', () => {
    // Sunday evening: Monday at 9:00 in Cairo.
    expect(nextOpening(hours, new Date('2026-10-18T16:00:00Z'))?.toISOString()).toBe(
      '2026-10-19T06:00:00.000Z',
    );
    // Tuesday evening: Wednesday is a holiday, so Thursday.
    expect(nextOpening(hours, new Date('2026-10-20T16:00:00Z'))?.toISOString()).toBe(
      '2026-10-22T06:00:00.000Z',
    );
    // Thursday evening: the branch on Saturday comes before Sunday.
    expect(nextOpening(hours, new Date('2026-10-22T16:00:00Z'))?.toISOString()).toBe(
      '2026-10-24T07:00:00.000Z',
    );
    expect(nextOpening({ ...hours, days: [], placeHours: [] }, new Date())).toBeNull();
  });
});

describe('quick replies (M16 H2)', () => {
  const replies = [
    { shortcut: 'hours', body: 'We open at nine.' },
    { shortcut: 'Hello', body: 'Welcome!' },
    { shortcut: 'مرحبا', body: 'أهلًا بك!' },
  ];
  it('are asked for by "/" and the start of a shortcut, without case or Arabic marks', () => {
    expect(quickReplyQuery('/')).toBe('');
    expect(quickReplyQuery('/HO')).toBe('ho');
    expect(quickReplyQuery('/ho there')).toBeNull();
    expect(quickReplyQuery('see /ho')).toBeNull();
    expect(matchingReplies(replies, quickReplyQuery('/h') ?? '')).toHaveLength(2);
    expect(matchingReplies(replies, quickReplyQuery('/hel') ?? '')).toEqual([replies[1]]);
    expect(matchingReplies(replies, quickReplyQuery('/مرحبأ') ?? '')).toEqual([replies[2]]);
    expect(matchingReplies(replies, quickReplyQuery('/') ?? '')).toEqual(replies);
  });
});
