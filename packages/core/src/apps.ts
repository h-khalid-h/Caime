/**
 * Apps (PRD §73–75, R16): what an organization connects to Caishy, its helpdesk, its CRM, its
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
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  'inbox:read': 'See the inbox',
  'messages:read': 'Read customers’ conversations',
  'messages:write': 'Reply to customers (as a bot)',
  'threads:write': 'Assign, escalate and resolve',
  updates: 'Post the organization’s updates',
};

/** What an app hears about. */
export const WEBHOOK_EVENTS = ['business.message', 'business.thread'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'business.message': 'A customer writes',
  'business.thread': 'A conversation is assigned, escalated, resolved or reopened',
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

export function parseSignature(header: string): { t: number; v1: string } | null {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, ...v] = kv.trim().split('=');
      return [k ?? '', v.join('=')];
    }),
  );
  const t = Number(parts.t);
  return Number.isInteger(t) && parts.v1 ? { t, v1: parts.v1 } : null;
}
