/**
 * Caime Mail (PRODUCT-REVIEW R75): every handle is an address at MAIL_DOMAIN. The address rules,
 * pure: whether mail is on, the address a handle has, the handle an address names, and the
 * name a sender's From gives (a subject's rules are core's, `@caime/core/mail`).
 */
import type { Config } from '../config';

export type MailConfig = Pick<Config, 'MAIL_DOMAIN' | 'MAIL_PROVIDER'>;

/** Mail is on when the operator set the domain and a provider. */
export function mailOn(config: MailConfig): boolean {
  return Boolean(config.MAIL_DOMAIN && config.MAIL_PROVIDER);
}

/** The address a handle has, or null where mail is off. */
export function mailAddressOf(handle: string, config: MailConfig): string | null {
  return mailOn(config) ? `${handle}@${config.MAIL_DOMAIN}` : null;
}

/**
 * The handle an address at our domain names (the local part, lowercased, a "+tag" dropped), or
 * null for an address elsewhere.
 */
export function handleOf(address: string, domain: string): string | null {
  const at = address.lastIndexOf('@');
  if (at < 0) return null;
  const host = address.slice(at + 1).toLowerCase();
  if (host !== domain.toLowerCase()) return null;
  const local = address.slice(0, at).toLowerCase().split('+')[0] ?? '';
  return local.length ? local : null;
}

/** The address an RFC 5322 mailbox names ("Name <a@b>", "<a@b>" or "a@b"), lowercased. */
export function addressOf(mailbox: string): string | null {
  const m =
    /<([^<>\s]+@[^<>\s]+)>\s*$/.exec(mailbox) ?? /^\s*([^<>\s]+@[^<>\s]+)\s*$/.exec(mailbox);
  return m?.[1] ? m[1].toLowerCase() : null;
}

/** The domain of an address, lowercased, or null. */
export function domainOf(address: string): string | null {
  const at = address.lastIndexOf('@');
  return at < 0 ? null : address.slice(at + 1).toLowerCase() || null;
}

/**
 * Whether two domains are aligned as DMARC's relaxed alignment reads them: the same, or one
 * under the other (mail.example.com and example.com).
 */
export function alignedDomains(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

/** What a sender's name reads: their display name, else the local part made readable. */
export function senderName(name: string | null | undefined, address: string): string {
  const given = (name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (given.length) return given.slice(0, 80);
  const local = address.slice(0, address.lastIndexOf('@')) || address;
  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .slice(0, 80);
}
