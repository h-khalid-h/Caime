import { describe, expect, it } from 'vitest';
import {
  bareSubject,
  isNoticeMail,
  MAIL_CARDS,
  notByMail,
  notByMailText,
  replySubject,
  SUBJECT_LINE_MAX,
  SUBJECT_MAX,
  subjectFromText,
} from './mail';

describe('bareSubject', () => {
  it('drops the replies’ and forwards’ prefixes, stacked, counted, and in other languages', () => {
    expect(bareSubject('Re: Venue for March')).toBe('Venue for March');
    expect(bareSubject('RE: Fwd: Re[2]: Venue for March')).toBe('Venue for March');
    expect(bareSubject('TR : Devis')).toBe('Devis');
    expect(bareSubject('رد: موعد الأسبوع القادم')).toBe('موعد الأسبوع القادم');
    expect(bareSubject('  Venue   for  March ')).toBe('Venue for March');
  });

  it('keeps a word that only starts like a prefix', () => {
    expect(bareSubject('Rerun the numbers')).toBe('Rerun the numbers');
    expect(bareSubject('Tracking: parcel 7')).toBe('Tracking: parcel 7');
  });

  it('is null with nothing left, and no longer than a topic’s name', () => {
    expect(bareSubject('Re:')).toBeNull();
    expect(bareSubject('')).toBeNull();
    expect(bareSubject(null)).toBeNull();
    expect(bareSubject('x'.repeat(200))).toHaveLength(SUBJECT_MAX);
  });
});

describe('subjectFromText', () => {
  it('is the first line with words in it, cut to a mail’s width', () => {
    expect(subjectFromText('\n\n Could you send the contract?\nThanks')).toBe(
      'Could you send the contract?',
    );
    const long = subjectFromText('word '.repeat(30).trim());
    expect(long?.length).toBeLessThanOrEqual(SUBJECT_LINE_MAX);
    expect(long?.endsWith('…')).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });

  it('is null for blank words', () => {
    expect(subjectFromText('')).toBeNull();
    expect(subjectFromText('  \n \r\n')).toBeNull();
  });
});

describe('replySubject', () => {
  it('answers under one Re:, whatever the thread stacked, and nothing without a subject', () => {
    expect(replySubject('Venue for March')).toBe('Re: Venue for March');
    expect(replySubject('RE: Fwd: Venue for March')).toBe('Re: Venue for March');
    expect(replySubject('Re:')).toBe('Re: Re:');
    expect(replySubject(null)).toBeNull();
    expect(replySubject('')).toBeNull();
  });
});

describe('a notice by mail (R75)', () => {
  const none = { list: false, precedence: null, autoSubmitted: null };
  it('is mail to a list, by a machine, or from an address nobody answers', () => {
    expect(isNoticeMail('news@shop.example', { ...none, list: true })).toBe(true);
    expect(isNoticeMail('hana@clinic.example', { ...none, precedence: 'Bulk' })).toBe(true);
    expect(isNoticeMail('hana@clinic.example', { ...none, autoSubmitted: 'auto-generated' })).toBe(
      true,
    );
    expect(isNoticeMail('no-reply@linkedin.example', none)).toBe(true);
    expect(isNoticeMail('noreply+abc@bank.example', none)).toBe(true);
    expect(isNoticeMail('notifications@github.example', none)).toBe(true);
  });
  it('never a person writing, whatever their address', () => {
    expect(isNoticeMail('hana@clinic.example', none)).toBe(false);
    expect(isNoticeMail('newsom@family.example', none)).toBe(false);
    expect(isNoticeMail('hana@clinic.example', { ...none, autoSubmitted: 'no' })).toBe(false);
    expect(isNoticeMail('hana@clinic.example', { ...none, precedence: 'first-class' })).toBe(false);
  });
});

describe('notByMail (M16 F3)', () => {
  const meeting = (fields: Record<string, unknown>) => ({
    kit: 'meeting',
    fields: {
      title: 'Walkthrough',
      start: { at: '2026-10-21T10:00:00Z', hasTime: true },
      ...fields,
    },
  });

  it('lets through what a mail carries: words, files, a voice note, a place, the cards it can say', () => {
    for (const kind of ['text', 'media', 'file', 'voice']) expect(notByMail(kind, {})).toBeNull();
    expect(notByMail('location', { lat: 30, lng: 31, label: 'Café Riche' })).toBeNull();
    for (const kit of MAIL_CARDS)
      expect(
        notByMail('kit', kit === 'meeting' ? meeting({ place: 'Café Riche' }) : { kit }),
      ).toBeNull();
    expect(notByMail('kit', meeting({ place: 'meet.google.com/abc-defg-hij' }))).toBeNull();
  });

  it('keeps back what would never reach them, and says why', () => {
    for (const kind of ['sticker', 'poll', 'contact', 'system'])
      expect(notByMail(kind, {})).toBe('kind');
    for (const kit of [
      'approval',
      'document_review',
      'checklist',
      'shared_album',
      'split',
      'form',
      'custom',
    ])
      expect(notByMail('kit', { kit })).toBe('kind');
    expect(notByMail('location', { lat: 30, lng: 31, live: { minutes: 15 } })).toBe('live');
    // A call's recording shared on plays in Caime alone (R114 (7)).
    expect(notByMail('text', { recording: { callId: 'c1' } })).toBe('kind');
    expect(notByMail('kit', meeting({ place: 'Café Riche', repeat: 'week' }))).toBe('repeats');
    expect(notByMail('kit', { kit: 'appointment', fields: { repeat: 'month' } })).toBe('repeats');
    // Held on Caime: nobody joins its call from a mail, but in a one-to-one, where the mail
    // carries their own link to it (M16 F6c).
    expect(notByMail('kit', meeting({}))).toBe('where');
    expect(notByMail('kit', meeting({ place: 'Caime' }))).toBe('where');
    expect(notByMail('kit', meeting({}), true)).toBeNull();
    expect(notByMailText('where')).toBe(
      'Say where it is: someone reached by email can’t join a call on Caime.',
    );
    expect(notByMailText('kind')).toBe('That doesn’t travel by email: they’d never see it.');
  });
});
