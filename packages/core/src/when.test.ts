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

describe('parseWhen — the recent past, days of the month, evenings', () => {
  it('last Friday, yesterday and last week are past, never ahead', () => {
    // Wednesday: last Friday is five days back.
    expect(one('I sent it last Friday')).toMatchObject({ date: '2026-09-18', past: true });
    expect(one('we spoke yesterday')).toMatchObject({ date: '2026-09-22', past: true });
    expect(one('the day before yesterday').date).toBe('2026-09-21');
    expect(one('last night at 9')).toMatchObject({ date: '2026-09-22', time: '21:00', past: true });
    expect(one('photos from last week')).toMatchObject({ date: '2026-09-16', past: true });
    // "last Wednesday" on a Wednesday is a week ago, not today.
    expect(one('last Wednesday').date).toBe('2026-09-16');
    expect(firstFutureWhen('I sent it last Friday', ny)).toBeUndefined();
  });

  it('a day of the month is this month while ahead, else next', () => {
    expect(one("I'll pay you back on the 30th")).toMatchObject({ date: '2026-09-30', past: false });
    expect(one('by the 12th').date).toBe('2026-10-12');
    expect(one('the 23rd').date).toBe('2026-09-23');
    expect(parseWhen('the 3rd time around', ny)).toEqual([]);
    expect(parseWhen('on the 5th floor', ny)).toEqual([]);
  });

  it('a meal or an evening makes a bare hour the evening’s', () => {
    expect(one('dinner at 8').time).toBe('20:00');
    expect(one('tonight at 8')).toMatchObject({ date: '2026-09-23', time: '20:00' });
    expect(one('tomorrow evening at 7')).toMatchObject({ date: '2026-09-24', time: '19:00' });
    expect(one('drinks at 9?').time).toBe('21:00');
    // Without such a word, nine is still the morning and ten the hour it says.
    expect(one('call me at 9').time).toBe('09:00');
    expect(one('tomorrow morning at 10')).toMatchObject({ date: '2026-09-24', time: '10:00' });
  });

  it('Arabic durations and half hours', () => {
    expect(one('رح أبعتلك الملف بعد أسبوعين', cairo).date).toBe('2026-10-09');
    expect(one('خلال 3 أيام', cairo).date).toBe('2026-09-28');
    expect(one('بعد شهر', cairo).date).toBe('2026-10-25');
    expect(one('نتقابل الساعة 5 ونص', cairo).time).toBe('17:30');
    expect(one('الساعة 10 وربع الصبح', cairo).time).toBe('10:15');
    expect(one('الساعة 6 إلا ربع مساء', cairo).time).toBe('17:45');
  });
});

// The same Wednesday: 16:00 in Paris, 17:00 in Istanbul (Monday-first workweeks).
const paris = { now: ny.now, timeZone: 'Europe/Paris', locale: 'fr-FR' };
const istanbul = { now: ny.now, timeZone: 'Europe/Istanbul', locale: 'tr-TR' };

describe('parseWhen — French', () => {
  it('days, and the parts of them', () => {
    expect(one("aujourd'hui", paris).date).toBe('2026-09-23');
    expect(one("Je t'envoie le contrat demain", paris)).toMatchObject({
      date: '2026-09-24',
      text: 'demain',
    });
    expect(one('après-demain', paris).date).toBe('2026-09-25');
    expect(one('ce soir', paris)).toMatchObject({ date: '2026-09-23', time: '20:00' });
    expect(one('demain matin', paris)).toMatchObject({ date: '2026-09-24', time: '09:00' });
    expect(one('demain soir à 20h', paris)).toMatchObject({ date: '2026-09-24', time: '20:00' });
    expect(one('demain midi', paris)).toMatchObject({ date: '2026-09-24', time: '12:00' });
  });

  it('weekdays go forward; prochain means next week', () => {
    expect(one('lundi', paris).date).toBe('2026-09-28');
    expect(one('ce vendredi', paris).date).toBe('2026-09-25');
    expect(one('vendredi prochain', paris).date).toBe('2026-10-02');
    expect(one("d'ici jeudi", paris)).toMatchObject({ date: '2026-09-24', text: "d'ici jeudi" });
  });

  it('weeks, months and their ends; in N days', () => {
    expect(one('la semaine prochaine', paris).date).toBe('2026-09-28');
    expect(one('le mois prochain', paris).date).toBe('2026-10-01');
    expect(one('ce week-end', paris).date).toBe('2026-09-26');
    expect(one('fin de semaine', paris)).toMatchObject({ date: '2026-09-25', time: '17:00' });
    expect(one('fin du mois', paris)).toMatchObject({ date: '2026-09-30', time: '17:00' });
    expect(one('dans 3 jours', paris).date).toBe('2026-09-26');
    expect(one('dans deux semaines', paris).date).toBe('2026-10-07');
    expect(one('dans 2h', paris)).toMatchObject({ date: '2026-09-23', time: '18:00' });
    // French counts a fortnight as fifteen days.
    expect(one('dans quinze jours', paris).date).toBe('2026-10-07');
  });

  it('days of the month, with and without their month', () => {
    expect(one('le 12', paris).date).toBe('2026-10-12');
    expect(one('le 30', paris).date).toBe('2026-09-30');
    expect(one('le 12 mars', paris).date).toBe('2027-03-12');
    expect(one('12 mars 2027', paris).date).toBe('2027-03-12');
    expect(one('1er novembre', paris).date).toBe('2026-11-01');
    expect(one('le 3 à 14h', paris)).toMatchObject({ date: '2026-10-03', time: '14:00' });
  });

  it('hours as French writes them', () => {
    expect(one('à 15h', paris)).toMatchObject({ date: '2026-09-24', time: '15:00' });
    expect(one('vers 18h30', paris)).toMatchObject({ date: '2026-09-23', time: '18:30' });
    expect(one('rendez-vous demain 15 h', paris)).toMatchObject({
      date: '2026-09-24',
      time: '15:00',
    });
    expect(one('à midi', paris).time).toBe('12:00');
    expect(one('à minuit', paris).time).toBe('00:00');
    expect(one('dîner à 8h', paris).time).toBe('20:00');
    expect(one('8h du soir', paris).time).toBe('20:00');
  });

  it('the recent past is past', () => {
    expect(one('hier', paris)).toMatchObject({ date: '2026-09-22', past: true });
    expect(one('avant-hier', paris).date).toBe('2026-09-21');
    expect(one('lundi dernier', paris)).toMatchObject({ date: '2026-09-21', past: true });
    expect(one('la semaine dernière', paris)).toMatchObject({ date: '2026-09-16', past: true });
    expect(firstFutureWhen("Je l'ai envoyé lundi dernier", paris)).toBeUndefined();
  });

  it('a length of time, a floor or a sound file is no date', () => {
    expect(parseWhen('ça prend 2h', paris)).toEqual([]);
    expect(parseWhen('le 3e étage', paris)).toEqual([]);
    expect(parseWhen("dans l'après-midi", paris)).toEqual([]);
    expect(parseWhen('Send me the midi file', ny)).toEqual([]);
    expect(parseWhen('The call takes 2h', ny)).toEqual([]);
  });
});

describe('parseWhen — Turkish', () => {
  it('days, and the parts of them', () => {
    expect(one('bugün', istanbul).date).toBe('2026-09-23');
    expect(one('Yarın sözleşmeyi göndereceğim', istanbul)).toMatchObject({
      date: '2026-09-24',
      text: 'Yarın',
    });
    expect(one('yarına kadar', istanbul)).toMatchObject({
      date: '2026-09-24',
      text: 'yarına kadar',
    });
    expect(one('öbür gün', istanbul).date).toBe('2026-09-25');
    expect(one('yarından sonra', istanbul).date).toBe('2026-09-25');
    expect(one('bu akşam', istanbul)).toMatchObject({ date: '2026-09-23', time: '20:00' });
    expect(one('yarın sabah', istanbul)).toMatchObject({ date: '2026-09-24', time: '09:00' });
    expect(one("yarın akşam 8'de", istanbul)).toMatchObject({
      date: '2026-09-24',
      time: '20:00',
    });
  });

  it('weekdays, with their endings and cues', () => {
    expect(one('cuma', istanbul).date).toBe('2026-09-25');
    expect(one('cumaya kadar', istanbul).date).toBe('2026-09-25');
    expect(one('Perşembe günü', istanbul).date).toBe('2026-09-24');
    expect(one('haftaya salı', istanbul).date).toBe('2026-09-29');
    expect(one('gelecek cuma', istanbul).date).toBe('2026-09-25');
    expect(one('bu pazar', istanbul).date).toBe('2026-09-27');
    // "Pazar" alone is as often the market.
    expect(parseWhen('pazara gittim', istanbul)).toEqual([]);
  });

  it('weeks, months, weekends; in N days', () => {
    expect(one('haftaya', istanbul).date).toBe('2026-09-28');
    expect(one('gelecek hafta', istanbul).date).toBe('2026-09-28');
    expect(one('gelecek ay', istanbul).date).toBe('2026-10-01');
    expect(one('hafta sonu', istanbul).date).toBe('2026-09-26');
    expect(one('ay sonu', istanbul)).toMatchObject({ date: '2026-09-30', time: '17:00' });
    expect(one('3 gün sonra', istanbul).date).toBe('2026-09-26');
    expect(one('iki hafta sonra', istanbul).date).toBe('2026-10-07');
    expect(one('2 saat sonra', istanbul)).toMatchObject({ date: '2026-09-23', time: '19:00' });
  });

  it('dates and hours', () => {
    expect(one('12 Mart', istanbul).date).toBe('2027-03-12');
    expect(one('12 Mart 2027', istanbul).date).toBe('2027-03-12');
    expect(one("3 Kasım'a kadar", istanbul).date).toBe('2026-11-03');
    expect(one("saat 3'te", istanbul).time).toBe('15:00');
    expect(one("saat 15:00'te", istanbul).time).toBe('15:00');
    expect(one("15.30'da", istanbul).time).toBe('15:30');
    expect(one("akşam 8'de", istanbul).time).toBe('20:00');
    expect(one('öğlen', istanbul).time).toBe('12:00');
  });

  it('the recent past is past', () => {
    expect(one('dün', istanbul)).toMatchObject({ date: '2026-09-22', past: true });
    expect(one('evvelsi gün', istanbul).date).toBe('2026-09-21');
    expect(one('geçen hafta', istanbul)).toMatchObject({ date: '2026-09-16', past: true });
    expect(one('geçen pazartesi', istanbul)).toMatchObject({ date: '2026-09-21', past: true });
    expect(one('dün akşam', istanbul)).toMatchObject({ date: '2026-09-22', time: '19:00' });
  });

  it('a third, a world or a bare number is no date', () => {
    expect(parseWhen("3'te 1", istanbul)).toEqual([]);
    expect(parseWhen('dünya', istanbul)).toEqual([]);
    expect(parseWhen('fiyat 15.30', istanbul)).toEqual([]);
  });
});

describe('firstFutureWhen', () => {
  it('skips past references', () => {
    expect(firstFutureWhen('we met Sep 20, next meeting Oct 2', ny)?.date).toBe('2026-10-02');
  });
});
