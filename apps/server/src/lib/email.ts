/**
 * Mail out of Caime (R48): the code that confirms an address and the link that resets a
 * forgotten password. Plain text, from `EMAIL_FROM`, through `SMTP_URL`; nothing else is sent,
 * and without an SMTP server nothing is (`ctx.mail` is null and the routes say so). Sent after
 * the response (`ctx.defer`), never through the job queue: a reset link is a secret, and the
 * queue keeps payloads at rest.
 */
import type { FastifyBaseLogger } from 'fastify';
import nodemailer from 'nodemailer';
import type { Config } from '../config';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** What kind of mail, for the log: never the subject, which carries a code. */
  kind?: 'verification' | 'reset' | 'invitation' | 'address' | 'booking' | 'report' | 'appeal';
  /** A calendar invitation (R84), sent as its own part so mail apps offer Accept and Decline. */
  icalEvent?: { method: 'REQUEST' | 'CANCEL'; content: string };
  /** Who it's from when not `EMAIL_FROM`: Cai's own address, for a meeting's invitations (R86). */
  from?: string;
  replyTo?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
  /** Connect and sign in, send nothing (R78: the provider probe). Throws when it can't. */
  verify(): Promise<void>;
}

export function createMailer(config: Config, log: FastifyBaseLogger): Mailer | null {
  if (!config.SMTP_URL) return null;
  const transport = nodemailer.createTransport(config.SMTP_URL);
  return {
    async send(mail) {
      await transport.sendMail({ ...mail, from: mail.from ?? config.EMAIL_FROM });
      log.info({ kind: mail.kind ?? 'other' }, 'mail sent');
    },
    async verify() {
      await transport.verify();
    },
  };
}

/** A mailer that keeps what it was given: the tests read the outbox. */
export function memoryMailer(): Mailer & { outbox: Mail[] } {
  const outbox: Mail[] = [];
  return {
    outbox,
    async send(mail) {
      outbox.push(mail);
    },
    async verify() {},
  };
}

/** The address `EMAIL_FROM` names (`Caime <hello@cai.me>` is `hello@cai.me`). */
export function fromAddress(emailFrom: string): string {
  const m = /<([^>]+)>/.exec(emailFrom);
  return (m?.[1] ?? emailFrom).trim();
}

/**
 * Why a code went to an address: signing up, or a visitor booking or writing on a page before
 * an account (R97 (1)), whose mail says that nothing happens without the code.
 */
export type CodePurpose = 'signup' | 'visitor';

// The texts stay ASCII, so they travel as plain 7-bit text (and the end-to-end stub reads them).
export function verificationMail(
  to: string,
  name: string,
  code: string,
  purpose: CodePurpose = 'signup',
): Mail {
  return {
    to,
    kind: 'verification',
    subject: `${code} is your Caime code`,
    text: [
      `Hi ${name},`,
      '',
      `Your code to confirm this address is ${code}. It works for a day.`,
      '',
      ...(purpose === 'visitor'
        ? [
            "If you didn't book or write to anyone on Caime, someone typed your address by",
            'mistake: without the code nothing is booked or sent, and nothing else will be.',
          ]
        : [
            "If you didn't sign up for Caime, someone typed your address by mistake: nothing else",
            'will be sent, and the account can be deleted from its Settings by whoever made it.',
          ]),
      '',
      'Caime',
    ].join('\n'),
  };
}

export function resetMail(to: string, name: string, link: string): Mail {
  return {
    to,
    kind: 'reset',
    subject: 'Reset your Caime password',
    text: [
      `Hi ${name},`,
      '',
      'Someone asked to reset the password of the Caime account with this address. If that was',
      'you, open this link within the hour:',
      '',
      link,
      '',
      "If it wasn't, ignore this: your password stays as it is, and the link dies on its own.",
      '',
      'Caime',
    ].join('\n'),
  };
}

/**
 * A visitor's report received (M16 B6, the DSA's Art. 16(4)): what they reported and that someone
 * reads it; the decision follows by `visitorReportDecisionMail`.
 */
export function visitorReportReceiptMail(to: string, name: string | null, page: string): Mail {
  return {
    to,
    kind: 'report',
    subject: 'We received your report',
    text: [
      name ? `Hi ${name},` : 'Hi,',
      '',
      `Thanks for telling us about ${page}.`,
      '',
      'Someone at Caime reads every report. We will write to you at this address when we have',
      'decided what to do about it.',
      '',
      'Caime',
    ].join('\n'),
  };
}

/** What became of a visitor's report (M16 B6, Art. 16(5)), and how to say it was wrong. */
export function visitorReportDecisionMail(
  to: string,
  name: string | null,
  page: string,
  acted: boolean,
): Mail {
  return {
    to,
    kind: 'report',
    subject: 'About your report',
    text: [
      name ? `Hi ${name},` : 'Hi,',
      '',
      `We looked at what you reported on ${page}.`,
      '',
      acted
        ? 'We acted on it. We do not say what was done, to protect everyone involved.'
        : 'We decided not to act on it: as we read it, it does not break the rules people agree to on Caime.',
      '',
      'If you think we got it wrong, reply to this email and say why: someone else will look again.',
      '',
      'Caime',
    ].join('\n'),
  };
}

/** An appeal decided (M16 B6, Art. 20): lifted, or upheld with the operator's note. */
export function appealDecisionMail(
  to: string,
  name: string,
  lifted: boolean,
  note: string | null,
): Mail {
  return {
    to,
    kind: 'appeal',
    subject: lifted ? 'Your Caime account is back' : 'About your appeal',
    text: [
      `Hi ${name},`,
      '',
      lifted
        ? 'We looked at your appeal and lifted the suspension: you can sign in again.'
        : 'We looked at your appeal and the suspension stands.',
      ...(note ? ['', note] : []),
      '',
      lifted
        ? 'Caime'
        : 'You can still download your data from the sign-in screen. If you disagree, you may also take it to a certified out-of-court dispute settlement body, or to a court.',
      ...(lifted ? [] : ['', 'Caime']),
    ].join('\n'),
  };
}
