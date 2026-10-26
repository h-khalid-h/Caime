/**
 * The site's other machine-read files under `/.well-known/` (the app links are `app-links.ts`):
 * `security.txt` (RFC 9116), where someone who found a weakness writes, and `change-password`
 * (W3C's well-known URL for changing passwords), where a password manager sends someone to change
 * theirs. Both answer on every name the service has (`MACHINE_PATHS`) and name `PUBLIC_URL`.
 */
import { INTERFACE_LANGUAGES } from '@caime/core';
import type { Config } from '../config';
import { mailOn } from './mail-address';

/** How far ahead `Expires` reads: within the year the RFC asks, moved on every day it's served. */
const EXPIRES_DAYS = 180;

/** Where someone changes their password (Settings · Security), signed in or on the way to it. */
export const CHANGE_PASSWORD_PATH = '/settings/security';

/**
 * The file, as it reads today: the staff `security@` address where Caime's own mail routes it
 * (`STAFF_ADDRESSES`, `MAIL_STAFF_HANDLE`), and the contact address always.
 */
export function securityTxt(
  config: Pick<
    Config,
    'PUBLIC_URL' | 'CONTACT_EMAIL' | 'MAIL_DOMAIN' | 'MAIL_PROVIDER' | 'MAIL_STAFF_HANDLE'
  >,
  now: Date,
): string {
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const expires = new Date(day + EXPIRES_DAYS * 86_400_000).toISOString();
  const contacts = [
    ...(mailOn(config) && config.MAIL_STAFF_HANDLE ? [`security@${config.MAIL_DOMAIN}`] : []),
    config.CONTACT_EMAIL,
  ];
  return [
    ...[...new Set(contacts)].map((address) => `Contact: mailto:${address}`),
    `Expires: ${expires}`,
    `Preferred-Languages: ${INTERFACE_LANGUAGES.join(', ')}`,
    `Canonical: ${config.PUBLIC_URL}/.well-known/security.txt`,
    `Policy: ${config.PUBLIC_URL}/security`,
    '',
  ].join('\n');
}
