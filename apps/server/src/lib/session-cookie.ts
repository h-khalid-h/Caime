/**
 * The web's session cookie (ADR-7): set when a session starts in a browser, cleared when it ends.
 * Apart from the auth plugin, so whatever starts a session (a password, a passkey, a recovery)
 * sets it the one way.
 */
import type { FastifyReply } from 'fastify';
import type { AppContext } from '../context';

export const SESSION_COOKIE = 'caime_session';

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
