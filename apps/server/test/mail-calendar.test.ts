/**
 * The calendar in a mail (M16 F3): an answer to an invitation, as a calendar app sends it, read
 * from an attachment or from the message as it arrived (Outlook's and Apple's put it in the
 * message itself), whatever its transfer encoding.
 */
import { describe, expect, it } from 'vitest';
import { calendarOf, calendarPartOf } from '../src/lib/mail-calendar';
import type { InboundMail } from '../src/lib/mail-provider';

const REPLY = [
  'BEGIN:VCALENDAR',
  'METHOD:REPLY',
  'BEGIN:VEVENT',
  'UID:meeting-0193f1b2-0000-7000-8000-000000000001@caime',
  'ATTENDEE;CN=Tarek;PARTSTAT=ACCEPTED:mailto:tarek@outside.example',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

/** A reply as Outlook sends it: the calendar one of the message's alternatives. */
const outlook = (encoding: string, body: string) =>
  [
    'From: Tarek <tarek@outside.example>',
    'To: rana.mail@caime.test',
    'Subject: Accepted: Venue walkthrough',
    'Content-Type: multipart/alternative; boundary="b1"',
    '',
    '--b1',
    'Content-Type: text/plain; charset="utf-8"',
    '',
    'Tarek has accepted this invitation.',
    '--b1',
    'Content-Type: text/calendar; charset="utf-8";',
    ' method=REPLY',
    `Content-Transfer-Encoding: ${encoding}`,
    '',
    body,
    '--b1--',
    '',
  ].join('\r\n');

const mail = (over: Partial<InboundMail>): InboundMail => ({
  rfcMessageId: '<x@outside.example>',
  from: { address: 'tarek@outside.example', name: 'Tarek' },
  to: ['rana.mail@caime.test'],
  subject: 'Accepted: Venue walkthrough',
  text: 'Tarek has accepted this invitation.',
  html: null,
  inReplyTo: null,
  references: [],
  raw: null,
  spam: false,
  notice: false,
  attachments: [],
  ...over,
});

describe('calendarPartOf', () => {
  it('reads a text/calendar part as it arrived: base64, quoted-printable or as it is', () => {
    const base64 = Buffer.from(REPLY).toString('base64').replace(/.{76}/g, '$&\r\n');
    expect(calendarPartOf(outlook('base64', base64))).toBe(REPLY);
    const qp = REPLY.replace(/=/g, '=3D').replace(/PARTSTAT/, 'PART=\r\nSTAT');
    expect(calendarPartOf(outlook('quoted-printable', qp))).toContain('PARTSTAT=ACCEPTED');
    expect(calendarPartOf(outlook('7bit', REPLY))).toBe(REPLY);
  });

  it('finds none where there is no calendar, and never throws on a broken part', () => {
    expect(calendarPartOf('From: a@b.example\r\n\r\nHello')).toBeNull();
    expect(calendarPartOf(outlook('base64', '!!!not base64!!!'))).toBeNull();
    expect(calendarPartOf('Content-Type: text/calendar\r\n')).toBeNull();
  });
});

describe('calendarOf', () => {
  it('takes an attached .ics first, then the message as it arrived, then words that are a calendar', () => {
    const attached = mail({
      attachments: [{ name: 'invite.ics', mime: 'application/ics', bytes: Buffer.from(REPLY) }],
    });
    expect(calendarOf(attached)).toBe(REPLY);
    expect(calendarOf(mail({ raw: outlook('7bit', REPLY) }))).toBe(REPLY);
    expect(calendarOf(mail({ text: REPLY }))).toBe(REPLY);
    expect(calendarOf(mail({}))).toBeNull();
  });
});
