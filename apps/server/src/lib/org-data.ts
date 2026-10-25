/**
 * What a clinic's lawyer needs (R54): an organization is the controller of its customers'
 * conversations and Caime its processor, so the organization exports its own conversations,
 * erases a customer's at that customer's request, and sets how long they're kept. When it closes,
 * its export stays open to its last owner for a while, and then what was its alone is deleted
 * (DPA §12, `clearClosedOrg`).
 *
 * Erasing is what disappearing does (PRD §60): the words and envelope go, and with them
 * everything kept of the message elsewhere, in one statement, so the daily sweep and an
 * erasure can never differ in what they take.
 */
import type { OrgExportView } from '@caime/core/api';
import type { ApiScope, WebhookEvent } from '@caime/core/apps';
import type { Kysely, RawBuilder, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { listingState } from './app-directory';
import { emitWebhook, forgetDeliveries } from './apps';
import { audit } from './audit';
import { tellSaved } from './automations';
import { bookingOf, catalogOf, orderingOf, paymentsOf } from './booking';
import { dropUnusedFiles, removeStored, type StoredKeys } from './files';
import { previewIdOf, previewUrl } from './link-preview-views';
import { insertSystemMessage, messageViews, participantsOf } from './messages';
import { forgetNotificationsOf, tellForgotten } from './notify';
import { intakeForms } from './org-forms';
import { placesOwnedBy } from './places';
import { KEPT_DAYS } from './retention';
import { itemsWithStock, stockBackCtes, tellStockChanged } from './stock';
import { storageFor } from './storage';

type Q = Kysely<Database> | Transaction<Database>;

export interface Erased {
  /** `recording`: a call recording's stored bytes, by their key (M17 I13b). */
  what: 'saved' | 'gone' | 'stock' | 'file' | 'recording';
  id: string;
  conversation_id: string | null;
}

type ErasedRow = Omit<Erased, 'what'> & { what: Erased['what'] | 'link' };

/**
 * Erase the messages `due` selects (a query of their ids): body, payload, entities, sealed
 * envelope and pin go; so do their assets, files, album photos, what anyone saved of them, the
 * words of what Caime offered from them and their mail copy; an open order among them gives
 * back the stock it took (R60), and the page read for its link's preview goes (M16 E4c: kept
 * by its address alone, so another message with that link reads it again when it's next sent).
 * Returns who had saved something ('saved'), each message gone
 * ('gone'), each host given stock back ('stock') and each file they pointed at ('file'), which
 * the caller hands to `dropErasedFiles` in the same transaction; notifications showing their
 * words are forgotten by the caller (`forgetNotificationsOf`), which needs the ids.
 */
export async function eraseMessagesWhere(
  trx: Q,
  due: RawBuilder<unknown>,
  now: Date,
): Promise<Erased[]> {
  const done = await sql<ErasedRow>`
    with due as (${due}),
    -- Read before the update below (one snapshot for the whole statement): each one's first link.
    linked as (
      select distinct m.entities->'links'->0->>'url' as url
      from messages m join due on m.id = due.id
      where m.entities->'links'->0->>'url' is not null
    ),
    gone as (
      update messages m set deleted_at = ${now}, body = null, payload = '{}',
        entities = '{}', sealed = null, pinned_at = null, pinned_by = null
      from due where m.id = due.id
      returning m.id, m.conversation_id
    ),
    assets_gone as (
      delete from assets where message_id in (select id from gone) returning file_id
    ),
    files_gone as (
      delete from message_files where message_id in (select id from gone) returning file_id
    ),
    album_gone as (
      delete from album_photos where message_id in (select id from gone) returning file_id
    ),
    saved_gone as (
      delete from saved_items where message_id in (select id from gone) returning user_id
    ),
    offers_gone as (
      update suggestions set title = '', rationale = '', payload = '{}', due_text = null,
        status = case when status = 'pending' then 'expired' else status end,
        resolved_at = coalesce(resolved_at, ${now})
      where message_id in (select id from gone)
    ),
    mail_gone as (
      update mail_messages set subject = null, from_address = '', in_reply_to = null,
        references_ids = '{}', delivery_detail = null, html = null, signature = null
      where message_id in (select id from gone)
    ),
    -- A call's line takes Cai's notes of the call with it (M16 F7), and any utterance's audio
    -- still waiting to be heard.
    notes_gone as (
      delete from call_notes where message_id in (select id from gone) returning id
    ),
    -- And Cai's write-up of them (M16 F7e).
    summaries_gone as (
      delete from call_note_summaries where message_id in (select id from gone)
    ),
    note_audio as (
      select file_id from call_note_lines
      where notes_id in (select id from notes_gone) and file_id is not null
    ),
    -- And its recording (M17 I13b): its rows go with the notes, its bytes after the commit.
    recording_gone as (
      select storage_key from call_recording_parts
      where notes_id in (select id from notes_gone) and state <> 'deleted'
    ),
    -- And the frames of its shown screens (M17 I13h).
    frames_gone as (
      select storage_key from call_recording_frames
      where notes_id in (select id from notes_gone)
    ),
    ${stockBackCtes(sql`select id from gone`, now)}
    select distinct 'saved' as what, user_id::text as id, null as conversation_id
    from saved_gone
    union all
    select distinct 'stock', host_id::text, null from stock_taken
    union all
    select distinct 'file', file_id::text, null from (
      select file_id from assets_gone union select file_id from files_gone
      union select file_id from album_gone union select file_id from note_audio
    ) f where file_id is not null
    union all
    select 'recording', storage_key, null from recording_gone
    union all
    select 'recording', storage_key, null from frames_gone
    union all
    select 'link', url, null from linked
    union all
    select 'gone', id::text, conversation_id::text from gone`.execute(trx);
  const previews = done.rows.flatMap((r) => {
    const url = r.what === 'link' ? previewUrl(r.id) : null;
    return url ? [previewIdOf(url)] : [];
  });
  if (previews.length) await trx.deleteFrom('link_previews').where('id', 'in', previews).execute();
  return done.rows.filter((r): r is Erased => r.what !== 'link');
}

/**
 * The files erased messages pointed at that nothing else points at now (a forward, another
 * album and an avatar keep theirs): their rows go in `trx`, and the caller removes their bytes
 * once it commits (`removeStored`), so a removal, a disappearance and an erasure leave none.
 */
export async function dropErasedFiles(trx: Q, rows: Erased[]): Promise<StoredKeys[]> {
  const recordings = rows
    .filter((r) => r.what === 'recording')
    .map((r) => ({ storage_key: r.id, thumb_key: null, preview_key: null }));
  return [
    ...(await dropUnusedFiles(
      trx,
      rows.filter((r) => r.what === 'file').map((r) => r.id),
    )),
    ...recordings,
  ];
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
  const { rows, forgotten, customerId, stored } = await ctx.db
    .transaction()
    .execute(async (trx) => {
      const thread = await trx
        .selectFrom('business_threads as t')
        .innerJoin('organizations as o', 'o.id', 't.org_id')
        .select(['t.conversation_id', 't.customer_id', 'o.name as org_name'])
        .where('t.conversation_id', '=', conversationId)
        .where('t.org_id', '=', orgId)
        .forUpdate('t')
        .executeTakeFirst();
      if (!thread)
        return { rows: null, forgotten: [], orgName: null, customerId: null, stored: [] };
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
      // Its AI agent's draft and what it couldn't answer here go with them too (M16 G6b).
      await trx.deleteFrom('agent_drafts').where('conversation_id', '=', conversationId).execute();
      await trx
        .deleteFrom('agent_questions')
        .where('conversation_id', '=', conversationId)
        .execute();
      // What the team kept about them goes with their words (M16 H3).
      if (thread.customer_id)
        await trx
          .deleteFrom('org_customers')
          .where('org_id', '=', orgId)
          .where('customer_id', '=', thread.customer_id)
          .execute();
      // What its apps were sent of its words goes from their delivery log too (M16 B2).
      await forgetDeliveries(trx, conversationId);
      const gone = rows.filter((r) => r.what === 'gone').map((r) => r.id);
      return {
        rows,
        forgotten: await forgetNotificationsOf(trx, gone),
        orgName: thread.org_name,
        customerId: thread.customer_id,
        stored: await dropErasedFiles(trx, rows),
      };
    });
  if (!rows) return null;
  await removeStored(ctx, storageFor(ctx.config), stored, 'erased conversation');
  await tellSaved(
    ctx,
    rows.filter((r) => r.what === 'saved').map((r) => r.id),
  );
  await tellForgotten(ctx, forgotten);
  await tellStockChanged(
    ctx,
    rows.filter((r) => r.what === 'stock').map((r) => r.id),
  );
  const gone = rows.filter((r) => r.what === 'gone');
  // The organization's apps drop what they kept of it too.
  await emitWebhook(ctx, orgId, 'conversation.erased', { conversationId, erased: gone.length });
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
  // The catalog is the point here (columns.test.ts): what it offers is its own to take.
  const org = await db
    .selectFrom('organizations')
    .select([
      'id',
      'name',
      'handle',
      'kind',
      'about',
      'website',
      'founded_year',
      'country',
      'time_zone',
      'workweek',
      'retention_days',
      'member_apps',
      'created_at',
      'archived_at',
      'booking',
      'booking_items',
      'collections',
      'ordering',
      'payments',
      'greeting',
      'away_message',
      'customer_fields',
    ])
    .where('id', '=', orgId)
    .executeTakeFirstOrThrow();
  const closedAt = org.archived_at;
  const quick = await db
    .selectFrom('org_quick_replies')
    .select(['shortcut', 'body'])
    .where('org_id', '=', orgId)
    .orderBy('position')
    .orderBy('created_at')
    .execute();
  // Its intake forms (M16 H5), as they read now; the answers are on the cards.
  const forms = await intakeForms(db, orgId);
  // What its AI agent couldn't answer, and its drafts waiting for the team (M16 G6b).
  const [agentQuestionsKept, agentDraftsKept] = await Promise.all([
    db
      .selectFrom('agent_questions')
      .select(['conversation_id', 'message_id', 'created_at', 'done_at'])
      .where('org_id', '=', orgId)
      .orderBy('created_at')
      .execute(),
    db
      .selectFrom('agent_drafts')
      .select(['conversation_id', 'action', 'body', 'created_at'])
      .where('org_id', '=', orgId)
      .orderBy('created_at')
      .execute(),
  ]);
  // What its team kept about its customers (M16 H3), with whom each record is about.
  const records = await db
    .selectFrom('org_customers as c')
    .leftJoin('users as u', 'u.id', 'c.customer_id')
    .select(['c.customer_id', 'u.display_name', 'c.note', 'c.tags', 'c.fields', 'c.updated_at'])
    .where('c.org_id', '=', orgId)
    .orderBy('c.updated_at')
    .execute();
  const [team, threads, checkout, listings, agent, apps, cards, updates, invites] =
    await Promise.all([
      // Its team now; closed, as it stood when it closed (every seat ended at that moment).
      db
        .selectFrom('org_members as m')
        .innerJoin('users as u', 'u.id', 'm.user_id')
        .select(['m.user_id', 'u.display_name', 'm.role', 'm.joined_at', 'u.kind'])
        .where('m.org_id', '=', orgId)
        .where((eb) => (closedAt ? eb('m.left_at', '=', closedAt) : eb('m.left_at', 'is', null)))
        .execute(),
      db
        .selectFrom('business_threads as t')
        .innerJoin('conversations as c', 'c.id', 't.conversation_id')
        .leftJoin('users as u', 'u.id', 't.customer_id')
        .leftJoin('organizations as fo', 'fo.id', 't.customer_org_id')
        .select([
          't.conversation_id',
          't.customer_id',
          't.resolved_at',
          't.started_by_team',
          't.erased_at',
          'c.created_at',
          'u.display_name as customer_name',
          'u.handle as customer_handle',
          'fo.id as for_org_id',
          'fo.name as for_org_name',
          'fo.handle as for_org_handle',
        ])
        .where('t.org_id', '=', orgId)
        .orderBy('c.created_at')
        .execute(),
      // Its own checkout account (R65): the provider's id, never a key (Caime holds none).
      db
        .selectFrom('org_checkout')
        .select(['provider', 'account_id', 'livemode', 'charges_enabled', 'connected_at'])
        .where('org_id', '=', orgId)
        .executeTakeFirst(),
      // The apps published under it (R74), and where each listing stands.
      db
        .selectFrom('oauth_clients as a')
        .innerJoin('users as d', 'd.id', 'a.owner_id')
        .select([
          'a.name',
          'a.tagline',
          'a.category',
          'a.listed_at',
          'a.reviewed_at',
          'a.declined_reason',
          'd.display_name as developer_name',
          'd.handle as developer_handle',
        ])
        .where('a.org_id', '=', orgId)
        .where('a.revoked_at', 'is', null)
        .orderBy('a.created_at')
        .execute(),
      db
        .selectFrom('org_agents')
        .select([
          'knowledge',
          'paused_at',
          'may_book',
          'may_order',
          'answers_when',
          'review',
          'created_at',
        ])
        .where('org_id', '=', orgId)
        .executeTakeFirst(),
      // Its own apps, stopped ones too (closing stops them all): never a token or a secret.
      db
        .selectFrom('org_apps')
        .select(['id', 'name', 'scopes', 'webhook_url', 'events', 'created_at', 'revoked_at'])
        .where('org_id', '=', orgId)
        .orderBy('created_at')
        .execute(),
      db
        .selectFrom('app_kits')
        .select(['app_id', 'definition'])
        .where('org_id', '=', orgId)
        .orderBy('created_at')
        .orderBy('key')
        .execute(),
      db
        .selectFrom('org_updates')
        .select(['id', 'body', 'created_at', 'edited_at'])
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .orderBy('created_at')
        .execute(),
      // The invites it handed out (M16 C3a), by link or to an address: never a token's hash.
      db
        .selectFrom('org_invites')
        .select(['role', 'email', 'uses', 'created_at', 'expires_at', 'revoked_at'])
        .where('org_id', '=', orgId)
        .orderBy('created_at')
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
      customerOrg:
        t.for_org_id && t.for_org_name && t.for_org_handle
          ? { id: t.for_org_id, name: t.for_org_name, handle: t.for_org_handle }
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
      about: org.about,
      website: org.website,
      foundedYear: org.founded_year,
      country: org.country,
      timeZone: org.time_zone,
      workweek: org.workweek,
      retentionDays: org.retention_days,
      // Whether its team's own apps reach its conversations (M16 G3).
      memberApps: org.member_apps,
      createdAt: org.created_at.toISOString(),
      closedAt: closedAt?.toISOString() ?? null,
    },
    agent: agent
      ? {
          knowledge: agent.knowledge,
          paused: agent.paused_at !== null,
          mayBook: agent.may_book,
          mayOrder: agent.may_order,
          answersWhen: agent.answers_when,
          review: agent.review,
          createdAt: agent.created_at.toISOString(),
          // What it couldn't answer, and its drafts waiting (M16 G6b).
          questions: agentQuestionsKept.map((q) => ({
            conversationId: q.conversation_id,
            messageId: q.message_id,
            at: q.created_at.toISOString(),
            doneAt: q.done_at?.toISOString() ?? null,
          })),
          drafts: agentDraftsKept.map((d) => ({
            conversationId: d.conversation_id,
            action: d.action,
            body: d.body,
            at: d.created_at.toISOString(),
          })),
        }
      : null,
    apps: apps.map((a) => ({
      name: a.name,
      scopes: a.scopes as ApiScope[],
      webhookUrl: a.webhook_url,
      events: a.events as WebhookEvent[],
      createdAt: a.created_at.toISOString(),
      revokedAt: a.revoked_at?.toISOString() ?? null,
      cards: cards.filter((k) => k.app_id === a.id).map((k) => k.definition),
    })),
    updates: updates.map((u) => ({
      id: u.id,
      body: u.body,
      postedAt: u.created_at.toISOString(),
      editedAt: u.edited_at?.toISOString() ?? null,
    })),
    offer: {
      hours: bookingOf(org),
      // With how many are left of what it counts (R60).
      items: await itemsWithStock(ctx.db, org.id, catalogOf(org).items, true),
      collections: catalogOf(org).collections,
      ordering: orderingOf(org),
      payments: paymentsOf(org),
    },
    // Its places (R92), with who each was shown to.
    places: await placesOwnedBy(ctx, { orgId }),
    replies: { greeting: org.greeting, away: org.away_message, quick },
    forms,
    customers: {
      fields: Array.isArray(org.customer_fields) ? org.customer_fields : [],
      records: records.map((r) => ({
        customerId: r.customer_id,
        displayName: r.display_name,
        note: r.note,
        tags: r.tags,
        fields: r.fields,
        updatedAt: r.updated_at.toISOString(),
      })),
    },
    checkout: checkout
      ? {
          provider: checkout.provider,
          accountId: checkout.account_id,
          livemode: checkout.livemode,
          chargesEnabled: checkout.charges_enabled,
          connectedAt: checkout.connected_at.toISOString(),
        }
      : null,
    listings: listings.map((a) => ({
      name: a.name,
      state: listingState(a),
      tagline: a.tagline,
      category: a.category,
      askedAt: a.listed_at?.toISOString() ?? null,
      reviewedAt: a.reviewed_at?.toISOString() ?? null,
      declinedReason: a.declined_reason,
      developer: { displayName: a.developer_name, handle: a.developer_handle },
    })),
    team: team
      .filter((m) => m.kind === 'human')
      .map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        role: m.role,
        since: m.joined_at.toISOString(),
      })),
    invites: invites.map((i) => ({
      role: i.role,
      email: i.email,
      uses: i.uses,
      createdAt: i.created_at.toISOString(),
      expiresAt: i.expires_at.toISOString(),
      revokedAt: i.revoked_at?.toISOString() ?? null,
    })),
    conversations,
  };
}

const DAY = 86_400_000;

/** Until when a closed organization's export is open to its last owner (DPA §12). */
export const exportOpenUntil = (closedAt: Date): Date =>
  new Date(closedAt.getTime() + KEPT_DAYS.closedOrgExport * DAY);

/**
 * Whether `userId` may export organization `org` at `now`: open, its owner and admins (the
 * caller checks the seat); closed, its last owner alone, until `exportOpenUntil`, and never
 * once what was its alone is gone.
 */
export function closedExportOpenTo(
  org: { archived_at: Date | null; last_owner_id: string | null; cleared_at: Date | null },
  userId: string,
  now: Date,
): boolean {
  return (
    org.archived_at !== null &&
    org.cleared_at === null &&
    org.last_owner_id === userId &&
    now < exportOpenUntil(org.archived_at)
  );
}

/**
 * DPA §12: a closed organization whose export window is over keeps only what its customers' copies
 * show of it (its name, handle, kind and country) and what lets it be taken back (its verified
 * domain, R42). What was its alone goes: its team's seats and roles, its page and settings, its
 * catalog and offer, its agent with the knowledge text it was given, its apps (with their
 * tokens, webhooks, deliveries and kinds of card), its updates and what followers were told of
 * them, its checkout account, and the team's own working notes on each thread (who had it, the
 * escalations, who resolved or erased it). Its logo and catalog photos go when nothing else
 * uses them. The conversations stay as its customers' copies, every message as it was. Returns
 * whether it cleared one (an organization not yet due, or already cleared, is left alone).
 */
export async function clearClosedOrg(ctx: AppContext, orgId: string): Promise<boolean> {
  const now = ctx.now();
  const files = await ctx.db.transaction().execute(async (trx) => {
    const org = await trx
      .selectFrom('organizations')
      .select(['id', 'handle', 'archived_at', 'cleared_at', 'avatar_file_id', 'booking_items'])
      .where('id', '=', orgId)
      .forUpdate()
      .executeTakeFirst();
    if (!org?.archived_at || org.cleared_at || exportOpenUntil(org.archived_at) > now) return null;
    const photos = catalogOf({ booking_items: org.booking_items, collections: [] })
      .items.map((i) => i.photoFileId)
      .filter((id): id is string => typeof id === 'string');
    await trx.deleteFrom('org_members').where('org_id', '=', orgId).execute();
    await trx.deleteFrom('org_invites').where('org_id', '=', orgId).execute();
    await trx.deleteFrom('org_agents').where('org_id', '=', orgId).execute();
    await trx.deleteFrom('agent_drafts').where('org_id', '=', orgId).execute();
    await trx.deleteFrom('agent_questions').where('org_id', '=', orgId).execute();
    await trx.deleteFrom('places').where('org_id', '=', orgId).execute();
    await trx.deleteFrom('org_quick_replies').where('org_id', '=', orgId).execute();
    await trx.deleteFrom('org_customers').where('org_id', '=', orgId).execute();
    await trx.deleteFrom('org_forms').where('org_id', '=', orgId).execute();
    // Its apps' tokens, deliveries and kinds of card go with them; their bots' messages stay in
    // the customers' copies, so the bots themselves stay, as senders.
    await trx.deleteFrom('org_apps').where('org_id', '=', orgId).execute();
    await trx.deleteFrom('org_checkout').where('org_id', '=', orgId).execute();
    await trx.deleteFrom('checkout_states').where('org_id', '=', orgId).execute();
    // Its updates, and what followers were told of each, as a taken-back update's (lib/updates.ts).
    await sql`
      with gone as (delete from org_updates where org_id = ${orgId} returning id)
      delete from notifications
      where kind = 'update' and data->>'updateId' in (select id::text from gone)`.execute(trx);
    await trx
      .updateTable('business_threads')
      .set({
        assignee_id: null,
        escalated_at: null,
        escalated_by: null,
        escalation_note: null,
        resolved_by: null,
        erased_by: null,
        updated_at: now,
      })
      .where('org_id', '=', orgId)
      .execute();
    await trx
      .updateTable('organizations')
      .set({
        about: null,
        website: null,
        founded_year: null,
        avatar_file_id: null,
        time_zone: null,
        workweek: null,
        retention_days: null,
        verify_token: null,
        created_by: null,
        last_owner_id: null,
        booking: null,
        booking_items: JSON.stringify([]),
        collections: JSON.stringify([]),
        ordering: null,
        payments: null,
        greeting: null,
        away_message: null,
        customer_fields: JSON.stringify([]),
        cleared_at: now,
        updated_at: now,
      })
      .where('id', '=', orgId)
      .execute();
    // Its counts went with its catalog (R60).
    await trx.deleteFrom('item_stock').where('org_id', '=', orgId).execute();
    const ids = [org.avatar_file_id, ...photos].filter((id): id is string => Boolean(id));
    return { handle: org.handle, files: await dropUnusedFiles(trx, [...new Set(ids)]) };
  });
  if (!files) return false;
  await removeStored(ctx, storageFor(ctx.config), files.files, 'closed organization');
  await audit(ctx.db, {
    actorId: null,
    action: 'org.cleared',
    target: orgId,
    metadata: { handle: files.handle, files: files.files.length },
  });
  return true;
}

/** Closed organizations clear in lots this size, until none is due. */
const CLEAR_LOT = 50;

/** Daily: each closed organization whose export window is over is cleared (DPA §12). */
export async function sweepClosedOrgs(ctx: AppContext): Promise<void> {
  const due = new Date(ctx.now().getTime() - KEPT_DAYS.closedOrgExport * DAY);
  for (;;) {
    const lot = await ctx.db
      .selectFrom('organizations')
      .select('id')
      .where('archived_at', 'is not', null)
      .where('archived_at', '<=', due)
      .where('cleared_at', 'is', null)
      .orderBy('archived_at')
      .limit(CLEAR_LOT)
      .execute();
    for (const { id } of lot) await clearClosedOrg(ctx, id);
    if (lot.length < CLEAR_LOT) return;
  }
}
