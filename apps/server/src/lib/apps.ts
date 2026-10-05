/**
 * Apps (PRD §73–75, R16): an organization's integrations. An app acts as its own bot (a users
 * row of kind 'bot' on the team) through a token that reaches a short list of routes, each
 * behind a scope, and only the organization's own conversations: the bot is on no other team
 * and in no other conversation. Its webhook hears what the organization chose, signed with a
 * secret only the organization has, and never reaches a private address.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import {
  API_TOKEN_PREFIX,
  type ApiScope,
  type OrgAppView,
  signatureBase,
  uuidv7,
  type WebhookEvent,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { OrgApp } from '../db/schema';
import { hashToken } from './crypto';
import { badRequest } from './errors';
import { enqueue, registerJob } from './jobs';

export function newApiToken(): { token: string; prefix: string; hash: Buffer } {
  const token = `${API_TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
  return { token, prefix: token.slice(0, 10), hash: hashToken(token) };
}

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString('base64url')}`;

/**
 * Everything an app's token can call, and the scope each needs (`any`: every token, whatever
 * its permissions; who it is gives nothing away). The rest is refused.
 */
export const API_ROUTES: Readonly<Record<string, ApiScope | 'any'>> = {
  'GET /v1/apps/me': 'any',
  'GET /v1/apps/me/deliveries': 'any',
  'POST /v1/apps/me/deliveries/:id/retry': 'any',
  'GET /v1/orgs/:id/inbox': 'inbox:read',
  'GET /v1/conversations/:id': 'messages:read',
  'GET /v1/conversations/:id/messages': 'messages:read',
  'GET /v1/files/:id': 'messages:read',
  'GET /v1/files/:id/thumb': 'messages:read',
  'POST /v1/conversations/:id/messages': 'messages:write',
  'POST /v1/business/:conversationId/assign': 'threads:write',
  'POST /v1/business/:conversationId/resolve': 'threads:write',
  'POST /v1/business/:conversationId/reopen': 'threads:write',
  'POST /v1/business/:conversationId/escalate': 'threads:write',
  'DELETE /v1/business/:conversationId/escalation': 'threads:write',
  'GET /v1/orgs/:id/updates': 'updates',
  'POST /v1/orgs/:id/updates': 'updates',
  'PATCH /v1/orgs/:id/updates/:updateId': 'updates',
  'DELETE /v1/orgs/:id/updates/:updateId': 'updates',
  'GET /v1/kits': 'kits',
  'PUT /v1/kits/:key': 'kits',
  'DELETE /v1/kits/:key': 'kits',
  'POST /v1/messages/:id/kit': 'kits',
  'PATCH /v1/messages/:id/kit': 'kits',
};

export interface AppAuth {
  tokenId: string;
  appId: string;
  orgId: string;
  botUserId: string;
  scopes: ApiScope[];
}

const TOUCH_EVERY_MS = 5 * 60_000;

/** The app a token belongs to, if it's live: the token, the app and its bot all still there. */
export async function resolveApiToken(ctx: AppContext, token: string): Promise<AppAuth | null> {
  const row = await ctx.db
    .selectFrom('api_tokens as k')
    .innerJoin('org_apps as a', 'a.id', 'k.app_id')
    .innerJoin('organizations as o', 'o.id', 'a.org_id')
    .select(['k.id', 'k.last_used_at', 'a.id as app_id', 'a.org_id', 'a.bot_user_id', 'a.scopes'])
    .where('k.token_hash', '=', hashToken(token))
    .where('k.revoked_at', 'is', null)
    .where('a.revoked_at', 'is', null)
    .where('o.archived_at', 'is', null)
    .executeTakeFirst();
  if (!row?.bot_user_id) return null;
  if (!row.last_used_at || ctx.now().getTime() - row.last_used_at.getTime() > TOUCH_EVERY_MS)
    await ctx.db
      .updateTable('api_tokens')
      .set({ last_used_at: ctx.now() })
      .where('id', '=', row.id)
      .execute();
  return {
    tokenId: row.id,
    appId: row.app_id,
    orgId: row.org_id,
    botUserId: row.bot_user_id,
    scopes: row.scopes as ApiScope[],
  };
}

// --- Webhooks -----------------------------------------------------------------------------------

/** Loopback, private, link-local, shared, reserved and multicast IPv4 addresses. */
function privateV4(ip: string): boolean {
  const [a = 0, b = 0, c = 0] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** An IPv6 address as its eight 16-bit groups (a dotted IPv4 tail is two of them). */
function groupsOf(ip: string): number[] {
  const parse = (part: string) =>
    part
      ? part.split(':').flatMap((g) => {
          if (!g.includes('.')) return [Number.parseInt(g, 16)];
          const [a = 0, b = 0, c = 0, d = 0] = g.split('.').map(Number);
          return [(a << 8) | b, (c << 8) | d];
        })
      : [];
  const [head = '', tail] = ip.split('::');
  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);
  return [...left, ...new Array(8 - left.length - right.length).fill(0), ...right];
}

const v4Of = (hi = 0, lo = 0) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/**
 * Whether an address is one a webhook must never reach: private, loopback, link-local and the
 * like, in either family, including IPv4 written as IPv6 (mapped, compatible, NAT64, 6to4), which
 * the URL parser rewrites into hex groups (`[::ffff:127.0.0.1]` becomes `[::ffff:7f00:1]`).
 */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const bare = ip.split('%')[0] ?? '';
  if (isIP(bare) !== 6) return true;
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = groupsOf(bare.toLowerCase());
  const zero64 = a === 0 && b === 0 && c === 0 && d === 0;
  if (zero64 && ((e === 0 && (f === 0 || f === 0xffff)) || (e === 0xffff && f === 0)))
    return privateV4(v4Of(g, h));
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0)
    return privateV4(v4Of(g, h));
  if (a === 0x2002) return privateV4(v4Of(b, c));
  return (
    a >> 8 === 0 || // ::/8, reserved
    (a === 0x64 && b === 0xff9b && c === 1) || // local NAT64
    (a & 0xfe00) === 0xfc00 || // unique local
    (a & 0xffc0) === 0xfe80 || // link-local
    (a & 0xffc0) === 0xfec0 || // site-local
    a >> 8 === 0xff // multicast
  );
}

/** Where a webhook may go: an https address on the public internet. */
export function checkWebhookUrl(raw: string, allowPrivate: boolean): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest(tr('Enter the full address, starting with https://'));
  }
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:'))
    throw badRequest(tr('Webhooks go to https addresses.'));
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (
    !allowPrivate &&
    (host === 'localhost' || host.endsWith('.localhost') || (isIP(host) && isPrivateAddress(host)))
  )
    throw badRequest(tr('That address is on a private network.'));
  if (url.username || url.password) throw badRequest(tr('Leave passwords out of the address.'));
  return url.toString();
}

/** A DNS lookup that refuses private answers, so a public name can't point inside. */
function safeLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const list = addresses as Array<{ address: string; family: number }>;
      if (!allowPrivate && list.some((a) => isPrivateAddress(a.address)))
        return callback(new Error('That address is on a private network.'), '', 0);
      if (options.all) return (callback as (e: null, a: typeof list) => void)(null, list);
      const first = list[0];
      if (!first) return callback(new Error(`No address for ${hostname}`), '', 0);
      callback(null, first.address, first.family);
    });
  };
}

/** A delivery gets this long in all, connecting included. */
export const WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * POSTs a delivery and resolves with the status it got. The whole exchange shares one deadline:
 * a socket's idle timeout alone lets an endpoint that trickles its answer hold a worker forever.
 * The answer's body is never read.
 */
export async function postWebhook(
  target: string,
  body: string,
  headers: Record<string, string>,
  { allowPrivate, timeoutMs = WEBHOOK_TIMEOUT_MS }: { allowPrivate: boolean; timeoutMs?: number },
): Promise<number> {
  const url = new URL(checkWebhookUrl(target, allowPrivate));
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = send(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) },
        lookup: safeLookup(allowPrivate),
        signal: AbortSignal.timeout(timeoutMs),
      },
      (res) => {
        resolve(res.statusCode ?? 0);
        res.on('error', () => {});
        res.destroy();
      },
    );
    req.on('error', (err) =>
      reject(
        err.name === 'AbortError' ? new Error(`No answer within ${timeoutMs / 1000} seconds`) : err,
      ),
    );
    req.end(body);
  });
}

export function signWebhook(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(signatureBase(timestamp, body)).digest('hex');
}

const WEBHOOK_ATTEMPTS = 6;

/** Queue an event for every app of the organization that listens for it. */
export async function emitWebhook(
  ctx: AppContext,
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const apps = await ctx.db
    .selectFrom('org_apps')
    .select(['id', 'events'])
    .where('org_id', '=', orgId)
    .where('revoked_at', 'is', null)
    .where('webhook_url', 'is not', null)
    .execute();
  for (const app of apps) {
    if (!app.events.includes(event)) continue;
    await queueDelivery(ctx, app.id, orgId, event, data);
  }
}

export async function queueDelivery(
  ctx: AppContext,
  appId: string,
  orgId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<string> {
  const id = uuidv7();
  const payload = { id, event, orgId, createdAt: ctx.now().toISOString(), data };
  await ctx.db
    .insertInto('webhook_deliveries')
    .values({ id, app_id: appId, event, payload: JSON.stringify(payload) })
    .execute();
  await enqueue(ctx, 'webhook_delivery', { deliveryId: id }, { maxAttempts: WEBHOOK_ATTEMPTS });
  return id;
}

/**
 * A failed delivery, queued afresh at the app's own asking (docs/API.md): its attempts start
 * over, so it gets the whole schedule again. Answers false when it isn't the app's or isn't failed.
 */
export async function requeueDelivery(
  ctx: AppContext,
  appId: string,
  deliveryId: string,
): Promise<boolean> {
  const res = await ctx.db
    .updateTable('webhook_deliveries')
    .set({ status: 'pending', attempts: 0, last_error: null, last_status: null })
    .where('id', '=', deliveryId)
    .where('app_id', '=', appId)
    .where('status', '=', 'failed')
    .executeTakeFirst();
  if (Number(res.numUpdatedRows) === 0) return false;
  await enqueue(ctx, 'webhook_delivery', { deliveryId }, { maxAttempts: WEBHOOK_ATTEMPTS });
  return true;
}

export function registerWebhookJob(): void {
  registerJob('webhook_delivery', async (ctx, p) => {
    const delivery = await ctx.db
      .selectFrom('webhook_deliveries as d')
      .innerJoin('org_apps as a', 'a.id', 'd.app_id')
      .select([
        'd.id',
        'd.event',
        'd.payload',
        'd.attempts',
        'd.status',
        'a.webhook_url',
        'a.webhook_secret',
        'a.revoked_at',
      ])
      .where('d.id', '=', String(p.deliveryId))
      .executeTakeFirst();
    if (delivery?.status !== 'pending') return;
    if (delivery.revoked_at || !delivery.webhook_url) {
      await ctx.db
        .updateTable('webhook_deliveries')
        .set({ status: 'failed', last_error: 'The app was removed, or has no webhook address.' })
        .where('id', '=', delivery.id)
        .execute();
      return;
    }
    const body = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(ctx.now().getTime() / 1000);
    let status: number | null = null;
    let error: string | null = null;
    try {
      status = await postWebhook(
        delivery.webhook_url,
        body,
        {
          'content-type': 'application/json',
          'user-agent': 'Caime-Webhooks/1',
          'caime-event': delivery.event,
          'caime-delivery': delivery.id,
          'caime-signature': `t=${timestamp},v1=${signWebhook(delivery.webhook_secret, timestamp, body)}`,
        },
        { allowPrivate: ctx.config.WEBHOOKS_ALLOW_PRIVATE },
      );
      if (status < 200 || status >= 300) error = `It answered ${status}.`;
    } catch (e) {
      error = (e as Error).message.slice(0, 300);
    }
    const attempts = delivery.attempts + 1;
    await ctx.db
      .updateTable('webhook_deliveries')
      .set({
        attempts,
        last_status: status,
        last_error: error,
        status: error ? (attempts >= WEBHOOK_ATTEMPTS ? 'failed' : 'pending') : 'delivered',
        delivered_at: error ? null : ctx.now(),
      })
      .where('id', '=', delivery.id)
      .execute();
    ctx.metrics.webhooks.inc({
      outcome: !error ? 'delivered' : attempts < WEBHOOK_ATTEMPTS ? 'retrying' : 'failed',
    });
    // Thrown, the queue tries again later, waiting longer each time.
    if (error && attempts < WEBHOOK_ATTEMPTS) throw new Error(error);
  });
}

// --- Views ---------------------------------------------------------------------------------------

export async function appViews(ctx: AppContext, apps: OrgApp[]): Promise<OrgAppView[]> {
  if (apps.length === 0) return [];
  const ids = apps.map((a) => a.id);
  const bots = apps.map((a) => a.bot_user_id).filter((x): x is string => Boolean(x));
  const [tokens, users, kits] = await Promise.all([
    ctx.db
      .selectFrom('api_tokens')
      .select(['app_id', 'prefix', 'last_used_at'])
      .where('app_id', 'in', ids)
      .where('revoked_at', 'is', null)
      .execute(),
    bots.length
      ? ctx.db
          .selectFrom('users')
          .select(['id', 'display_name', 'handle'])
          .where('id', 'in', bots)
          .execute()
      : Promise.resolve([]),
    ctx.db
      .selectFrom('app_kits')
      .select(['app_id', 'key', sql<string>`definition->>'name'`.as('name')])
      .where('app_id', 'in', ids)
      .orderBy('created_at')
      .orderBy('key')
      .execute(),
  ]);
  return apps.map((a) => {
    const token = tokens.find((k) => k.app_id === a.id);
    const bot = users.find((u) => u.id === a.bot_user_id);
    return {
      id: a.id,
      name: a.name,
      bot: bot ? { userId: bot.id, displayName: bot.display_name, handle: bot.handle } : null,
      scopes: a.scopes as ApiScope[],
      webhookUrl: a.webhook_url,
      events: a.events as WebhookEvent[],
      tokenPrefix: token?.prefix ?? null,
      lastUsedAt: token?.last_used_at?.toISOString() ?? null,
      createdAt: a.created_at.toISOString(),
      kits: kits.filter((k) => k.app_id === a.id).map((k) => ({ key: k.key, name: k.name })),
    };
  });
}
