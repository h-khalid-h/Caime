/**
 * The mail provider behind Caime Mail (PRODUCT-REVIEW R75): one interface, a provider chosen by
 * configuration, each a thin call over fetch (as speech and S3 are done). The first is Postmark:
 * its inbound webhook hands over a parsed mail as JSON with the raw message beside it, its API
 * sends one, and its delivery webhook says how far one got. Who sent a mail is never the
 * provider's payload's to say (a sender's own headers come through it): Caime checks the raw
 * message itself (`mail-auth.ts`: DKIM, SPF for the address the provider's server saw connect,
 * DMARC); never a display name, a Reply-To or a Sender.
 */
import { createHash } from 'node:crypto';
import { isNoticeMail } from '@caime/core/mail';
import type { Config } from '../config';
import { addressOf } from './mail-address';

export const MAIL_PROVIDERS = ['postmark'] as const;
export type MailProviderName = (typeof MAIL_PROVIDERS)[number];

/** How each provider names itself, for the processors list and the data processing agreement. */
export const MAIL_PROVIDER_NAMES: Record<MailProviderName, string> = {
  postmark: 'ActiveCampaign, LLC (Postmark)',
};

/** Whose SMTP server a host is, so the privacy page names the company, not the machine. */
export const SMTP_HOST_PROVIDERS: Readonly<Record<string, MailProviderName>> = {
  'smtp.postmarkapp.com': 'postmark',
};

const DEFAULT_BASE: Record<MailProviderName, string> = { postmark: 'https://api.postmarkapp.com' };
/** One deadline for the whole exchange, as webhooks have. */
const TIMEOUT_MS = 20_000;
/** Attachments past this aren't sent (the providers' own ceiling is near it). */
export const MAIL_ATTACHMENT_MAX = 10 * 1024 * 1024;

export type AuthResult = 'pass' | 'fail' | 'none' | 'other';

/** What Caime found out about who sent a mail (`mail-auth.ts`). */
export interface MailAuth {
  spf: { result: AuthResult; domain: string | null } | null;
  dkim: Array<{ result: AuthResult; domain: string | null }>;
  dmarc: { result: AuthResult; domain: string | null } | null;
}

export interface MailAttachment {
  name: string;
  mime: string;
  bytes: Buffer;
}

/** A mail as it arrived, whoever the provider. */
/** The longest HTML part kept to be shown as sent (R75): a mail's own design, not a site. */
export const MAIL_HTML_MAX = 500_000;

export interface InboundMail {
  /** The Message-ID header, or one made from the mail when it has none. */
  rfcMessageId: string;
  from: { address: string; name: string | null };
  /** Every address in To and Cc, and the one it was delivered to (Bcc, a list), lowercased. */
  to: string[];
  subject: string | null;
  /** The reply's own words where the provider strips the quoted history, else the whole text. */
  text: string;
  /** Its HTML part as sent, when it has one under `MAIL_HTML_MAX` characters (R75 phase 2). */
  html: string | null;
  inReplyTo: string | null;
  references: string[];
  /** The message as it arrived, for Caime's own check of who sent it; null when not sent. */
  raw: string | null;
  /** The provider's spam verdict. */
  spam: boolean;
  /**
   * Bulk or no-reply mail (R75, core `isNoticeMail`): its list headers, precedence, an
   * automatic submission, or an address nobody answers from.
   */
  notice: boolean;
  attachments: MailAttachment[];
}

export interface OutboundMail {
  from: { address: string; name: string };
  to: string;
  subject: string;
  text: string;
  /** Our own Message-ID for it, for the other side's replies to thread by. */
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  attachments: MailAttachment[];
  /** Ask the provider to say when it's opened (its pixel, on an HTML copy of the text). */
  trackOpens: boolean;
}

export interface DeliveryEvent {
  providerId: string;
  /** `opened` is the provider's pixel: probably read, never certainly (R75). */
  state: 'delivered' | 'bounced' | 'opened';
  detail: string | null;
  at: string | null;
}

/** A provider refused a mail for what it is (an address, a size): no retry will help. */
export class MailRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailRefused';
  }
}

export interface MailProvider {
  name: MailProviderName;
  /** The hosts of the provider's receiving servers, which write the topmost Received line. */
  receivingHosts: RegExp;
  /** The mail an inbound webhook delivered, or null when the body isn't one. */
  inbound(body: unknown): InboundMail | null;
  send(mail: OutboundMail): Promise<{ providerId: string }>;
  /** The delivery events a webhook delivered (none for a body that isn't one). */
  events(body: unknown): DeliveryEvent[];
  /** The provider's cheapest authenticated read (R78: the provider probe). Throws when it fails. */
  ping(): Promise<void>;
}

/** The provider this Caime is configured for, or null: then nothing is received or sent. */
export function mailProviderFor(config: Config): MailProvider | null {
  if (!config.MAIL_PROVIDER || !config.MAIL_DOMAIN) return null;
  return postmark(config);
}

// --- Postmark --------------------------------------------------------------------------------

interface PostmarkHeader {
  Name?: string;
  Value?: string;
}
interface PostmarkMailbox {
  Email?: string;
  Name?: string;
}
interface PostmarkInbound {
  FromFull?: PostmarkMailbox;
  From?: string;
  ToFull?: PostmarkMailbox[];
  CcFull?: PostmarkMailbox[];
  Subject?: string;
  MessageID?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Headers?: PostmarkHeader[];
  Attachments?: Array<{ Name?: string; Content?: string; ContentType?: string }>;
  /** The address it was delivered to (a Bcc, a list): the envelope's recipient. */
  OriginalRecipient?: string;
  /** The message as it arrived, with "Include raw email content" on (DEPLOY.md). */
  RawEmail?: string;
}
interface PostmarkEvent {
  RecordType?: string;
  MessageID?: string;
  DeliveredAt?: string;
  BouncedAt?: string;
  ReceivedAt?: string;
  Type?: string;
  Description?: string;
  Details?: string;
}

const header = (headers: PostmarkHeader[], name: string): string[] =>
  headers
    .filter((h) => (h.Name ?? '').toLowerCase() === name.toLowerCase())
    .map((h) => h.Value ?? '')
    .filter(Boolean);

/** Message ids in a header's value: each "<…>". */
const idsIn = (value: string): string[] => value.match(/<[^<>\s]+>/g) ?? [];

/** Plain words as HTML, as they'd read in plain text: escaped, lines kept. */
export function textAsHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<div style="white-space:pre-wrap">${escaped}</div>`;
}

/** HTML as plain words, for a mail that carries no text part: tags out, entities read. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function postmark(config: Config): MailProvider {
  const base = (config.MAIL_BASE_URL ?? DEFAULT_BASE.postmark).replace(/\/+$/, '');
  return {
    name: 'postmark',
    // Postmark's inbound servers (inbound.postmarkapp.com, and its own hosts at mtasv.net).
    receivingHosts: /(^|\.)(postmarkapp\.com|mtasv\.net)$/i,
    async ping() {
      const res = await fetch(`${base}/server`, {
        headers: {
          accept: 'application/json',
          'x-postmark-server-token': config.MAIL_PROVIDER_TOKEN ?? '',
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Postmark answered ${res.status}`);
      // Without the raw message no sender can be vouched for, and every mail in is dropped.
      const server = (await res.json().catch(() => ({}))) as { RawEmailEnabled?: boolean };
      if (server.RawEmailEnabled === false)
        throw new Error('Postmark sends no raw message: turn on "Include raw email content"');
    },
    inbound(body) {
      const m = body as PostmarkInbound | null;
      if (!m || typeof m !== 'object' || (!m.FromFull && !m.From)) return null;
      const headers = m.Headers ?? [];
      const from =
        (m.FromFull?.Email && addressOf(m.FromFull.Email)) || (m.From && addressOf(m.From));
      if (!from) return null;
      const to = [
        ...new Set(
          [...(m.ToFull ?? []), ...(m.CcFull ?? []), { Email: m.OriginalRecipient }]
            .map((x) => (x.Email ? addressOf(x.Email) : null))
            .filter((x): x is string => Boolean(x)),
        ),
      ];
      const text = (
        m.StrippedTextReply?.trim() ||
        m.TextBody?.trim() ||
        htmlToText(m.HtmlBody ?? '')
      ).trim();
      const given = idsIn(header(headers, 'Message-ID')[0] ?? '')[0];
      const rfcMessageId =
        given ??
        `<${createHash('sha256')
          .update(`${from}|${m.Subject ?? ''}|${text}|${m.MessageID ?? ''}`)
          .digest('hex')
          .slice(0, 40)}@caime.invalid>`;
      const references = [...new Set(header(headers, 'References').flatMap(idsIn))];
      const inReplyTo = idsIn(header(headers, 'In-Reply-To')[0] ?? '')[0] ?? null;
      const spamStatus = header(headers, 'X-Spam-Status')[0] ?? '';
      const attachments: MailAttachment[] = [];
      for (const a of m.Attachments ?? []) {
        if (!a.Content) continue;
        const bytes = Buffer.from(a.Content, 'base64');
        if (bytes.length === 0 || bytes.length > MAIL_ATTACHMENT_MAX) continue;
        attachments.push({
          name: (a.Name ?? 'attachment').slice(0, 200),
          mime: a.ContentType ?? 'application/octet-stream',
          bytes,
        });
      }
      return {
        rfcMessageId,
        from: { address: from, name: m.FromFull?.Name?.trim() || null },
        to,
        subject: m.Subject?.trim() || null,
        text,
        inReplyTo,
        references,
        raw: typeof m.RawEmail === 'string' && m.RawEmail ? m.RawEmail : null,
        spam: /^yes/i.test(spamStatus),
        html: m.HtmlBody?.trim() && m.HtmlBody.length <= MAIL_HTML_MAX ? m.HtmlBody : null,
        notice: isNoticeMail(from, {
          list:
            header(headers, 'List-Id').length > 0 || header(headers, 'List-Unsubscribe').length > 0,
          precedence: header(headers, 'Precedence')[0] ?? null,
          autoSubmitted: header(headers, 'Auto-Submitted')[0] ?? null,
        }),
        attachments,
      };
    },
    async send(mail) {
      const res = await fetch(`${base}/email`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-postmark-server-token': config.MAIL_PROVIDER_TOKEN ?? '',
        },
        body: JSON.stringify({
          From: `${mail.from.name.replace(/[<>"\r\n]/g, '')} <${mail.from.address}>`,
          To: mail.to,
          Subject: mail.subject,
          TextBody: mail.text,
          // Opens are told only through a pixel in an HTML part: the same words, as HTML.
          ...(mail.trackOpens ? { HtmlBody: textAsHtml(mail.text), TrackOpens: true } : {}),
          MessageStream: 'outbound',
          Headers: [
            { Name: 'Message-ID', Value: mail.messageId },
            ...(mail.inReplyTo ? [{ Name: 'In-Reply-To', Value: mail.inReplyTo }] : []),
            ...(mail.references.length
              ? [{ Name: 'References', Value: mail.references.join(' ') }]
              : []),
          ],
          Attachments: mail.attachments.map((a) => ({
            Name: a.name,
            Content: a.bytes.toString('base64'),
            ContentType: a.mime,
          })),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => ({}))) as {
        MessageID?: string;
        ErrorCode?: number;
        Message?: string;
      };
      if (res.status === 422 || (res.ok && json.ErrorCode))
        throw new MailRefused(json.Message ?? `Refused (${json.ErrorCode ?? res.status})`);
      if (!res.ok) throw new Error(`Postmark answered ${res.status}`);
      if (!json.MessageID) throw new Error('Postmark answered without a message id');
      return { providerId: json.MessageID };
    },
    events(body) {
      const list = Array.isArray(body) ? body : [body];
      const out: DeliveryEvent[] = [];
      for (const raw of list as PostmarkEvent[]) {
        if (!raw || typeof raw !== 'object' || !raw.MessageID) continue;
        if (raw.RecordType === 'Delivery')
          out.push({
            providerId: raw.MessageID,
            state: 'delivered',
            detail: null,
            at: raw.DeliveredAt ?? null,
          });
        else if (raw.RecordType === 'Bounce')
          out.push({
            providerId: raw.MessageID,
            state: 'bounced',
            detail: [raw.Type, raw.Description].filter(Boolean).join(': ') || null,
            at: raw.BouncedAt ?? null,
          });
        else if (raw.RecordType === 'Open')
          out.push({
            providerId: raw.MessageID,
            state: 'opened',
            detail: null,
            at: raw.ReceivedAt ?? null,
          });
      }
      return out;
    },
  };
}
