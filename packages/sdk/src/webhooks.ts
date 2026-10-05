import { createHmac, timingSafeEqual } from 'node:crypto';

/** What every delivery carries (docs/API.md, Webhooks). */
interface Delivery<E extends string, D> {
  id: string;
  event: E;
  orgId: string;
  createdAt: string;
  data: D;
}

export type BusinessMessageWebhook = Delivery<
  'business.message',
  {
    conversationId: string;
    message: { id: string; seq: number; kind: string; body: string | null; createdAt: string };
    /** `under18`: never market to them. */
    customer: { id: string; displayName: string; handle: string; under18: boolean };
  }
>;

export type BusinessThreadWebhook = Delivery<
  'business.thread',
  {
    conversationId: string;
    change: string;
    state: string;
    assignee: { userId: string; displayName: string } | null;
    by: 'person' | 'app' | 'ai_agent';
  }
>;

interface KitWebhookData {
  conversationId: string;
  message: { id: string; seq: number; createdAt: string };
  kit: { key: string; name: string; custom: boolean };
  fields: Record<string, unknown>;
  state: string | null;
  customer?: { id: string; displayName: string; handle: string } | null;
}

export type KitPostedWebhook = Delivery<'kit.posted', KitWebhookData & { by: 'person' }>;
export type KitMovedWebhook = Delivery<
  'kit.moved',
  KitWebhookData & { from: string | null; to: string; by: 'person' | 'customer' }
>;
export type PingWebhook = Delivery<'ping', { appId: string }>;
/**
 * A message in a customer conversation was removed for everyone (its sender's delete, or the
 * operator's): drop any copy of its words the app kept.
 */
export type MessageDeletedWebhook = Delivery<
  'message.deleted',
  { conversationId: string; messageId: string }
>;
/**
 * A customer conversation was erased at the customer's request (R54): every message in it is
 * gone, and so must be whatever the app kept of them. `erased` counts them.
 */
export type ConversationErasedWebhook = Delivery<
  'conversation.erased',
  { conversationId: string; erased: number }
>;

export type CaimeWebhook =
  | BusinessMessageWebhook
  | BusinessThreadWebhook
  | KitPostedWebhook
  | KitMovedWebhook
  | MessageDeletedWebhook
  | ConversationErasedWebhook
  | PingWebhook;

const EVENTS = new Set([
  'business.message',
  'business.thread',
  'kit.posted',
  'kit.moved',
  'message.deleted',
  'conversation.erased',
  'ping',
]);

/** Why a delivery was refused: not Caime's, too old, or not a body Caime sends. */
export class WebhookError extends Error {
  readonly reason: 'signature' | 'timestamp' | 'body';
  constructor(reason: WebhookError['reason'], message: string) {
    super(message);
    this.name = 'WebhookError';
    this.reason = reason;
  }
}

export interface VerifyOptions {
  /** How old a delivery may be, in seconds (300 by default). */
  toleranceSeconds?: number;
  /** The clock, in milliseconds; for tests. */
  now?: number;
}

/** The `Caime-Signature` header for a body, as Caime writes it: `t=<unix seconds>,v1=<hex>`. */
export function signWebhook(secret: string, timestamp: number, rawBody: string): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function parseHeader(header: string): { t: number; v1: Buffer } | null {
  const parts = new Map<string, string>();
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
  const t = Number(parts.get('t'));
  const v1 = parts.get('v1') ?? '';
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/i.test(v1)) return null;
  return { t, v1: Buffer.from(v1, 'hex') };
}

/**
 * Whether a delivery is Caime's: the signature over `<t>.<raw body>` with the webhook secret,
 * compared in constant time, and its timestamp within tolerance so a captured delivery can't be
 * replayed later. Check the raw body as received, before parsing it.
 */
export function verifyWebhookSignature(
  secret: string,
  signatureHeader: string | null | undefined,
  rawBody: string | Uint8Array,
  opts: VerifyOptions = {},
): boolean {
  return check(secret, signatureHeader, rawBody, opts) === null;
}

function check(
  secret: string,
  signatureHeader: string | null | undefined,
  rawBody: string | Uint8Array,
  opts: VerifyOptions,
): WebhookError | null {
  const parsed = signatureHeader ? parseHeader(signatureHeader) : null;
  if (!parsed) return new WebhookError('signature', 'No Caime signature on this request.');
  const tolerance = opts.toleranceSeconds ?? 300;
  const nowSeconds = (opts.now ?? Date.now()) / 1000;
  if (Math.abs(nowSeconds - parsed.t) > tolerance)
    return new WebhookError('timestamp', 'This delivery is too old, or from the future.');
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : Buffer.from(rawBody);
  const expected = createHmac('sha256', secret).update(`${parsed.t}.`).update(body).digest();
  if (expected.length !== parsed.v1.length || !timingSafeEqual(expected, parsed.v1))
    return new WebhookError('signature', 'The signature doesn’t match this body.');
  return null;
}

type HeaderSource =
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>;

function headerFrom(headers: HeaderSource, name: string): string | null {
  if (typeof (headers as { get?: unknown }).get === 'function')
    return (headers as { get(name: string): string | null }).get(name);
  const v = (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/**
 * A delivery as Caime sent it, once it's checked: pass the request's headers (Node's
 * `IncomingMessage.headers`, or a `Headers`) and its raw body. Throws a WebhookError otherwise.
 * De-duplicate on `id` (the `Caime-Delivery` header): now and then one arrives twice.
 */
export function parseWebhook(
  secret: string,
  headers: HeaderSource,
  rawBody: string | Uint8Array,
  opts: VerifyOptions = {},
): CaimeWebhook {
  const refused = check(secret, headerFrom(headers, 'caime-signature'), rawBody, opts);
  if (refused) throw refused;
  let body: unknown;
  try {
    body = JSON.parse(
      typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody).toString('utf8'),
    );
  } catch {
    throw new WebhookError('body', 'The body isn’t JSON.');
  }
  const d = body as Partial<Delivery<string, unknown>> | null;
  if (
    !d ||
    typeof d.id !== 'string' ||
    typeof d.event !== 'string' ||
    !EVENTS.has(d.event) ||
    typeof d.orgId !== 'string' ||
    typeof d.createdAt !== 'string' ||
    !d.data ||
    typeof d.data !== 'object'
  )
    throw new WebhookError('body', 'This isn’t a delivery Caime sends.');
  return d as CaimeWebhook;
}
