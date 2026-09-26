import { describe, expect, it } from 'vitest';
import { firstFutureWhen, parseWhen } from './when';

// Friday 2026-09-25 14:30 in Cairo (UTC+3 in summer), a Sun–Thu workweek region.
const cairo = { now: new Date('2026-09-25T11:30:00Z'), timeZone: 'Africa/Cairo', locale: 'ar-EG' };
// Wednesday 2026-09-23 10:00 in New York.
const ny = { now: new Date('2026-09-23T14:00:00Z'), timeZone: 'America/New_York', locale: 'en-US' };

const one = (text: string, opts = ny) => {
  const r = parseWhen(text, opts);
  expect(r, text).toHaveLength(1);
  return r[0]!;
};

describe('parseWhen — English', () => {
  it('today, tomorrow, the day after', () => {
    expect(one("I'll send it today").date).toBe('2026-09-23');
    expect(one("I'll send the proposal tomorrow").date).toBe('2026-09-24');
    expect(one('tmrw works').date).toBe('2026-09-24');
    expect(one('the day after tomorrow').date).toBe('2026-09-25');
  });

  it('parts of the day and tonight', () => {
    expect(one('tomorrow morning')).toMatchObject({ date: '2026-09-24', time: '09:00' });
    expect(one('tonight')).toMatchObject({ date: '2026-09-23', time: '20:00' });
    expect(one('this afternoon')).toMatchObject({ date: '2026-09-23', time: '15:00' });
  });

  it('date and time combine', () => {
    const m = one('can we talk tomorrow at 3pm?');
    expect(m).toMatchObject({ date: '2026-09-24', time: '15:00', text: 'tomorrow at 3pm' });
    expect(m.at).toBe('2026-09-24T19:00:00.000Z');
    expect(one('Friday 10:30am')).toMatchObject({ date: '2026-09-25', time: '10:30' });
    expect(one('at 5pm on Monday')).toMatchObject({ date: '2026-09-28', time: '17:00' });
  });

  it('weekdays go forward; next means next week', () => {
    expect(one('by Friday').date).toBe('2026-09-25');
    expect(one('on Wednesday').date).toBe('2026-09-30');
    expect(one('this Wednesday').date).toBe('2026-09-23');
    expect(one('next Friday').date).toBe('2026-10-02');
    expect(one('next Monday').date).toBe('2026-09-28');
  });

  it('ignores weekday abbreviations that are ordinary words', () => {
    expect(parseWhen('I sat in the sun and got wed', ny)).toHaveLength(0);
    expect(one('see you on sat').date).toBe('2026-09-26');
  });

  it('relative durations', () => {
    expect(one('in 2 days').date).toBe('2026-09-25');
    expect(one('in a week').date).toBe('2026-09-30');
    expect(one('in 3 hours')).toMatchObject({ date: '2026-09-23', time: '13:00' });
    expect(one('in two months').date).toBe('2026-11-23');
  });

  it('end of day, week and month; next week', () => {
    expect(one('by EOD')).toMatchObject({ date: '2026-09-23', time: '17:00' });
    expect(one('end of the week')).toMatchObject({ date: '2026-09-25', time: '17:00' });
    expect(one('end of month')).toMatchObject({ date: '2026-09-30' });
    expect(one('next week').date).toBe('2026-09-28');
    expect(one('next month').date).toBe('2026-10-01');
    expect(one('this weekend').date).toBe('2026-09-26');
  });

  it('month-name dates, with and without year', () => {
    expect(one('deadline Oct 15').date).toBe('2026-10-15');
    expect(one('October 15th, 2027').date).toBe('2027-10-15');
    expect(one('on 3 November').date).toBe('2026-11-03');
    expect(one('the 1st of December').date).toBe('2026-12-01');
    expect(one('Sep 20').date).toBe('2026-09-20');
    expect(one('Sep 20').past).toBe(true);
    expect(one('January 5').date).toBe('2027-01-05');
  });

  it('may is a month only before a day number', () => {
    expect(parseWhen('I may be late', ny)).toHaveLength(0);
    expect(one('May 5').date).toBe('2027-05-05');
  });

  it('numeric dates follow the locale', () => {
    expect(one('due 10/15').date).toBe('2026-10-15');
    expect(one('due 15/10', { ...ny, locale: 'en-GB' }).date).toBe('2026-10-15');
    expect(one('2026-12-01').date).toBe('2026-12-01');
    expect(one('15.10.2026', { ...ny, locale: 'de-DE' }).date).toBe('2026-10-15');
  });

  it('does not read numbers, ranges and prices as dates or times', () => {
    expect(parseWhen('it costs 10.30 and the score was 3-5', ny)).toHaveLength(0);
    expect(parseWhen('that is 1/2 of it', ny).every((m) => m.date !== '2026-02-01')).toBe(true);
    expect(parseWhen('at 5 people', ny)).toHaveLength(0);
  });

  it('times alone land today or tomorrow', () => {
    expect(one('call me at 3')).toMatchObject({ date: '2026-09-23', time: '15:00' });
    expect(one('at 9am')).toMatchObject({ date: '2026-09-24', time: '09:00' });
    expect(one('around 18:45')).toMatchObject({ date: '2026-09-23', time: '18:45' });
    expect(one('at noon')).toMatchObject({ time: '12:00' });
  });
});

describe('parseWhen — Arabic and local workweeks', () => {
  it('Egyptian and MSA words for today and tomorrow', () => {
    expect(one('هبعتلك العقد بكرة', cairo).date).toBe('2026-09-26');
    expect(one('غداً إن شاء الله', cairo).date).toBe('2026-09-26');
    expect(one('النهارده', cairo).date).toBe('2026-09-25');
    expect(one('بعد بكرة', cairo).date).toBe('2026-09-27');
  });

  it('time with Arabic-Indic digits and parts of the day', () => {
    expect(one('بكرة الساعة ٥', cairo)).toMatchObject({ date: '2026-09-26', time: '17:00' });
    expect(one('الساعة 10 الصبح', cairo)).toMatchObject({ date: '2026-09-26', time: '10:00' });
    expect(one('الساعة 8 بالليل', cairo)).toMatchObject({ time: '20:00' });
  });

  it('weekdays and next week follow the Sunday-first workweek', () => {
    expect(one('يوم الخميس', cairo).date).toBe('2026-10-01');
    expect(one('الأسبوع الجاي', cairo).date).toBe('2026-09-27');
    expect(one('next week', cairo).date).toBe('2026-09-27');
    expect(one('end of the week', cairo).date).toBe('2026-10-01');
  });
});

describe('firstFutureWhen', () => {
  it('skips past references', () => {
    expect(firstFutureWhen('we met Sep 20, next meeting Oct 2', ny)?.date).toBe('2026-10-02');
  });
});
