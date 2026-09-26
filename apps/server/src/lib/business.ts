/**
 * The Business inbox (PRD §37–38, R15). A customer and an organization share one conversation,
 * which the organization's whole team is in as agents: the team sees who answered, and the
 * customer sees the organization, never the person. Everything a customer is sent about a
 * business conversation passes through the mask here, where every id but their own reads as
 * the organization's. There are only two sides, so that rule needs no list of who's on the team,
 * and holds for people who have since left it.
 */
import {
  type BusinessThreadView,
  type MessageView,
  type OrgRef,
  threadState,
  waitingSince,
} from '@caishy/core';
import type { Kysely, Transaction } from 'kysely';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { BusinessThread, Database, Organization } from '../db/schema';
import type { RealtimeEvent } from './bus';
import { messagePreview } from './messages';
import { personViewsFor } from './people-batch';

type Q = Kysely<Database> | Transaction<Database>;

export function orgRef(
  o: Pick<Organization, 'id' | 'name' | 'handle' | 'kind' | 'domain' | 'verified_at'>,
): OrgRef {
  const verified = o.verified_at !== null;
  return {
    id: o.id,
    name: o.name,
    handle: o.handle,
    kind: o.kind,
    verified,
    verifiedDomain: verified ? o.domain : null,
  };
}

// --- What a customer sees of the team ---------------------------------------------------------

export interface CustomerMask {
  conversationId: string;
  orgId: string;
  orgName: string;
  customerId: string;
}

const MASK_TTL_MS = 60_000;
const MASK_CACHE_MAX = 5000;
const masks = new Map<string, { mask: CustomerMask | null; at: number; business: boolean }>();

/**
 * A business conversation's customer and organization, or null for any other conversation. A
 * conversation's kind never changes, so "not business" is kept; the organization's name can,
 * so a business entry is looked up again after a minute.
 */
export async function customerMask(db: Q, conversationId: string): Promise<CustomerMask | null> {
  const now = Date.now();
  const hit = masks.get(conversationId);
  if (hit && (!hit.business || now - hit.at < MASK_TTL_MS)) return hit.mask;
  const row = await db
    .selectFrom('conversations as c')
    .leftJoin('business_threads as t', 't.conversation_id', 'c.id')
    .leftJoin('organizations as o', 'o.id', 't.org_id')
    .select(['c.kind', 't.org_id', 't.customer_id', 'o.name'])
    .where('c.id', '=', conversationId)
    .executeTakeFirst();
  if (!row) return null;
  const business = row.kind === 'business';
  const mask =
    business && row.org_id && row.customer_id
      ? { conversationId, orgId: row.org_id, orgName: row.name ?? '', customerId: row.customer_id }
      : null;
  if (masks.size >= MASK_CACHE_MAX) masks.delete(masks.keys().next().value as string);
  masks.set(conversationId, { mask, at: now, business });
  return mask;
}

/** The mask to apply for this viewer: only the customer is masked; the team sees everyone. */
export async function maskFor(
  db: Q,
  conversationId: string,
  viewerId: string,
): Promise<CustomerMask | null> {
  const mask = await customerMask(db, conversationId);
  return mask && mask.customerId === viewerId ? mask : null;
}

/** The masks for whichever of these conversations the viewer is a business customer in. */
export async function masksFor(
  ctx: Pick<AppContext, 'db'>,
  viewerId: string,
  conversationIds: string[],
): Promise<Map<string, CustomerMask>> {
  const out = new Map<string, CustomerMask>();
  for (const id of new Set(conversationIds)) {
    const mask = await maskFor(ctx.db, id, viewerId);
    if (mask) out.set(id, mask);
  }
  return out;
}

export function maskId(mask: CustomerMask, id: string | null): string | null {
  return id === null || id === mask.customerId ? id : mask.orgId;
}

/** Ids and names inside a message's payload: system lines, kit card history, task requests. */
export function maskPayload(
  p: Record<string, unknown>,
  mask: CustomerMask,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...p };
  const other = (v: unknown) => typeof v === 'string' && v !== mask.customerId;
  if (other(out.byId)) {
    out.byId = mask.orgId;
    out.by = mask.orgName;
  }
  if (other(out.userId)) {
    out.userId = mask.orgId;
    if ('name' in out) out.name = mask.orgName;
  }
  if (Array.isArray(out.userIds)) {
    const ids = out.userIds as unknown[];
    out.userIds = [...new Set(ids.map((id) => (other(id) ? mask.orgId : id)))];
    if (Array.isArray(out.names)) out.names = ids.some(other) ? [mask.orgName] : out.names;
  }
  for (const key of ['decidedBy', 'assigneeId', 'ownerId'] as const)
    if (other(out[key])) out[key] = mask.orgId;
  if (Array.isArray(out.history))
    out.history = (out.history as Array<Record<string, unknown>>).map((h) =>
      other(h.by) ? { ...h, by: mask.orgId } : h,
    );
  return out;
}

export function maskMessage(view: MessageView, mask: CustomerMask): MessageView {
  return {
    ...view,
    senderId: maskId(mask, view.senderId),
    replyTo: view.replyTo
      ? { ...view.replyTo, senderId: maskId(mask, view.replyTo.senderId) }
      : null,
    mentions: view.mentions.filter((id) => id === mask.customerId),
    reactions: view.reactions.map((r) => {
      const userIds = [...new Set(r.userIds.map((id) => maskId(mask, id) as string))];
      return { ...r, userIds, count: userIds.length };
    }),
    payload: maskPayload(view.payload, mask),
  };
}

/** The realtime events that name someone in a conversation. */
const NAMING_EVENTS = new Set([
  'message.created',
  'message.updated',
  'reaction',
  'receipts',
  'typing',
]);

function maskEvent(event: RealtimeEvent, mask: CustomerMask): RealtimeEvent {
  if (event.type === 'message.created' || event.type === 'message.updated')
    return { ...event, data: maskMessage(event.data as MessageView, mask) };
  const data = event.data as Record<string, unknown>;
  return { ...event, data: { ...data, userId: maskId(mask, data.userId as string) } };
}

/**
 * The bus's last step: an event about a business conversation that names someone reaches its
 * customer masked, and everyone else as it is. No call site has to remember.
 */
export function businessRealtime(ctx: Pick<AppContext, 'db'>) {
  return async (
    userIds: string[],
    event: RealtimeEvent,
  ): Promise<Array<[string[], RealtimeEvent]>> => {
    const conversationId = (event.data as { conversationId?: unknown } | null)?.conversationId;
    if (!NAMING_EVENTS.has(event.type) || typeof conversationId !== 'string')
      return [[userIds, event]];
    const mask = await customerMask(ctx.db, conversationId);
    if (!mask || !userIds.includes(mask.customerId)) return [[userIds, event]];
    const team = userIds.filter((u) => u !== mask.customerId);
    return [
      ...(team.length ? ([[team, event]] as Array<[string[], RealtimeEvent]>) : []),
      [[mask.customerId], maskEvent(event, mask)],
    ];
  };
}

// --- The team ----------------------------------------------------------------------------------

/** Everyone on the team, who answer the organization's conversations as agents. */
export async function teamOf(db: Q, orgId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('org_members')
    .select('user_id')
    .where('org_id', '=', orgId)
    .where('left_at', 'is', null)
    .execute();
  return rows.map((r) => r.user_id);
}

/** A new team member is in every one of the organization's conversations, caught up. */
export async function joinThreads(db: Q, orgId: string, userId: string): Promise<void> {
  await sql`
    insert into participants (conversation_id, user_id, role, last_read_seq, last_delivered_seq)
    select t.conversation_id, ${userId}, 'agent', c.last_seq, c.last_seq
    from business_threads t join conversations c on c.id = t.conversation_id
    where t.org_id = ${orgId} and t.customer_id is distinct from ${userId}
    on conflict (conversation_id, user_id)
      do update set left_at = null, role = 'agent'
  `.execute(db);
}

/** Someone leaving the team leaves its conversations, and hands back the ones they had. */
export async function leaveThreads(db: Q, orgId: string, userId: string, now: Date) {
  await db
    .updateTable('participants')
    .set({ left_at: now })
    .where('user_id', '=', userId)
    .where('role', '=', 'agent')
    .where('left_at', 'is', null)
    .where('conversation_id', 'in', (eb) =>
      eb.selectFrom('business_threads').select('conversation_id').where('org_id', '=', orgId),
    )
    .execute();
  await db
    .updateTable('business_threads')
    .set({ assignee_id: null, updated_at: now })
    .where('org_id', '=', orgId)
    .where('assignee_id', '=', userId)
    .execute();
}

/**
 * A message moves its thread: the customer writing reopens it and puts it on the team; the team
 * writing puts it back with the customer, and whoever answers an unassigned thread takes it.
 */
export async function recordBusinessMessage(
  ctx: AppContext,
  conversationId: string,
  senderId: string,
  message: { seq: string | number; created_at: Date },
): Promise<void> {
  const at = message.created_at;
  const seq = Number(message.seq);
  const thread = await ctx.db
    .selectFrom('business_threads')
    .select(['org_id', 'customer_id'])
    .where('conversation_id', '=', conversationId)
    .executeTakeFirst();
  if (!thread) return;
  if (senderId === thread.customer_id)
    await ctx.db
      .updateTable('business_threads')
      .set({
        last_customer_seq: sql<string>`greatest(last_customer_seq, ${seq})`,
        last_customer_at: at,
        resolved_at: null,
        resolved_by: null,
        updated_at: at,
      })
      .where('conversation_id', '=', conversationId)
      .execute();
  else
    await ctx.db
      .updateTable('business_threads')
      .set({
        last_team_seq: sql<string>`greatest(last_team_seq, ${seq})`,
        last_team_at: at,
        assignee_id: sql<string>`coalesce(assignee_id, ${senderId})`,
        updated_at: at,
      })
      .where('conversation_id', '=', conversationId)
      .execute();
  await publishThread(ctx, thread.org_id, conversationId);
}

/** Tell the team a thread changed (the customer never hears how the team works it). */
export async function publishThread(ctx: AppContext, orgId: string, conversationId: string) {
  await ctx.bus.publish(await teamOf(ctx.db, orgId), {
    type: 'business.updated',
    data: { orgId, threadId: conversationId },
  });
}

// --- Threads as the team sees them ------------------------------------------------------------

export function factsOf(t: BusinessThread) {
  return {
    assigneeId: t.assignee_id,
    escalatedAt: t.escalated_at?.toISOString() ?? null,
    resolvedAt: t.resolved_at?.toISOString() ?? null,
    lastCustomerSeq: Number(t.last_customer_seq),
    lastTeamSeq: Number(t.last_team_seq),
    lastCustomerAt: t.last_customer_at?.toISOString() ?? null,
  };
}

/** Views of an organization's threads for one team member, newest activity first. */
export async function threadViews(
  ctx: AppContext,
  viewerId: string,
  threads: BusinessThread[],
): Promise<BusinessThreadView[]> {
  if (threads.length === 0) return [];
  const ids = threads.map((t) => t.conversation_id);
  const people = [
    ...new Set(
      threads.flatMap((t) =>
        [t.assignee_id, t.escalated_by].filter((x): x is string => Boolean(x)),
      ),
    ),
  ];
  const [customers, names, lastMessages, mine] = await Promise.all([
    personViewsFor(
      ctx,
      viewerId,
      threads.map((t) => t.customer_id).filter((x): x is string => Boolean(x)),
    ),
    people.length
      ? ctx.db
          .selectFrom('users')
          .select(['id', 'display_name'])
          .where('id', 'in', people)
          .execute()
      : Promise.resolve([]),
    ctx.db
      .selectFrom('messages as m')
      .leftJoin('users as u', 'u.id', 'm.sender_id')
      .selectAll('m')
      .select('u.display_name as sender_name')
      .where(
        sql<boolean>`(m.conversation_id, m.seq) in (select conversation_id, max(seq) from messages where conversation_id in (${sql.join(ids)}) and kind <> 'system' group by conversation_id)`,
      )
      .execute(),
    ctx.db
      .selectFrom('participants as p')
      .select([
        'p.conversation_id',
        // What the customer wrote that I haven't read: the team's own replies aren't news.
        sql<number>`(select count(*)::int from messages m join business_threads t on t.conversation_id = m.conversation_id where m.conversation_id = p.conversation_id and m.seq > p.last_read_seq and m.sender_id = t.customer_id and m.deleted_at is null)`.as(
          'unread',
        ),
      ])
      .where('p.user_id', '=', viewerId)
      .where('p.conversation_id', 'in', ids)
      .execute(),
  ]);
  const nameOf = (id: string | null) =>
    id ? (names.find((n) => n.id === id)?.display_name ?? null) : null;
  return threads.map((t) => {
    const facts = factsOf(t);
    const last = lastMessages.find((m) => m.conversation_id === t.conversation_id);
    return {
      conversationId: t.conversation_id,
      state: threadState(facts),
      customer: t.customer_id ? (customers.get(t.customer_id) ?? null) : null,
      assignee: t.assignee_id
        ? { userId: t.assignee_id, displayName: nameOf(t.assignee_id) ?? 'Someone' }
        : null,
      escalated: t.escalated_at
        ? {
            at: t.escalated_at.toISOString(),
            byName: nameOf(t.escalated_by),
            note: t.escalation_note,
          }
        : null,
      resolvedAt: facts.resolvedAt,
      waitingSince: waitingSince(facts),
      lastMessage: last
        ? {
            preview: messagePreview(last),
            senderName: last.sender_name,
            fromCustomer: last.sender_id === t.customer_id,
            createdAt: last.created_at.toISOString(),
          }
        : null,
      unreadCount: mine.find((m) => m.conversation_id === t.conversation_id)?.unread ?? 0,
      lastActivityAt: (last?.created_at ?? t.updated_at).toISOString(),
    };
  });
}
