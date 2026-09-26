/**
 * Resolves the session on every request (ADR-7). Web sends an httpOnly cookie and must add
 * `X-Caishy-Client` on state-changing requests — a cross-site form cannot set custom headers, so
 * this stops CSRF. Native sends a Bearer token.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext, Auth } from '../context';
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
    const session = await resolveSession(ctx, found.token);
    if (!session) return;
    if (found.via === 'cookie' && UNSAFE.has(req.method) && !req.headers['x-caishy-client']) {
      throw new AppError(403, 'csrf', 'Missing X-Caishy-Client header.');
    }
    req.auth = { ...session, via: found.via };
  });
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
