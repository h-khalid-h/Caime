/**
 * Resolves the session on every request (ADR-7). Web sends an httpOnly cookie and must add
 * `X-Caime-Client` on state-changing requests — a cross-site form cannot set custom headers, so
 * this stops CSRF. Native sends a Bearer token.
 */
import { isApiToken, isPersonToken, OAUTH_ACCESS_PREFIX } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext, Auth } from '../context';
import { PERSON_ROUTES, type PersonGrant, resolvePersonalToken } from '../lib/access';
import { API_ROUTES, resolveApiToken } from '../lib/apps';
import { hashToken } from '../lib/crypto';
import { AppError, unauthorized } from '../lib/errors';
import { resolveOAuthAccess } from '../lib/oauth';

export const SESSION_COOKIE = 'caime_session';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TOUCH_EVERY_MS = 5 * 60_000;

export function tokenFrom(req: FastifyRequest): { token: string; via: 'cookie' | 'bearer' } | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return { token: header.slice(7).trim(), via: 'bearer' };
  const cookie = req.cookies?.[SESSION_COOKIE];
  return cookie ? { token: cookie, via: 'cookie' } : null;
}

/** An account the operator suspended (R49): every way in answers this. */
export const suspended = () =>
  new AppError(
    403,
    'suspended',
    tr('This account is suspended. If you think that’s wrong, write to whoever runs Caime.'),
  );

export async function resolveSession(
  ctx: AppContext,
  token: string,
): Promise<Omit<Auth, 'via'> | null> {
  const row = await ctx.db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select([
      'sessions.id',
      'sessions.user_id',
      'sessions.kind',
      'sessions.last_seen_at',
      'users.suspended_at',
    ])
    .where('sessions.token_hash', '=', hashToken(token))
    .where('sessions.revoked_at', 'is', null)
    .where('sessions.expires_at', '>', ctx.now())
    .where('users.deleted_at', 'is', null)
    .executeTakeFirst();
  if (!row) return null;
  // Suspended by the operator (R49): told so, not signed out quietly.
  if (row.suspended_at) throw suspended();
  if (ctx.now().getTime() - row.last_seen_at.getTime() > TOUCH_EVERY_MS) {
    await ctx.db
      .updateTable('sessions')
      .set({ last_seen_at: ctx.now() })
      .where('id', '=', row.id)
      .execute();
  }
  return { userId: row.user_id, sessionId: row.id, kind: row.kind };
}

/** The web build's files (`plugins/static.ts`): nothing on them is anyone's. */
const STATIC_PREFIX = /^\/(?:_expo\/|fonts\/|assets\/)/;

export function registerAuth(app: FastifyInstance, ctx: AppContext): void {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    req.auth = null;
    // The build's hashed files are the same for everyone: a cookie on one of those requests is
    // never looked up (a cold launch fetches a dozen of them).
    if (STATIC_PREFIX.test(req.url)) return;
    const found = tokenFrom(req);
    if (!found) return;
    if (found.via === 'bearer' && isApiToken(found.token)) {
      await authenticateApp(ctx, req, found.token);
      return;
    }
    if (found.via === 'bearer' && isPersonToken(found.token)) {
      await authenticatePerson(ctx, req, found.token);
      return;
    }
    const session = await resolveSession(ctx, found.token);
    if (!session) return;
    if (found.via === 'cookie' && UNSAFE.has(req.method) && !req.headers['x-caime-client']) {
      throw new AppError(403, 'csrf', tr('Missing X-Caime-Client header.'));
    }
    // The app says whose account it's showing: a call meant as one person never acts as another
    // (another tab of the browser signed in as them since, and the cookie is theirs now).
    const expected = req.headers['x-caime-user'];
    if (typeof expected === 'string' && expected !== session.userId)
      throw new AppError(409, 'wrong_account', tr('Someone else is signed in here now.'));
    req.auth = { ...session, via: found.via };
  });
}

/**
 * An app's token (PRD §73): it acts as the app's bot, only on the routes in API_ROUTES and
 * only with the scope each needs. Anything else is refused before the route runs.
 */
async function authenticateApp(ctx: AppContext, req: FastifyRequest, token: string) {
  const app = await resolveApiToken(ctx, token);
  if (!app) return;
  const scope = API_ROUTES[`${req.method} ${req.routeOptions.url ?? ''}`];
  if (!scope) throw new AppError(403, 'token_route', tr('An app’s token can’t do this.'));
  if (scope !== 'any' && !app.scopes.includes(scope))
    throw new AppError(
      403,
      'token_scope',
      tr('This app needs the “{scope}” permission for that.', { scope }),
    );
  ctx.limiter.hit(`api:${app.tokenId}`, ctx.config.isTest ? 10_000 : 600, 60_000);
  req.auth = {
    userId: app.botUserId,
    sessionId: app.tokenId,
    kind: 'api',
    via: 'bearer',
    app: { id: app.appId, orgId: app.orgId, scopes: app.scopes },
  };
}

/**
 * A token acting as a person (PRD §74): their own, or an app's they let in. It reaches only the
 * routes in PERSON_ROUTES, each behind the permission it needs, never their account itself.
 */
async function authenticatePerson(ctx: AppContext, req: FastifyRequest, token: string) {
  const found = token.startsWith(OAUTH_ACCESS_PREFIX)
    ? await resolveOAuthAccess(ctx, token)
    : await resolvePersonalToken(ctx, token);
  if (!found) return;
  const scope = PERSON_ROUTES[`${req.method} ${req.routeOptions.url ?? ''}`];
  if (!scope)
    throw new AppError(403, 'token_route', tr('A token can’t do this: sign in to Caime.'));
  if (!found.grant.scopes.includes(scope))
    throw new AppError(
      403,
      'token_scope',
      tr('This token needs the “{scope}” permission for that.', { scope }),
    );
  ctx.limiter.hit(`person-token:${found.grant.id}`, ctx.config.isTest ? 10_000 : 300, 60_000);
  req.auth = {
    userId: found.userId,
    sessionId: found.grant.id,
    kind: 'token',
    via: 'bearer',
    grant: found.grant satisfies PersonGrant,
  };
}

export function requireAuth(req: FastifyRequest): Auth {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export function setSessionCookie(reply: FastifyReply, ctx: AppContext, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: ctx.config.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: ctx.config.SESSION_DAYS * 86_400,
  });
}

export function clearSessionCookie(reply: FastifyReply, ctx: AppContext): void {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    secure: ctx.config.secureCookies,
    sameSite: 'lax',
    httpOnly: true,
  });
  // However it ended (signed out here or elsewhere, the account deleted), the photos and files
  // this browser kept go too; the app's own files are the worker's.
  reply.header('clear-site-data', '"cache"');
}
