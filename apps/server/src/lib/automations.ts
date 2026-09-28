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
} from '@caime/core';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { AutomationsTable, Conversation, Database, Message } from '../db/schema';
import { customerMask } from './business';
import { notHiddenFor } from './messages';

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

type Q = Kysely<Database> | Transaction<Database>;

/**
 * What someone saved that they can still see: in a conversation they're in, not deleted, not
 * deleted by them for themselves. It's what Saved lists and what counts toward the most one
 * keeps, so nothing they can't see or remove fills their room.
 */
export function visibleSaved(db: Q, userId: string) {
  return db
    .selectFrom('saved_items as s')
    .innerJoin('messages as m', 'm.id', 's.message_id')
    .innerJoin('participants as p', (j) =>
      j.onRef('p.conversation_id', '=', 's.conversation_id').on('p.user_id', '=', userId),
    )
    .where('s.user_id', '=', userId)
    .where('p.left_at', 'is', null)
    .where('m.deleted_at', 'is', null)
    .where(notHiddenFor(userId, 's.message_id'));
}

/** How many things someone has saved that they can see. */
export async function savedCount(db: Q, userId: string): Promise<number> {
  const row = await visibleSaved(db, userId)
    .select(sql<number>`count(*)::int`.as('n'))
    .executeTakeFirstOrThrow();
  return row.n;
}

/** One person's saved things are counted and added one at a time, so the most holds. */
export async function lockSaved(trx: Transaction<Database>, userId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`saved:${userId}`}))`.execute(trx);
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
  const sender = message.sender_id;
  const text = message.body ?? '';
  const named = assets.map((a) => ({
    ...a,
    name: [a.title, a.url, a.host].filter(Boolean).join(' '),
  }));
  const mask =
    conversation.kind === 'business' ? await customerMask(ctx.db, conversation.id) : null;
  // What each automation could keep of this message by what it is and its words, before
  // anything is looked up for its owner: most keep nothing of most messages.
  const byUser = new Map<string, Array<{ a: (typeof automations)[number]; could: typeof named }>>();
  for (const a of automations) {
    // With an organization, each side keeps what the other side sends: its team, what the
    // customer sends; the customer, what the organization does. Never the team's own.
    if (mask && (a.user_id === mask.customerId) === (sender === mask.customerId)) continue;
    const when = { ...whenOf(a), sphere: null, role: null };
    const could = named.filter((asset) =>
      automationMatches(when, {
        sphere: null,
        role: null,
        kind: asset.kind,
        name: asset.name,
        text,
      }),
    );
    if (could.length) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), { a, could }]);
  }
  if (!byUser.size) return;
  const owners = [...byUser.keys()];
  // Nothing is kept from someone blocked, either way. A customer's own blocks of people on an
  // organization's team don't reach into its conversation: what's missing would say who wrote.
  const personal = mask ? owners.filter((u) => u !== mask.customerId) : owners;
  const blocked = new Set(
    personal.length
      ? (
          await ctx.db
            .selectFrom('blocks')
            .select(['blocker_id', 'blocked_id'])
            .where((w) =>
              w.or([
                w.and([w('blocked_id', '=', sender), w('blocker_id', 'in', personal)]),
                w.and([w('blocker_id', '=', sender), w('blocked_id', 'in', personal)]),
              ]),
            )
            .execute()
        ).map((b) => (b.blocker_id === sender ? b.blocked_id : b.blocker_id))
      : [],
  );
  // How each of them knows whoever sent it, in one read: their primary relationship first.
  const rels = mask
    ? []
    : await ctx.db
        .selectFrom('relationships')
        .select(['owner_id', 'sphere', 'role'])
        .where('owner_id', 'in', owners)
        .where('subject_id', '=', sender)
        .where('status', '=', 'active')
        .orderBy('is_primary', 'desc')
        .orderBy('created_at', 'asc')
        .execute();
  const changed: string[] = [];
  for (const [userId, theirs] of byUser) {
    if (blocked.has(userId)) continue;
    // In a conversation with an organization, to its team the other side is a customer, and to
    // the customer it's an organization.
    let sphere: Sphere | null = null;
    let role: string | null = null;
    if (mask) sphere = userId === mask.customerId ? 'organization' : 'customer';
    else {
      const rel = rels.find((r) => r.owner_id === userId);
      sphere = (rel?.sphere as Sphere | undefined) ?? null;
      role = rel?.role ?? null;
    }
    // Only automations for how they know whoever sent it: none, and nothing is counted or held.
    const mine = theirs.filter(({ a }) => {
      const when = whenOf(a);
      return (!when.sphere || when.sphere === sphere) && (!when.role || when.role === role);
    });
    if (!mine.length) continue;
    const saved = await ctx.db.transaction().execute(async (trx) => {
      await lockSaved(trx, userId);
      let room = SAVED_MAX - (await savedCount(trx, userId));
      let n = 0;
      for (const { a, could } of mine) {
        const when = whenOf(a);
        for (const asset of could) {
          if (room <= 0) break;
          const arrival = { sphere, role, kind: asset.kind, name: asset.name, text };
          if (!automationMatches(when, arrival)) continue;
          const res = await trx
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
          n++;
          await trx
            .updateTable('automations')
            .set((eb) => ({ runs: eb('runs', '+', 1), last_run_at: ctx.now() }))
            .where('id', '=', a.id)
            .execute();
        }
      }
      return n;
    });
    if (saved) changed.push(userId);
  }
  // What's saved and each automation's count, on every open device.
  if (changed.length) await ctx.bus.publish(changed, { type: 'automations.changed', data: {} });
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
