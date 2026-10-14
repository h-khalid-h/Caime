/**
 * Sessions: starting one (a password, a passkey, a recovery, a meeting's guest link all go through
 * `createSession`), and ending them. Every path that signs a session out (sign-out, "sign out that device", a
 * password change, a recovery, a suspension, removing a device for private conversations) goes
 * through here, so the live sockets those sessions hold are closed in the same breath: a
 * revoked session that kept its socket would go on hearing every message until the connection
 * happened to drop.
 */
import { uuidv7 } from '@caime/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context';
import { hashToken, newToken } from './crypto';
import { setSessionCookie } from './session-cookie';

/** The bus event the realtime hub acts on; never delivered to a device. */
export const SESSION_ENDED = 'session.ended';

export interface SessionEndedData {
  sessionIds: string[];
}

export interface EndSessions {
  userId: string;
  /** Only these sessions; every live one of the person's when left out. */
  ids?: string[];
  /** Keep this one (the device making the change). */
  except?: string;
}

/** Revoke the sessions and tell every instance to close their sockets. Answers how many ended. */
export async function endSessions(ctx: AppContext, which: EndSessions): Promise<string[]> {
  if (which.ids && which.ids.length === 0) return [];
  let q = ctx.db
    .updateTable('sessions')
    .set({ revoked_at: ctx.now() })
    .where('user_id', '=', which.userId)
    .where('revoked_at', 'is', null);
  if (which.ids) q = q.where('id', 'in', which.ids);
  if (which.except) q = q.where('id', '<>', which.except);
  const rows = await q.returning('id').execute();
  const sessionIds = rows.map((r) => r.id);
  if (sessionIds.length > 0)
    await ctx.bus.publish([which.userId], {
      type: SESSION_ENDED,
      data: { sessionIds } satisfies SessionEndedData,
    });
  return sessionIds;
}

/** Where a request came from, as the security log keeps it. */
export function clientInfo(req: FastifyRequest) {
  return {
    ip: req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
}

function platformFrom(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/iPhone|iPad|iOS/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Macintosh|Windows|Linux|CrOS/i.test(userAgent)) return 'web';
  return null;
}

/**
 * A new session for `userId`: a browser gets it as its cookie (and the answer carries no token),
 * a phone gets the token to keep.
 */
export async function createSession(
  ctx: AppContext,
  req: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  client: 'web' | 'native',
  deviceName?: string,
  /** When it ends, if sooner than a session's usual life (a meeting's guest, R84). */
  endsAt?: Date,
): Promise<string | null> {
  const token = newToken('csy');
  const { ip, userAgent } = clientInfo(req);
  await ctx.db
    .insertInto('sessions')
    .values({
      id: uuidv7(),
      user_id: userId,
      token_hash: hashToken(token),
      kind: client,
      device_name: deviceName?.slice(0, 80) ?? null,
      platform: platformFrom(userAgent),
      ip,
      user_agent: userAgent?.slice(0, 300) ?? null,
      expires_at: new Date(
        Math.min(
          ctx.now().getTime() + ctx.config.SESSION_DAYS * 86_400_000,
          endsAt?.getTime() ?? Number.POSITIVE_INFINITY,
        ),
      ),
    })
    .execute();
  if (client === 'web') {
    setSessionCookie(reply, ctx, token);
    return null;
  }
  return token;
}

/**
 * Confirming the password while signed in: few tries, so a session someone took can't find the
 * password it'd take to keep the account (a new password, new recovery codes, a passkey added).
 */
export function passwordTry(ctx: AppContext, userId: string): void {
  ctx.limiter.hit(`password-try:${userId}`, ctx.config.isTest ? 1000 : 10, 600_000);
}
