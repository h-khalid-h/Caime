import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';

export type AuditAction =
  | 'auth.signup'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.password_changed'
  | 'auth.recovered'
  | 'auth.recovery_codes_regenerated'
  | 'session.revoked'
  | 'account.exported'
  | 'account.deleted'
  | 'token.created'
  | 'token.revoked'
  | 'calendar.feed_created'
  | 'calendar.feed_stopped'
  | 'org.created'
  | 'org.closed'
  | 'org.reclaim_started'
  | 'org.reclaimed'
  | 'org.deleted'
  | 'org.members_added'
  | 'org.member_removed'
  | 'org.left'
  | 'org.verified'
  | 'org.update_posted'
  | 'org.update_edited'
  | 'org.update_removed'
  | 'app.created'
  | 'app.updated'
  | 'app.token_replaced'
  | 'app.secret_replaced'
  | 'app.kit_saved'
  | 'app.kit_removed'
  | 'app.revoked'
  | 'oauth.app_created'
  | 'oauth.app_removed'
  | 'oauth.allowed'
  | 'oauth.removed'
  | 'agent.created'
  | 'agent.updated'
  | 'agent.removed'
  | 'plan.changed'
  | 'handle.claimed'
  | 'e2ee.device_first'
  | 'e2ee.device_waiting'
  | 'e2ee.device_approved'
  | 'e2ee.device_removed'
  | 'e2ee.device_resumed'
  | 'e2ee.device_restored'
  | 'e2ee.recovery_made';

export async function audit(
  db: Kysely<Database>,
  entry: {
    actorId: string | null;
    action: AuditAction;
    target?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .insertInto('audit_log')
    .values({
      actor_id: entry.actorId,
      action: entry.action,
      target: entry.target ?? null,
      ip: entry.ip ?? null,
      user_agent: entry.userAgent?.slice(0, 300) ?? null,
      metadata: entry.metadata ?? {},
    })
    .execute();
}
