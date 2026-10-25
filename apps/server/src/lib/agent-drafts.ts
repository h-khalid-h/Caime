/**
 * What an organization's AI agent leaves for its team (M16 G6b), read here so the conversation,
 * the Business inbox and the agent's setup see the same: the draft waiting in a conversation
 * while the organization checks its answers before they're sent, and what it couldn't answer from
 * what it was told. The writing is `lib/agent.ts`'s (`writeDraft`, `sendDraft`, `dropDraft`,
 * `handOver`); this module reads, so `lib/business.ts` and the views never import the agent.
 */
import type { AgentCitation, AgentDraftView, AgentQuestionView } from '@caime/core';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';

/** A draft as kept (`agent_drafts.draft`). */
export interface AgentDraft {
  /** Its answer alone, without its introduction, for a person to take into their own reply. */
  message: string;
  /** Its first message in the conversation: it opens with who it is (R87). */
  introduction: boolean;
  cited: AgentCitation[];
  /** What it decided beyond its words, carried out as it decided when the draft is sent. */
  plan: {
    bookAt: string | null;
    bookFor: string | null;
    bookItem: string | null;
    orderLines: Array<{ itemId: string; quantity: number; choices: string[] }> | null;
    orderWay: 'pickup' | 'delivery' | null;
  };
  booking: AgentDraftView['booking'];
  order: AgentDraftView['order'];
}

/**
 * A draft stands while it answers the customer's latest message, nobody on the team has written
 * since, and the conversation is open; anything else made it moot.
 */
export const STANDING_DRAFT = sql<boolean>`t.last_customer_seq = d.seq and t.last_team_seq < d.seq and t.resolved_at is null and t.erased_at is null`;

/** The draft waiting in a conversation for its team, or null. */
export async function draftFor(
  db: Kysely<Database>,
  conversationId: string,
): Promise<AgentDraftView | null> {
  const row = await db
    .selectFrom('agent_drafts as d')
    .innerJoin('business_threads as t', 't.conversation_id', 'd.conversation_id')
    .select(['d.seq', 'd.action', 'd.body', 'd.draft', 'd.created_at'])
    .where('d.conversation_id', '=', conversationId)
    .where(STANDING_DRAFT)
    .executeTakeFirst();
  if (!row) return null;
  const draft = row.draft as AgentDraft;
  return {
    seq: Number(row.seq),
    action: row.action,
    body: row.body,
    message: draft.message,
    cited: draft.cited,
    booking: draft.booking,
    order: draft.order,
    createdAt: row.created_at.toISOString(),
  };
}

/** Which of these conversations have a draft waiting: one query for a page of the inbox. */
export async function draftedIn(
  db: Kysely<Database>,
  conversationIds: readonly string[],
): Promise<Set<string>> {
  if (conversationIds.length === 0) return new Set();
  const rows = await db
    .selectFrom('agent_drafts as d')
    .innerJoin('business_threads as t', 't.conversation_id', 'd.conversation_id')
    .select('d.conversation_id')
    .where('d.conversation_id', 'in', conversationIds)
    .where(STANDING_DRAFT)
    .execute();
  return new Set(rows.map((r) => r.conversation_id));
}

/** How many questions it couldn't answer wait for its owner and admins. */
export async function openQuestions(db: Kysely<Database>, orgId: string): Promise<number> {
  const row = await db
    .selectFrom('agent_questions')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('org_id', '=', orgId)
    .where('done_at', 'is', null)
    .executeTakeFirstOrThrow();
  return row.n;
}

/** At most this many are listed, the newest first. */
const QUESTIONS_SHOWN = 50;

/**
 * What it couldn't answer, for its owner and admins: the customer's words as they stand now (a
 * message deleted, emptied or past its time is left out), who asked, and when.
 */
export async function agentQuestions(
  ctx: Pick<AppContext, 'db' | 'now'>,
  orgId: string,
): Promise<AgentQuestionView[]> {
  const now = ctx.now();
  const rows = await ctx.db
    .selectFrom('agent_questions as q')
    .innerJoin('messages as m', 'm.id', 'q.message_id')
    .leftJoin('business_threads as t', 't.conversation_id', 'q.conversation_id')
    .leftJoin('users as u', 'u.id', 't.customer_id')
    .select(['q.id', 'q.conversation_id', 'q.created_at', 'm.body', 'u.display_name'])
    .where('q.org_id', '=', orgId)
    .where('q.done_at', 'is', null)
    .where('m.deleted_at', 'is', null)
    .where('m.sealed', 'is', null)
    .where((eb) => eb.or([eb('m.expires_at', 'is', null), eb('m.expires_at', '>', now)]))
    .where('m.body', 'is not', null)
    .orderBy('q.created_at', 'desc')
    .limit(QUESTIONS_SHOWN)
    .execute();
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    customer: r.display_name,
    text: r.body ?? '',
    at: r.created_at.toISOString(),
  }));
}
