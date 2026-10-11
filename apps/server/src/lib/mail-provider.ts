/**
 * The mail provider behind Caime Mail (PRODUCT-REVIEW R75): one interface, a provider chosen by
 * configuration, each a thin call over fetch (as speech and S3 are done). The first is Postmark:
 * its inbound webhook hands over a parsed mail as JSON, its API sends one, and its delivery
 * webhook says how far one got. The server trusts a sender only by what the provider's mail
 * server authenticated (DMARC: SPF or DKIM aligned with the From domain), read from the
 * Authentication-Results and Received-SPF headers it writes; never a display name, a Reply-To
 * or a Sender.
 */
import { createHash } from 'node:crypto';
import type { Config } from '../config';
import { addressOf } from './mail-address';

export const MAIL_PROVIDERS = ['postmark'] as const;
export type MailProviderName = (typeof MAIL_PROVIDERS)[number];

/** How each provider names itself, for the processors list and the data processing agreement. */
export const MAIL_PROVIDER_NAMES: Record<MailProviderName, string> = {
  postmark: 'ActiveCampaign, LLC (Postmark)',
};

const DEFAULT_BASE: Record<MailProviderName, string> = { postmark: 'https://api.postmarkapp.com' };
/** One deadline for the whole exchange, as webhooks have. */
const TIMEOUT_MS = 20_000;
/** Attachments past this aren't sent (the providers' own ceiling is near it). */
export const MAIL_ATTACHMENT_MAX = 10 * 1024 * 1024;

export type AuthResult = 'pass' | 'fail' | 'none' | 'other';

/** What the receiving mail server found out about who sent a mail. */
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
export interface InboundMail {
  /** The Message-ID header, or one made from the mail when it has none. */
  rfcMessageId: string;
  from: { address: string; name: string | null };
  /** Every address in To and Cc, lowercased. */
  to: string[];
  subject: string | null;
  /** The reply's own words where the provider strips the quoted history, else the whole text. */
  text: string;
  inReplyTo: string | null;
  references: string[];
  auth: MailAuth;
  /** The provider's spam verdict. */
  spam: boolean;
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
}

export interface DeliveryEvent {
  providerId: string;
  state: 'delivered' | 'bounced';
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
  /** The mail an inbound webhook delivered, or null when the body isn't one. */
  inbound(body: unknown): InboundMail | null;
  send(mail: OutboundMail): Promise<{ providerId: string }>;
  /** The delivery events a webhook delivered (none for a body that isn't one). */
  events(body: unknown): DeliveryEvent[];
}

/** The provider this Caime is configured for, or null: then nothing is received or sent. */
export function mailProviderFor(config: Config): MailProvider | null {
  if (!config.MAIL_PROVIDER || !config.MAIL_DOMAIN) return null;
  return postmark(config);
}

// --- Authentication headers ------------------------------------------------------------------

const asResult = (word: string | undefined): AuthResult => {
  const w = (word ?? '').toLowerCase();
  return w === 'pass'
    ? 'pass'
    : w === 'fail' || w === 'softfail'
      ? 'fail'
      : w === 'none'
        ? 'none'
        : 'other';
};

/**
 * An Authentication-Results header (RFC 8601): "authserv-id; method=result props; ...". Several
 * headers (a forwarding hop's among them) are read in turn; the last word on a method wins.
 */
export function parseAuthenticationResults(headers: string[]): MailAuth {
  const auth: MailAuth = { spf: null, dkim: [], dmarc: null };
  for (const header of headers) {
    const parts = header.split(';').map((p) => p.trim());
    for (const part of parts.slice(1)) {
      const m = /^(dkim|spf|dmarc)\s*=\s*([a-z]+)(.*)$/i.exec(part);
      if (!m) continue;
      const method = m[1]?.toLowerCase();
      const result = asResult(m[2]);
      const props = m[3] ?? '';
      const prop = (name: string) =>
        new RegExp(`${name}\\s*=\\s*([^\\s;()]+)`, 'i').exec(props)?.[1]?.toLowerCase() ?? null;
      if (method === 'dkim')
        auth.dkim.push({
          result,
          domain: prop('header\\.d') ?? prop('header\\.i')?.replace(/^.*@/, '') ?? null,
        });
      else if (method === 'spf') {
        const from = prop('smtp\\.mailfrom') ?? prop('envelope-from');
        auth.spf = {
          result,
          domain: from ? (from.includes('@') ? from.replace(/^.*@/, '') : from) : null,
        };
      } else if (method === 'dmarc') auth.dmarc = { result, domain: prop('header\\.from') };
    }
  }
  return auth;
}

/** A Received-SPF header: "Pass (…) identity=mailfrom; envelope-from=user@domain; …". */
export function parseReceivedSpf(header: string): MailAuth['spf'] {
  const m = /^\s*([a-z]+)/i.exec(header);
  if (!m) return null;
  const from = /envelope-from\s*=\s*"?<?([^\s;"<>]+)>?"?/i.exec(header)?.[1]?.toLowerCase() ?? null;
  return { result: asResult(m[1]), domain: from ? from.replace(/^.*@/, '') : null };
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
}
interface PostmarkEvent {
  RecordType?: string;
  MessageID?: string;
  DeliveredAt?: string;
  BouncedAt?: string;
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
    inbound(body) {
      const m = body as PostmarkInbound | null;
      if (!m || typeof m !== 'object' || (!m.FromFull && !m.From)) return null;
      const headers = m.Headers ?? [];
      const from =
        (m.FromFull?.Email && addressOf(m.FromFull.Email)) || (m.From && addressOf(m.From));
      if (!from) return null;
      const to = [...(m.ToFull ?? []), ...(m.CcFull ?? [])]
        .map((x) => (x.Email ? addressOf(x.Email) : null))
        .filter((x): x is string => Boolean(x));
      const auth = parseAuthenticationResults(header(headers, 'Authentication-Results'));
      if (!auth.spf) {
        const spf = header(headers, 'Received-SPF')[0];
        if (spf) auth.spf = parseReceivedSpf(spf);
      }
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
        auth,
        spam: /^yes/i.test(spamStatus),
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
      }
      return out;
    },
  };
}
