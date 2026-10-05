/**
 * Ending sessions. Every path that signs a session out (sign-out, "sign out that device", a
 * password change, a recovery, a suspension, removing a device for private conversations) goes
 * through here, so the live sockets those sessions hold are closed in the same breath: a
 * revoked session that kept its socket would go on hearing every message until the connection
 * happened to drop.
 */
import type { AppContext } from '../context';

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
