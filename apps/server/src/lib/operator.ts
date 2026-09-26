/**
 * The operator's tokens (ADMIN_TOKEN, METRICS_TOKEN): a route behind one exists only when its
 * token is configured, and answers exactly as a missing route does until then.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../context';
import { AppError, unauthorized } from './errors';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Throws unless the request carries `expected` as its bearer token. */
export function requireOperator(
  ctx: AppContext,
  req: FastifyRequest,
  expected: string | undefined,
): void {
  if (!expected)
    throw new AppError(404, 'not_found', `No route for ${req.method} ${req.url.split('?')[0]}`);
  ctx.limiter.hit(`operator:${req.ip}`, ctx.config.isTest ? 1000 : 30, 60_000);
  const header = req.headers.authorization ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  // Equal-length digests, so the comparison takes the same time whatever was sent.
  if (!timingSafeEqual(digest(given), digest(expected)))
    throw unauthorized('That isn’t this server’s operator token.');
}
