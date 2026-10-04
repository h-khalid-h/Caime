/**
 * What a clinic's lawyer needs (R54): an organization is the controller of its customers'
 * conversations and Caime its processor, so the organization exports its own conversations,
 * erases a customer's at that customer's request, and sets how long they're kept.
 *
 * Erasing is what disappearing does (PRD §60): the words and envelope go, and with them
 * everything kept of the message elsewhere, in one statement, so the daily sweep and an
 * erasure can never differ in what they take.
 */
import type { OrgExportView } from '@caime/core/api';
import type { Kysely, RawBuilder, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { tellSaved } from './automations';
import { insertSystemMessage, messageViews, participantsOf } from './messages';
import { forgetNotificationsOf, tellForgotten } from './notify';

type Q = Kysely<Database> | Transaction<Database>;

export interface Erased {
  what: 'saved' | 'gone';
  id: string;
  conversation_id: string | null;
}

/**
 * Erase the messages `due` selects (a query of their ids): body, payload, entities, sealed
 * envelope and pin go; so do their assets, files, album photos, what anyone saved of them, and
 * the words of what Caime offered from them. Returns who had saved something ('saved') and each
 * message gone ('gone'); notifications showing their words are forgotten by the caller
 * (`forgetNotificationsOf`), which needs the ids.
 */
export async function eraseMessagesWhere(
  trx: Q,
  due: RawBuilder<unknown>,
  now: Date,
): Promise<Erased[]> {
  const done = await sql<Erased>`
    with due as (${due}),
    gone as (
      update messages m set deleted_at = ${now}, body = null, payload = '{}',
        entities = '{}', sealed = null, pinned_at = null, pinned_by = null
      from due where m.id = due.id
      returning m.id, m.conversation_id
    ),
    assets_gone as (delete from assets where message_id in (select id from gone)),
    files_gone as (delete from message_files where message_id in (select id from gone)),
    album_gone as (delete from album_photos where message_id in (select id from gone)),
    saved_gone as (
      delete from saved_items where message_id in (select id from gone) returning user_id
    ),
    offers_gone as (
      update suggestions set title = '', rationale = '', payload = '{}', due_text = null,
        status = case when status = 'pending' then 'expired' else status end,
        resolved_at = coalesce(resolved_at, ${now})
      where message_id in (select id from gone)
    )
    select distinct 'saved' as what, user_id::text as id, null as conversation_id
    from saved_gone
    union all
    select 'gone', id::text, conversation_id::text from gone`.execute(trx);
  return done.rows;
}

/**
 * Erase a customer's conversation with an organization at the customer's request: every message
 * in it, as above, then a line in it saying so, so the customer has a record. The thread keeps
 * when and who on the team did it; the conversation stays, and may be written in again.
 */
export async function eraseBusinessConversation(
  ctx: AppContext,
  orgId: string,
  conversationId: string,
  byUserId: string,
): Promise<{ erased: number } | null> {
  const now = ctx.now();
  const { rows, forgotten, customerId } = await ctx.db.transaction().execute(async (trx) => {
    const thread = await trx
      .selectFrom('business_threads as t')
      .innerJoin('organizations as o', 'o.id', 't.org_id')
      .select(['t.conversation_id', 't.customer_id', 'o.name as org_name'])
      .where('t.conversation_id', '=', conversationId)
      .where('t.org_id', '=', orgId)
      .forUpdate('t')
      .executeTakeFirst();
    if (!thread) return { rows: null, forgotten: [], orgName: null, customerId: null };
    const rows = await eraseMessagesWhere(
      trx,
      sql`select id from messages where conversation_id = ${conversationId} and deleted_at is null`,
      now,
    );
    await trx
      .updateTable('business_threads')
      .set({ erased_at: now, erased_by: byUserId, updated_at: now })
      .where('conversation_id', '=', conversationId)
      .execute();
    const gone = rows.filter((r) => r.what === 'gone').map((r) => r.id);
    return {
      rows,
      forgotten: await forgetNotificationsOf(trx, gone),
      orgName: thread.org_name,
      customerId: thread.customer_id,
    };
  });
  if (!rows) return null;
  await tellSaved(
    ctx,
    rows.filter((r) => r.what === 'saved').map((r) => r.id),
  );
  await tellForgotten(ctx, forgotten);
  const gone = rows.filter((r) => r.what === 'gone');
  const who = (await participantsOf(ctx.db, conversationId)).map((p) => p.user_id);
  for (const r of gone.slice(0, 200))
    await ctx.bus.publish(who, { type: 'message.deleted', data: { id: r.id, conversationId } });
  // The record of it, for the customer and the team alike: the organization did it (R15: never
  // which person on its team), at the customer's request. Told as each side sees it: the
  // customer's copy is masked, the team's names who did it.
  const line = await insertSystemMessage(ctx, conversationId, byUserId, 'erased', {
    ...(customerId ? { userId: customerId } : {}),
  });
  const team = who.filter((u) => u !== customerId);
  const [forTeam] = await messageViews(ctx.db, [line], byUserId);
  if (team.length) await ctx.bus.publish(team, { type: 'message.created', data: forTeam });
  if (customerId) {
    const [forCustomer] = await messageViews(ctx.db, [line], customerId);
    await ctx.bus.publish([customerId], { type: 'message.created', data: forCustomer });
  }
  return { erased: gone.length };
}

/**
 * The organization keeps its customers' conversations for `days` (null: as long as the
 * conversation's own setting says). Applied to every message in its conversations now, the
 * earlier of the two settings winning, so a shorter time set later takes what's already there
 * with it on the next sweep, and a longer one lets nothing outlive the conversation's own.
 */
export async function applyOrgRetention(trx: Q, orgId: string, days: number | null, now: Date) {
  await trx
    .updateTable('organizations')
    .set({ retention_days: days, updated_at: now })
    .where('id', '=', orgId)
    .execute();
  await sql`
    update messages m set expires_at = least(
      case when c.retention_days is null then null
           else m.created_at + c.retention_days * interval '1 day' end,
      case when ${days}::int is null then null
           else m.created_at + ${days}::int * interval '1 day' end
    )
    from conversations c, business_threads t
    where t.org_id = ${orgId} and c.id = t.conversation_id and m.conversation_id = c.id
      and m.deleted_at is null`.execute(trx);
}

const EXPORT_MESSAGES_MAX = 200_000;

export async function buildOrgExport(
  ctx: AppContext,
  orgId: string,
  now: Date,
): Promise<OrgExportView> {
  const db = ctx.db;
  const org = await db
    .selectFrom('organizations')
    .select(['id', 'name', 'handle', 'kind', 'retention_days', 'created_at'])
    .where('id', '=', orgId)
    .executeTakeFirstOrThrow();
  const [team, threads] = await Promise.all([
    db
      .selectFrom('org_members as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select(['m.user_id', 'u.display_name', 'm.role', 'm.joined_at', 'u.kind'])
      .where('m.org_id', '=', orgId)
      .where('m.left_at', 'is', null)
      .execute(),
    db
      .selectFrom('business_threads as t')
      .innerJoin('conversations as c', 'c.id', 't.conversation_id')
      .leftJoin('users as u', 'u.id', 't.customer_id')
      .select([
        't.conversation_id',
        't.customer_id',
        't.resolved_at',
        't.started_by_team',
        't.erased_at',
        'c.created_at',
        'u.display_name as customer_name',
        'u.handle as customer_handle',
      ])
      .where('t.org_id', '=', orgId)
      .orderBy('c.created_at')
      .execute(),
  ]);
  const roleOf = new Map(team.map((m) => [m.user_id, m]));
  const conversations: OrgExportView['conversations'] = [];
  let count = 0;
  for (const t of threads) {
    const messages = await db
      .selectFrom('messages as m')
      .leftJoin('users as s', 's.id', 'm.sender_id')
      .select([
        'm.id',
        'm.seq',
        'm.sender_id',
        'm.kind',
        'm.body',
        'm.payload',
        'm.created_at',
        'm.edited_at',
        'm.deleted_at',
        's.display_name as sender_name',
        's.kind as sender_kind',
      ])
      .where('m.conversation_id', '=', t.conversation_id)
      .orderBy('m.seq')
      .execute();
    count += messages.length;
    if (count > EXPORT_MESSAGES_MAX)
      throw Object.assign(new Error('export_too_large'), { status: 413 });
    const files = messages.length
      ? await db
          .selectFrom('message_files as mf')
          .innerJoin('files as f', 'f.id', 'mf.file_id')
          .select(['mf.message_id', 'f.name', 'f.mime', 'f.size'])
          .where(
            'mf.message_id',
            'in',
            messages.map((m) => m.id),
          )
          .orderBy('mf.position')
          .execute()
      : [];
    conversations.push({
      conversationId: t.conversation_id,
      customer:
        t.customer_id && t.customer_name && t.customer_handle
          ? { userId: t.customer_id, displayName: t.customer_name, handle: t.customer_handle }
          : null,
      state: t.resolved_at ? 'resolved' : 'open',
      startedByTeam: t.started_by_team,
      createdAt: t.created_at.toISOString(),
      erasedAt: t.erased_at?.toISOString() ?? null,
      messages: messages.map((m) => ({
        id: m.id,
        seq: Number(m.seq),
        from:
          m.kind === 'system'
            ? 'system'
            : m.sender_id === null
              ? 'unknown'
              : m.sender_id === t.customer_id
                ? 'customer'
                : m.sender_kind === 'agent'
                  ? 'agent'
                  : m.sender_kind === 'bot'
                    ? 'bot'
                    : 'team',
        // The team by name (its own people); a customer is named once, above, never per message.
        senderName:
          m.sender_id && m.sender_id !== t.customer_id && roleOf.has(m.sender_id)
            ? m.sender_name
            : null,
        kind: m.kind,
        body: m.deleted_at ? null : m.body,
        payload: m.deleted_at ? null : (m.payload as Record<string, unknown>),
        files: files
          .filter((f) => f.message_id === m.id)
          .map((f) => ({ name: f.name, mime: f.mime, size: Number(f.size) })),
        createdAt: m.created_at.toISOString(),
        editedAt: m.edited_at?.toISOString() ?? null,
        deletedAt: m.deleted_at?.toISOString() ?? null,
      })),
    });
  }
  return {
    exportedAt: now.toISOString(),
    organization: {
      id: org.id,
      name: org.name,
      handle: org.handle,
      kind: org.kind,
      retentionDays: org.retention_days,
      createdAt: org.created_at.toISOString(),
    },
    team: team
      .filter((m) => m.kind === 'human')
      .map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        role: m.role,
        since: m.joined_at.toISOString(),
      })),
    conversations,
  };
}
