/**
 * Resolves the session on every request (ADR-7). Web sends an httpOnly cookie and must add
 * `X-Caishy-Client` on state-changing requests — a cross-site form cannot set custom headers, so
 * this stops CSRF. Native sends a Bearer token.
 */
import { isApiToken, isPersonToken } from '@caishy/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext, Auth } from '../context';
import { PERSON_ROUTES, type PersonGrant, resolvePersonalToken } from '../lib/access';
import { API_ROUTES, resolveApiToken } from '../lib/apps';
import { hashToken } from '../lib/crypto';
import { AppError, unauthorized } from '../lib/errors';

export const SESSION_COOKIE = 'caishy_session';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TOUCH_EVERY_MS = 5 * 60_000;

export function tokenFrom(req: FastifyRequest): { token: string; via: 'cookie' | 'bearer' } | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return { token: header.slice(7).trim(), via: 'bearer' };
  const cookie = req.cookies?.[SESSION_COOKIE];
  return cookie ? { token: cookie, via: 'cookie' } : null;
}

export async function resolveSession(
  ctx: AppContext,
  token: string,
): Promise<Omit<Auth, 'via'> | null> {
  const row = await ctx.db
    .selectFrom('sessions')
    .innerJoin('users', 'users.id', 'sessions.user_id')
    .select(['sessions.id', 'sessions.user_id', 'sessions.kind', 'sessions.last_seen_at'])
    .where('sessions.token_hash', '=', hashToken(token))
    .where('sessions.revoked_at', 'is', null)
    .where('sessions.expires_at', '>', ctx.now())
    .where('users.deleted_at', 'is', null)
    .executeTakeFirst();
  if (!row) return null;
  if (ctx.now().getTime() - row.last_seen_at.getTime() > TOUCH_EVERY_MS) {
    await ctx.db
      .updateTable('sessions')
      .set({ last_seen_at: ctx.now() })
      .where('id', '=', row.id)
      .execute();
  }
  return { userId: row.user_id, sessionId: row.id, kind: row.kind };
}

export function registerAuth(app: FastifyInstance, ctx: AppContext): void {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    req.auth = null;
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
    if (found.via === 'cookie' && UNSAFE.has(req.method) && !req.headers['x-caishy-client']) {
      throw new AppError(403, 'csrf', 'Missing X-Caishy-Client header.');
    }
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
  if (!scope) throw new AppError(403, 'token_route', 'An app’s token can’t do this.');
  if (!app.scopes.includes(scope))
    throw new AppError(403, 'token_scope', `This app needs the “${scope}” permission for that.`);
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
  const found = await resolvePersonalToken(ctx, token);
  if (!found) return;
  const scope = PERSON_ROUTES[`${req.method} ${req.routeOptions.url ?? ''}`];
  if (!scope) throw new AppError(403, 'token_route', 'A token can’t do this: sign in to Caishy.');
  if (!found.grant.scopes.includes(scope))
    throw new AppError(403, 'token_scope', `This token needs the “${scope}” permission for that.`);
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
}
