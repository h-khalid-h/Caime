/**
 * How a Business inbox is doing (PRD §71): how fast the team answers, how many customers write,
 * what's still open. Counts and times only; nothing anyone wrote, and nobody on the team is
 * singled out, so it measures the service, not the people (PRD §71's "not surveillance").
 */
import type { OrgInsightsView, ReplyTimesView } from '@caishy/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';

const DAY_MS = 86_400_000;

/**
 * Customers' waits that started in (from, to], and how long each took until someone on the team
 * answered. A wait starts with a customer's message after the team's (or the first one); an
 * app's bot answering doesn't end it, just as it doesn't move whose turn it is (R16).
 */
export async function replyTimes(
  ctx: AppContext,
  { orgId, from, to }: { orgId: string | null; from: Date; to: Date },
): Promise<ReplyTimesView> {
  const { rows } = await sql<{
    answered: number;
    unanswered: number;
    within_hour: number;
    median_seconds: number | null;
  }>`
    with said as (
      select m.conversation_id, m.seq::bigint as seq, m.created_at,
        case when m.sender_id = t.customer_id then 'customer' else 'team' end as who
      from messages m
      join business_threads t on t.conversation_id = m.conversation_id
      join users u on u.id = m.sender_id
      where (${orgId}::uuid is null or t.org_id = ${orgId}::uuid)
        and m.kind <> 'system'
        and (m.sender_id = t.customer_id or u.kind = 'human')
    ),
    turns as (
      select *, lag(who) over (partition by conversation_id order by seq) as before from said
    ),
    waits as (
      select w.created_at as started,
        (select min(a.created_at) from said a
          where a.conversation_id = w.conversation_id and a.seq > w.seq and a.who = 'team') as answered
      from turns w
      where w.who = 'customer' and (w.before is null or w.before = 'team')
        and w.created_at > ${from} and w.created_at <= ${to}
    )
    select
      (select count(*)::int from waits where answered is not null) as answered,
      (select count(*)::int from waits where answered is null) as unanswered,
      (select count(*)::int from waits
        where answered is not null and answered - started <= interval '1 hour') as within_hour,
      (select percentile_cont(0.5) within group (order by extract(epoch from answered - started))
        from waits where answered is not null)::float8 as median_seconds
  `.execute(ctx.db);
  const r = rows[0];
  return {
    medianMinutes: r?.median_seconds == null ? null : Math.round((r.median_seconds / 60) * 10) / 10,
    answered: r?.answered ?? 0,
    withinHour: r?.within_hour ?? 0,
    unanswered: r?.unanswered ?? 0,
  };
}

async function counts(ctx: AppContext, orgId: string, from: Date, to: Date) {
  const { rows } = await sql<{
    conversations: number;
    started: number;
    resolved: number;
    escalated: number;
  }>`
    select
      (select count(distinct m.conversation_id)::int from messages m
        join business_threads t on t.conversation_id = m.conversation_id
        where t.org_id = ${orgId} and m.sender_id = t.customer_id
          and m.created_at > ${from} and m.created_at <= ${to}) as conversations,
      (select count(*)::int from business_threads
        where org_id = ${orgId} and created_at > ${from} and created_at <= ${to}) as started,
      (select count(*)::int from business_threads
        where org_id = ${orgId} and resolved_at > ${from} and resolved_at <= ${to}) as resolved,
      (select count(*)::int from business_threads
        where org_id = ${orgId} and escalated_at > ${from} and escalated_at <= ${to}) as escalated
  `.execute(ctx.db);
  return rows[0] ?? { conversations: 0, started: 0, resolved: 0, escalated: 0 };
}

export async function orgInsights(
  ctx: AppContext,
  orgId: string,
  days: number,
): Promise<OrgInsightsView> {
  const to = ctx.now();
  const from = new Date(to.getTime() - days * DAY_MS);
  const before = new Date(from.getTime() - days * DAY_MS);
  const [now, prev, reply, prevReply, waiting] = await Promise.all([
    counts(ctx, orgId, from, to),
    counts(ctx, orgId, before, from),
    replyTimes(ctx, { orgId, from, to }),
    replyTimes(ctx, { orgId, from: before, to: from }),
    ctx.db
      .selectFrom('business_threads')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('org_id', '=', orgId)
      .where('resolved_at', 'is', null)
      .where(sql<boolean>`last_customer_seq > last_team_seq`)
      .executeTakeFirstOrThrow(),
  ]);
  return {
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    conversations: now.conversations,
    newConversations: now.started,
    reply,
    waitingNow: waiting.n,
    resolved: now.resolved,
    escalated: now.escalated,
    previous: {
      conversations: prev.conversations,
      newConversations: prev.started,
      medianReplyMinutes: prevReply.medianMinutes,
      resolved: prev.resolved,
    },
  };
}
