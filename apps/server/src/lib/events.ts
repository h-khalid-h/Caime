/**
 * Domain events (PRD §78): every meaningful state change is written to `domain_events` inside the
 * same transaction as the change, so webhooks, automations and analytics can follow it later
 * without coupling to the code that made it.
 */
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/schema';

export type EventType =
  | 'user.created'
  | 'connection.requested'
  | 'connection.created'
  | 'connection.removed'
  | 'relationship.assigned'
  | 'relationship.changed'
  | 'space.created'
  | 'space.updated'
  | 'space.member_added'
  | 'space.member_left'
  | 'conversation.created'
  | 'message.sent'
  | 'message.edited'
  | 'message.deleted'
  | 'message.read'
  | 'kit.moved'
  | 'context.created'
  | 'task.created'
  | 'task.updated'
  | 'task.completed'
  | 'decision.recorded'
  | 'suggestion.accepted'
  | 'notification.created';

export async function recordEvent(
  db: Kysely<Database> | Transaction<Database>,
  type: EventType,
  actorId: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insertInto('domain_events').values({ type, actor_id: actorId, payload }).execute();
}
