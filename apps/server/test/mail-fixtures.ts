/**
 * Mail as it really arrives, for the tests of mail in (R75): a raw message, DKIM-signed with a
 * test key (or not, or tampered), under the Received line Postmark's receiving server writes on
 * top, and the DNS that answers for it (the key, SPF, DMARC). Caime checks all of it itself
 * (`lib/mail-auth.ts`), so a test's "vouched for" is real cryptography, not a header it wrote.
 */
import { generateKeyPairSync } from 'node:crypto';
import { dkimSign } from 'mailauth/lib/dkim/sign.js';
import type { TxtResolver } from '../src/lib/orgs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUBLIC = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
/** Another key, whose signatures the published key never verifies. */
const OTHER = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();

/** The test key's DNS record (`test._domainkey.<domain>`), for the E2E's DNS stand-in to publish. */
export const DKIM_TXT = `v=DKIM1; k=rsa; p=${PUBLIC}`;

/** The address the sending servers connect from, and the bulk sender's own. */
export const SENDER_IP = '192.0.2.10';
export const BULK_IP = '198.51.100.7';
export const BULK_DOMAIN = 'bulk-sender.example';

const notFound = (name: string) =>
  Object.assign(new Error(`queryTxt ENOTFOUND ${name}`), { code: 'ENOTFOUND' });

/**
 * DNS for every sender domain: the test key at `test._domainkey.<domain>`, SPF allowing
 * `SENDER_IP` (the bulk sender's allows `BULK_IP`), and DMARC only where a test publishes it.
 */
export function mailDns(dmarc: Record<string, string> = {}): TxtResolver {
  return {
    async resolveTxt(name) {
      const host = name.toLowerCase().replace(/\.$/, '');
      if (/^test\._domainkey\./.test(host)) {
        // TXT strings are at most 255 octets each, as a resolver hands them over.
        return [DKIM_TXT.match(/.{1,255}/g) ?? [DKIM_TXT]];
      }
      if (host.startsWith('_dmarc.')) {
        const record = dmarc[host.slice('_dmarc.'.length)];
        if (record) return [[record]];
        throw notFound(name);
      }
      if (host.includes('._domainkey.')) throw notFound(name);
      return [[`v=spf1 ip4:${host === BULK_DOMAIN ? BULK_IP : SENDER_IP} -all`]];
    },
    async resolve(name) {
      throw notFound(name);
    },
  };
}

export interface RawMail {
  from: string;
  fromName?: string;
  to: string[];
  subject?: string | null;
  text: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  /** DKIM: signed for the From domain, signed with a key DNS doesn't have, or not at all. */
  dkim?: 'valid' | 'wrong-key' | 'none';
  /** Who Postmark's server saw connect, and as whom (the envelope sender), or no such line. */
  hop?: { ip: string; envelopeFrom?: string } | null;
  /** Lines the sender wrote themselves, above their own headers (a forged verdict, say). */
  senderLines?: string[];
  /** Words added below the body after it was signed with a length limit (`l=`), as a forger would. */
  appended?: string;
}

/** The raw message as Postmark's inbound server hands it over (RFC 5322, CRLF). */
export async function rawMail(m: RawMail): Promise<string> {
  const domain = m.from.replace(/^.*@/, '');
  const head = [
    ...(m.senderLines ?? []),
    `From: ${m.fromName ? `"${m.fromName}" ` : ''}<${m.from}>`,
    `To: ${m.to.join(', ')}`,
    ...(m.subject === null ? [] : [`Subject: ${m.subject ?? 'Hello from outside'}`]),
    'Date: Tue, 20 Oct 2026 08:00:00 +0000',
    `Message-ID: ${m.messageId}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`] : []),
    ...(m.references?.length ? [`References: ${m.references.join(' ')}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  const body = `${m.text.replace(/\r?\n/g, '\r\n')}\r\n`;
  const message = `${head.join('\r\n')}\r\n\r\n${body}`;
  const dkim = m.dkim ?? 'valid';
  const signature =
    dkim === 'none'
      ? ''
      : (
          await dkimSign(message, {
            signatureData: [
              {
                signingDomain: domain,
                selector: 'test',
                privateKey: dkim === 'valid' ? PRIVATE : OTHER,
                // Simple body canonicalization counts the body as written, so `l=` is its length.
                ...(m.appended === undefined
                  ? {}
                  : { canonicalization: 'relaxed/simple', maxBodyLength: Buffer.byteLength(body) }),
              },
            ],
          } as Parameters<typeof dkimSign>[1])
        ).signatures;
  // What Postmark's receiving server writes on top, once the mail has reached it.
  const hop = m.hop === undefined ? { ip: SENDER_IP } : m.hop;
  const trace = hop
    ? [
        ...(hop.envelopeFrom ? [`Return-Path: <${hop.envelopeFrom}>`] : []),
        `Received: from mail.${domain} (mail.${domain} [${hop.ip}])\r\n\tby inbound.postmarkapp.com (Postfix) with ESMTPS id 4TEST1\r\n\tfor <${m.to[0]}>; Tue, 20 Oct 2026 08:00:01 +0000 (UTC)`,
      ]
    : [];
  const tail = m.appended ? `${m.appended.replace(/\r?\n/g, '\r\n')}\r\n` : '';
  return `${trace.map((l) => `${l}\r\n`).join('')}${signature}${message}${tail}`;
}
