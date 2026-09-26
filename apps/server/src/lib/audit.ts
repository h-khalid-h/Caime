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
  | 'org.created'
  | 'org.members_added'
  | 'org.member_removed'
  | 'org.left'
  | 'org.verified'
  | 'app.created'
  | 'app.updated'
  | 'app.token_replaced'
  | 'app.secret_replaced'
  | 'app.revoked'
  | 'oauth.app_created'
  | 'oauth.app_removed'
  | 'oauth.allowed'
  | 'oauth.removed'
  | 'plan.changed';

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
