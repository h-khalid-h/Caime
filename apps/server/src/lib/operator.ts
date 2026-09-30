/**
 * The operator's tokens (ADMIN_TOKEN, OPERATOR_TOKENS, METRICS_TOKEN): a route behind one exists
 * only when its token is configured, and answers exactly as a missing route does until then.
 *
 * ADMIN_TOKEN is the one token everyone who runs Caime shares; OPERATOR_TOKENS gives each person
 * on the operator's side a token of their own (`mona:…,ali:…`), so the audit log says which of
 * them acted (`metadata.operator`), and one can be taken back without changing the others'.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { AppContext } from '../context';
import { AppError, unauthorized } from './errors';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** What ADMIN_TOKEN's holder is called in the audit log. */
export const SHARED_OPERATOR = 'operator';

const OPERATOR_NAME = /^[a-z0-9][a-z0-9._-]{0,31}$/;
/** As many characters as ADMIN_TOKEN must have. */
const TOKEN_MIN = 24;

/**
 * `name:token,name:token` into a map, or a reason it isn't one. Names are lowercase letters,
 * digits, dots, dashes and underscores (32 at most); tokens are 24 characters or more, and
 * neither is repeated.
 */
export function parseOperatorTokens(
  value: string | undefined,
): { operators: Map<string, string> } | { problem: string } {
  const operators = new Map<string, string>();
  for (const pair of (value ?? '').split(',')) {
    const entry = pair.trim();
    if (!entry) continue;
    const at = entry.indexOf(':');
    const name = at < 0 ? '' : entry.slice(0, at).trim();
    const token = at < 0 ? '' : entry.slice(at + 1).trim();
    if (!OPERATOR_NAME.test(name))
      return {
        problem: `a name of lowercase letters, digits, dots, dashes or underscores before the colon (${JSON.stringify(entry.slice(0, 16))})`,
      };
    if (name === SHARED_OPERATOR)
      return { problem: `"${SHARED_OPERATOR}" is ADMIN_TOKEN's name; give each person their own` };
    if (token.length < TOKEN_MIN)
      return { problem: `${name}: a token of ${TOKEN_MIN} characters or more` };
    if (operators.has(name)) return { problem: `${name} twice` };
    for (const other of operators.values())
      if (other === token) return { problem: `${name}'s token is someone else's too` };
    operators.set(name, token);
  }
  return { operators };
}

/**
 * Throws unless the request carries `expected` (ADMIN_TOKEN) or one of `named`
 * (OPERATOR_TOKENS) as its bearer token, and says who it was: `operator` for the shared token,
 * else the name the token was given.
 */
export function requireOperator(
  ctx: AppContext,
  req: FastifyRequest,
  expected: string | undefined,
  named?: string,
): string {
  const parsed = parseOperatorTokens(named);
  const candidates: Array<[string, string]> = 'operators' in parsed ? [...parsed.operators] : [];
  if (expected) candidates.unshift([SHARED_OPERATOR, expected]);
  if (!candidates.length)
    throw new AppError(404, 'not_found', `No route for ${req.method} ${req.url.split('?')[0]}`);
  ctx.limiter.hit(`operator:${req.ip}`, ctx.config.isTest ? 1000 : 30, 60_000);
  const header = req.headers.authorization ?? '';
  const given = digest(header.startsWith('Bearer ') ? header.slice(7).trim() : '');
  // Equal-length digests, every candidate looked at: the comparison takes the same time
  // whatever was sent, and whichever token it was.
  let who: string | null = null;
  for (const [name, token] of candidates) if (timingSafeEqual(given, digest(token))) who = name;
  if (!who) throw unauthorized('That isn’t this server’s operator token.');
  return who;
}
