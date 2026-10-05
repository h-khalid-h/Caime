import { msg } from './i18n';
/**
 * Apps (PRD §73–75, R16): what an organization connects to Caime, its helpdesk, its CRM, its
 * own bot. An app acts through a token with named scopes, hears about the organization's
 * conversations through a signed webhook, and can answer customers as a bot that always says
 * it's automated.
 */

/** What an app's token may do. Nothing outside these, and only for its own organization. */
export const API_SCOPES = [
  'inbox:read',
  'messages:read',
  'messages:write',
  'threads:write',
  'updates',
  'kits',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  'inbox:read': 'See the inbox',
  'messages:read': 'Read customers’ conversations',
  'messages:write': 'Reply to customers (as a bot)',
  'threads:write': 'Assign, escalate and resolve',
  updates: msg('Post, change and take back the organization’s updates'),
  kits: msg('Make its own cards, send them and move them on'),
};

/** What an app hears about. */
export const WEBHOOK_EVENTS = [
  'business.message',
  'business.thread',
  'kit.posted',
  'kit.moved',
  'message.deleted',
  'conversation.erased',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** English keys (R54): shown through `tr`. */
export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'business.message': msg('A customer writes'),
  'business.thread': msg('A conversation is assigned, escalated, resolved or reopened'),
  'kit.posted': msg('Someone on the team sends one of its cards'),
  'kit.moved': msg('Someone moves one of its cards on'),
  'message.deleted': msg('A message in a customer conversation is removed for everyone'),
  'conversation.erased': msg('A customer conversation is erased at their request'),
};

/** Tokens say what they are, so a leaked one is recognisable (and scannable). */
export const API_TOKEN_PREFIX = 'cai_';

export function isApiToken(token: string): boolean {
  return token.startsWith(API_TOKEN_PREFIX);
}

/**
 * The signature header a webhook carries: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`.
 * A receiver recomputes it with its secret and rejects old timestamps (replays).
 */
export function signatureBase(timestamp: number, body: string): string {
  return `${timestamp}.${body}`;
}

/**
 * `t=<unix seconds>,v1=<hex>[,v1=<hex>]`: one signature, or two for a day after the secret was
 * replaced (the new secret's first, the old one's after), so a receiver accepts either.
 */
export function parseSignature(header: string): { t: number; v1: string[] } | null {
  let t = Number.NaN;
  const v1: string[] = [];
  for (const kv of header.split(',')) {
    const [k, ...v] = kv.trim().split('=');
    if (k === 't') t = Number(v.join('='));
    else if (k === 'v1' && v.length) v1.push(v.join('='));
  }
  return Number.isInteger(t) && v1.length ? { t, v1 } : null;
}
