/**
 * Automations (PRD §69), run as a message arrives: for each person it arrives for, whatever
 * automations of theirs match who sent it and what it shares keep it in a collection of theirs
 * (core automations.ts). Only for someone who's in the conversation, never from a private one
 * (its words and files are sealed), and never from a message request they haven't accepted.
 */
import {
  type AutomationView,
  type AutomationWhen,
  automationMatches,
  describeAutomation,
  SAVED_MAX,
  type SaveKind,
  type Sphere,
  uuidv7,
} from '@caishy/core';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { AutomationsTable, Conversation, Database, Message } from '../db/schema';
import { customerMask } from './business';
import { activeRelationships } from './relations';

type AutomationRow = Omit<
  AutomationsTable,
  'words' | 'enabled' | 'runs' | 'created_at' | 'updated_at'
> & {
  words: string[];
  enabled: boolean;
  runs: number;
  created_at: Date;
  updated_at: Date;
};

export function whenOf(
  row: Pick<AutomationRow, 'scope_sphere' | 'scope_role' | 'kinds' | 'words'>,
): AutomationWhen {
  return {
    sphere: (row.scope_sphere as Sphere | null) ?? null,
    role: row.scope_role ?? null,
    kinds: row.kinds as SaveKind[],
    words: row.words ?? [],
  };
}

export function automationView(row: AutomationRow): AutomationView {
  const when = whenOf(row);
  return {
    id: row.id,
    name: row.name,
    when,
    collection: row.collection,
    enabled: row.enabled,
    runs: row.runs,
    lastRunAt: row.last_run_at?.toISOString() ?? null,
    description: describeAutomation({ when, collection: row.collection }),
    createdAt: row.created_at.toISOString(),
  };
}

/** How many things someone has saved. */
export async function savedCount(ctx: Pick<AppContext, 'db'>, userId: string): Promise<number> {
  const row = await ctx.db
    .selectFrom('saved_items')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('user_id', '=', userId)
    .executeTakeFirstOrThrow();
  return row.n;
}

export async function runAutomations(
  ctx: AppContext,
  conversation: Conversation,
  message: Message,
  recipients: Array<{ user_id: string; request_state: string | null }>,
): Promise<void> {
  if (!message.sender_id || conversation.privacy_class === 'private' || message.sealed) return;
  // Only someone who has let the conversation in: a request they haven't accepted saves nothing.
  const open = recipients.filter(
    (r) => r.request_state !== 'pending' && r.request_state !== 'declined',
  );
  if (!open.length) return;
  const assets = await ctx.db
    .selectFrom('assets')
    .select(['id', 'kind', 'title', 'url', 'host'])
    .where('message_id', '=', message.id)
    .execute();
  if (!assets.length) return;
  const automations = await ctx.db
    .selectFrom('automations')
    .selectAll()
    .where(
      'user_id',
      'in',
      open.map((r) => r.user_id),
    )
    .where('enabled', '=', true)
    .execute();
  if (!automations.length) return;
  // Nothing is kept from someone blocked, either way.
  const sender = message.sender_id;
  const blocked = new Set(
    (
      await ctx.db
        .selectFrom('blocks')
        .select(['blocker_id', 'blocked_id'])
        .where((w) =>
          w.or([
            w.and([
              w('blocked_id', '=', sender),
              w(
                'blocker_id',
                'in',
                automations.map((a) => a.user_id),
              ),
            ]),
            w.and([
              w('blocker_id', '=', sender),
              w(
                'blocked_id',
                'in',
                automations.map((a) => a.user_id),
              ),
            ]),
          ]),
        )
        .execute()
    ).map((b) => (b.blocker_id === sender ? b.blocked_id : b.blocker_id)),
  );
  const mask =
    conversation.kind === 'business' ? await customerMask(ctx.db, conversation.id) : null;
  const text = message.body ?? '';
  const byUser = new Map<string, typeof automations>();
  for (const a of automations)
    if (!blocked.has(a.user_id)) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a]);
  const changed: string[] = [];
  for (const [userId, theirs] of byUser) {
    // How they know whoever sent it. In a conversation with an organization, to its team the
    // other side is a customer, and to the customer it's an organization.
    let sphere: Sphere | null = null;
    let role: string | null = null;
    if (mask) sphere = userId === mask.customerId ? 'organization' : 'customer';
    else {
      const [rel] = await activeRelationships(ctx.db, userId, [sender]);
      sphere = (rel?.sphere as Sphere | undefined) ?? null;
      role = rel?.role ?? null;
    }
    let room = SAVED_MAX - (await savedCount(ctx, userId));
    let saved = 0;
    for (const a of theirs) {
      const when = whenOf(a);
      for (const asset of assets) {
        if (room <= 0) break;
        const name = [asset.title, asset.url, asset.host].filter(Boolean).join(' ');
        if (!automationMatches(when, { sphere, role, kind: asset.kind, name, text })) continue;
        const res = await ctx.db
          .insertInto('saved_items')
          .values({
            id: uuidv7(),
            user_id: userId,
            collection: a.collection,
            conversation_id: conversation.id,
            message_id: message.id,
            asset_id: asset.id,
            automation_id: a.id,
            created_at: ctx.now(),
          })
          .onConflict((oc) => oc.doNothing())
          .executeTakeFirst();
        if (Number(res.numInsertedOrUpdatedRows ?? 0) === 0) continue;
        room--;
        saved++;
        await ctx.db
          .updateTable('automations')
          .set((eb) => ({ runs: eb('runs', '+', 1), last_run_at: ctx.now() }))
          .where('id', '=', a.id)
          .execute();
      }
    }
    if (saved) changed.push(userId);
  }
  if (changed.length) await ctx.bus.publish(changed, { type: 'saved.changed', data: {} });
}

/**
 * What's kept of these messages goes with them (deleted for everyone, deleted for oneself, or
 * disappeared). Says whose saved things went, for `tellSaved` once it's done.
 */
export async function dropSaved(
  db: Kysely<Database> | Transaction<Database>,
  messageIds: string[],
  onlyUserId?: string,
): Promise<string[]> {
  if (!messageIds.length) return [];
  const gone = await db
    .deleteFrom('saved_items')
    .where('message_id', 'in', messageIds)
    .$if(Boolean(onlyUserId), (qb) => qb.where('user_id', '=', onlyUserId!))
    .returning('user_id')
    .execute();
  return [...new Set(gone.map((g) => g.user_id))];
}

/** Their lists catch up on every device. */
export async function tellSaved(ctx: AppContext, userIds: string[]): Promise<void> {
  if (userIds.length) await ctx.bus.publish(userIds, { type: 'saved.changed', data: {} });
}
