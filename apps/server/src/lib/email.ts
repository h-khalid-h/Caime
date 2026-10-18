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
  kind?: 'verification' | 'reset' | 'invitation' | 'address' | 'booking';
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

// The texts stay ASCII, so they travel as plain 7-bit text (and the end-to-end stub reads them).
export function verificationMail(to: string, name: string, code: string): Mail {
  return {
    to,
    kind: 'verification',
    subject: `${code} is your Caime code`,
    text: [
      `Hi ${name},`,
      '',
      `Your code to confirm this address is ${code}. It works for a day.`,
      '',
      "If you didn't sign up for Caime, someone typed your address by mistake: nothing else",
      'will be sent, and the account can be deleted from its Settings by whoever made it.',
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
