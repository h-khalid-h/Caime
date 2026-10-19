/**
 * How a Business inbox is doing (PRD §71): how fast the team answers, how many customers write,
 * what's still open, and what the conversations came to (M16 H4: booked, ordered, paid; who
 * bought and who came back; when customers write). Counts, times and sums only; nothing anyone
 * wrote, and nobody on the team is singled out, so it measures the service, not the people (PRD
 * §71's "not surveillance").
 */
import type {
  InsightPersonRef,
  MoneyTotal,
  OrgCommerceView,
  OrgInsightsView,
  PersonInsightsView,
  ReplyTimesView,
} from '@caime/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { personViewsFor } from './people-batch';

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

/** A Pay card or an invoice sent this long before a period may still be paid in it, and is read. */
const PAID_LOOKBACK_MS = 365 * DAY_MS;

/** Sums by currency, the largest first, with a float's dust taken off. */
function totals(
  rows: Array<{ currency: string | null; value: string | number | null }>,
): MoneyTotal[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    const value = Number(r.value ?? 0);
    if (!Number.isFinite(value) || value === 0) continue;
    const key = r.currency ?? '';
    by.set(key, (by.get(key) ?? 0) + value);
  }
  return [...by]
    .map(([currency, value]) => ({
      currency: currency || null,
      value: Math.round(value * 1000) / 1000,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * The appointments and orders made in the period and the one before (`before` to `to`), in one
 * pass over the organization's cards: a repeating appointment counts once, by its first card.
 * What an order comes to is its own amount, else its lines' prices; what was booked or ordered
 * most is by name as it was then, a booking once and an order's line by its quantity. A
 * customer bought with an order, a booking they asked for, or a time the team proposed and they
 * agreed to; nothing cancelled counts.
 */
async function cardsMade(ctx: AppContext, orgId: string, from: Date, to: Date, before: Date) {
  const { rows } = await sql<{
    made: number;
    confirmed: number;
    cancelled: number;
    requested: number;
    from_catalog: number;
    p_made: number;
    placed: number;
    o_cancelled: number;
    p_placed: number;
    bought: number;
    order_values: Array<{ currency: string | null; value: string | null }>;
    top: Array<{ name: string; count: number }>;
  }>`
    with cards as (
      select m.payload->>'kit' as kit, m.payload->>'state' as state,
        m.payload->'booking' as booking, m.payload->'order'->'lines' as lines,
        m.payload->'fields'->'amount' as amount, t.customer_id, m.sender_id,
        m.created_at > ${from} as now
      from messages m
      join business_threads t on t.conversation_id = m.conversation_id
      where t.org_id = ${orgId} and m.kind = 'kit' and m.deleted_at is null
        and m.payload->>'kit' in ('appointment', 'order_status')
        and coalesce(m.payload->'series'->>'n', '0') = '0'
        and m.created_at > ${before} and m.created_at <= ${to}
    ),
    lines as (
      select c.amount, l as line
      from cards c
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(c.lines) = 'array' then c.lines else '[]'::jsonb end) l
      where c.kit = 'order_status' and c.now and c.state is distinct from 'cancelled'
    )
    select
      count(*) filter (where kit = 'appointment' and now)::int as made,
      count(*) filter (where kit = 'appointment' and now
        and state in ('confirmed', 'done'))::int as confirmed,
      count(*) filter (where kit = 'appointment' and now and state = 'cancelled')::int as cancelled,
      count(*) filter (where kit = 'appointment' and now and state = 'requested')::int as requested,
      count(*) filter (where kit = 'appointment' and now
        and jsonb_typeof(booking) = 'object')::int as from_catalog,
      count(*) filter (where kit = 'appointment' and not now)::int as p_made,
      count(*) filter (where kit = 'order_status' and now)::int as placed,
      count(*) filter (where kit = 'order_status' and now and state = 'cancelled')::int as o_cancelled,
      count(*) filter (where kit = 'order_status' and not now)::int as p_placed,
      count(distinct customer_id) filter (where now and state is distinct from 'cancelled'
        and (kit = 'order_status' or sender_id = customer_id
          or state in ('confirmed', 'done')))::int as bought,
      (select coalesce(json_agg(v), '[]') from (
        select amount->>'currency' as currency, sum((amount->>'value')::numeric)::text as value
        from cards
        where kit = 'order_status' and now and state is distinct from 'cancelled'
          and jsonb_typeof(amount->'value') = 'number'
        group by 1
        union all
        select line->'price'->>'currency', sum((line->'price'->>'value')::numeric)::text
        from lines
        where jsonb_typeof(amount->'value') is distinct from 'number'
          and jsonb_typeof(line->'price'->'value') = 'number'
        group by 1
      ) v) as order_values,
      (select coalesce(json_agg(x), '[]') from (
        select name, sum(n)::int as count from (
          select booking->>'name' as name, 1 as n from cards
          where kit = 'appointment' and now and state is distinct from 'cancelled'
            and jsonb_typeof(booking) = 'object'
          union all
          select line->>'name',
            case when jsonb_typeof(line->'quantity') = 'number'
              then greatest((line->>'quantity')::numeric::int, 1) else 1 end
          from lines
        ) y
        where name is not null and name <> ''
        group by name order by count desc, name limit 5
      ) x) as top
    from cards
  `.execute(ctx.db);
  return rows[0];
}

/**
 * What the organization was paid in the period and the one before: Pay cards it asked for (or a
 * customer said they were paying it) and invoices it sent, marked paid then, by their last
 * "paid" in the card's history; cards sent within a year before are read, the rest never.
 */
async function paidIn(ctx: AppContext, orgId: string, from: Date, to: Date, before: Date) {
  const { rows } = await sql<{
    currency: string | null;
    value: string | null;
    before: string | null;
  }>`
    select m.payload->'fields'->'amount'->>'currency' as currency,
      (sum((m.payload->'fields'->'amount'->>'value')::numeric)
        filter (where p.at > ${from}))::text as value,
      (sum((m.payload->'fields'->'amount'->>'value')::numeric)
        filter (where p.at <= ${from}))::text as before
    from messages m
    join business_threads t on t.conversation_id = m.conversation_id
    cross join lateral (
      select max((h->>'at')::timestamptz) as at
      from jsonb_array_elements(case when jsonb_typeof(m.payload->'history') = 'array'
        then m.payload->'history' else '[]'::jsonb end) h
      where h->>'state' = 'paid' and h->>'at' like '____-__-__T%'
    ) p
    where t.org_id = ${orgId} and m.kind = 'kit' and m.deleted_at is null
      and m.created_at > ${new Date(before.getTime() - PAID_LOOKBACK_MS)}
      and m.payload->>'state' = 'paid'
      and jsonb_typeof(m.payload->'fields'->'amount'->'value') = 'number'
      and ((m.payload->>'kit' = 'invoice' and m.sender_id is distinct from t.customer_id)
        or (m.payload->>'kit' = 'payment_request' and (
          (m.sender_id is distinct from t.customer_id
            and coalesce(m.payload->'fields'->>'direction', 'ask') <> 'send')
          or (m.sender_id = t.customer_id and m.payload->'fields'->>'direction' = 'send'))))
      and p.at > ${before} and p.at <= ${to}
    group by 1
  `.execute(ctx.db);
  return {
    now: totals(rows.map((r) => ({ currency: r.currency, value: r.value }))),
    before: totals(rows.map((r) => ({ currency: r.currency, value: r.before }))),
  };
}

/**
 * The customers who wrote in the period, those of them who were its customers before it, and
 * when they wrote on the organization's clock. A zone the database doesn't know reads as UTC.
 */
async function customersIn(
  ctx: AppContext,
  orgId: string,
  from: Date,
  to: Date,
  timeZone: string,
): Promise<{
  wrote: number;
  returning: number;
  byHour: number[];
  byWeekday: number[];
  zone: string;
}> {
  const run = (zone: string) =>
    sql<{
      wrote: number;
      returning: number;
      times: Array<{ dow: number; hour: number; n: number }>;
    }>`
      with said as (
        select m.created_at, t.customer_id
        from messages m
        join business_threads t on t.conversation_id = m.conversation_id
        where t.org_id = ${orgId} and m.sender_id = t.customer_id and m.kind <> 'system'
          and m.created_at > ${from} and m.created_at <= ${to}
      ),
      who as (select distinct customer_id from said)
      select
        (select count(*)::int from who) as wrote,
        (select count(*)::int from who w where exists (
          select 1 from business_threads b
          where b.org_id = ${orgId} and b.customer_id = w.customer_id
            and b.created_at <= ${from})) as returning,
        (select coalesce(json_agg(x), '[]') from (
          select extract(dow from created_at at time zone ${zone})::int as dow,
            extract(hour from created_at at time zone ${zone})::int as hour,
            count(*)::int as n
          from said group by 1, 2
        ) x) as times
    `.execute(ctx.db);
  let zone = timeZone;
  let result: Awaited<ReturnType<typeof run>>;
  try {
    result = await run(zone);
  } catch (err) {
    if ((err as { code?: string }).code !== '22023') throw err;
    zone = 'UTC';
    result = await run(zone);
  }
  const r = result.rows[0];
  const byHour = Array.from({ length: 24 }, () => 0);
  const byWeekday = Array.from({ length: 7 }, () => 0);
  for (const x of r?.times ?? []) {
    if (x.hour >= 0 && x.hour < 24) byHour[x.hour] = (byHour[x.hour] ?? 0) + x.n;
    if (x.dow >= 0 && x.dow < 7) byWeekday[x.dow] = (byWeekday[x.dow] ?? 0) + x.n;
  }
  return { wrote: r?.wrote ?? 0, returning: r?.returning ?? 0, byHour, byWeekday, zone };
}

/** What the conversations came to in the period (M16 H4), with the period before to compare. */
async function commerce(
  ctx: AppContext,
  orgId: string,
  { from, to, before }: { from: Date; to: Date; before: Date },
  timeZone: string,
): Promise<OrgCommerceView> {
  const [made, paid, people] = await Promise.all([
    cardsMade(ctx, orgId, from, to, before),
    paidIn(ctx, orgId, from, to, before),
    customersIn(ctx, orgId, from, to, timeZone),
  ]);
  return {
    bookings: {
      made: made?.made ?? 0,
      confirmed: made?.confirmed ?? 0,
      cancelled: made?.cancelled ?? 0,
      requested: made?.requested ?? 0,
      fromCatalog: made?.from_catalog ?? 0,
    },
    orders: {
      placed: made?.placed ?? 0,
      cancelled: made?.o_cancelled ?? 0,
      value: totals(made?.order_values ?? []),
    },
    paid: paid.now,
    customers: { wrote: people.wrote, bought: made?.bought ?? 0, returning: people.returning },
    top: made?.top ?? [],
    byHour: people.byHour,
    byWeekday: people.byWeekday,
    timeZone: people.zone,
    previous: { bookings: made?.p_made ?? 0, orders: made?.p_placed ?? 0, paid: paid.before },
  };
}

export async function orgInsights(
  ctx: AppContext,
  orgId: string,
  days: number,
  /** The organization's clock, which "when customers write" is on. */
  timeZone: string,
): Promise<OrgInsightsView> {
  const to = ctx.now();
  const from = new Date(to.getTime() - days * DAY_MS);
  const before = new Date(from.getTime() - days * DAY_MS);
  const [now, prev, reply, prevReply, waiting, came] = await Promise.all([
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
    commerce(ctx, orgId, { from, to, before }, timeZone),
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
    commerce: came,
  };
}

/**
 * How someone's relationships are going (R47), from their own one-to-ones only: direct
 * conversations and their topics, never a business thread or a group, and only counts and
 * times, never a word. The window is `days` back from now, with the window before it to
 * compare. Names and photos come through the privacy evaluator as the person sees them.
 */
export async function personInsights(
  ctx: AppContext,
  userId: string,
  days: number,
  timeZone: string,
): Promise<PersonInsightsView> {
  const to = ctx.now();
  const from = new Date(to.getTime() - days * DAY_MS);
  const before = new Date(from.getTime() - days * DAY_MS);
  // Everything said in this person's one-to-ones (topics included), and who said it.
  const said = sql`
    said as (
      select m.conversation_id, m.seq::bigint as seq, m.created_at, m.sender_id,
        o.user_id as other_id,
        case when m.sender_id = ${userId}::uuid then 'me' else 'them' end as who
      from messages m
      join conversations c on c.id = m.conversation_id
      join participants me on me.conversation_id = c.id and me.user_id = ${userId}::uuid
      join participants o on o.conversation_id = c.id and o.user_id <> ${userId}::uuid
      where c.kind = 'direct' and c.direct_key is not null
        and m.kind <> 'system' and m.deleted_at is null
        and m.sender_id in (${userId}::uuid, o.user_id)
        and not exists (select 1 from business_threads t where t.conversation_id = c.id)
    )`;
  const [counts, per, quietRows, hours, started, yours, theirs, connections, spheres] =
    await Promise.all([
      sql<{
        sent: number;
        received: number;
        active: number;
        p_sent: number;
        p_received: number;
        p_active: number;
      }>`
        with ${said}
        select
          count(*) filter (where who = 'me' and created_at > ${from} and created_at <= ${to})::int as sent,
          count(*) filter (where who = 'them' and created_at > ${from} and created_at <= ${to})::int as received,
          count(distinct other_id) filter (where created_at > ${from} and created_at <= ${to})::int as active,
          count(*) filter (where who = 'me' and created_at > ${before} and created_at <= ${from})::int as p_sent,
          count(*) filter (where who = 'them' and created_at > ${before} and created_at <= ${from})::int as p_received,
          count(distinct other_id) filter (where created_at > ${before} and created_at <= ${from})::int as p_active
        from said`.execute(ctx.db),
      sql<{ other_id: string; n: number; mine: number; conversation_id: string }>`
        with ${said}
        select other_id, count(*)::int as n, count(*) filter (where who = 'me')::int as mine,
          (select s2.conversation_id from said s2 join conversations c2 on c2.id = s2.conversation_id
            where s2.other_id = said.other_id and c2.is_general limit 1) as conversation_id
        from said where created_at > ${from} and created_at <= ${to}
        group by other_id order by n desc, other_id limit 5`.execute(ctx.db),
      sql<{ other_id: string; last_at: Date; conversation_id: string | null }>`
        with ${said}
        select cs.other_id, max(said.created_at) as last_at,
          (select c2.id from conversations c2 join participants p2 on p2.conversation_id = c2.id
            where c2.direct_key is not null and c2.is_general and p2.user_id = cs.other_id
              and exists (select 1 from participants p3 where p3.conversation_id = c2.id and p3.user_id = ${userId}::uuid)
            limit 1) as conversation_id
        from connection_sides cs
        join connections cn on cn.id = cs.connection_id and cn.status = 'active'
        join said on said.other_id = cs.other_id
        where cs.owner_id = ${userId}::uuid and cs.merged_into is null and cs.archived_at is null
        group by cs.other_id
        having max(said.created_at) <= ${from}
        order by last_at desc limit 8`.execute(ctx.db),
      sql<{ hour: number; n: number }>`
        with ${said}
        select extract(hour from created_at at time zone ${timeZone})::int as hour, count(*)::int as n
        from said where who = 'me' and created_at > ${from} and created_at <= ${to}
        group by 1`.execute(ctx.db),
      sql<{ by_me: number; by_them: number }>`
        with ${said},
        gaps as (
          select who, created_at,
            lag(created_at) over (partition by conversation_id order by seq) as prev
          from said
        )
        select
          count(*) filter (where who = 'me')::int as by_me,
          count(*) filter (where who = 'them')::int as by_them
        from gaps
        where created_at > ${from} and created_at <= ${to}
          and (prev is null or created_at - prev >= interval '1 day')`.execute(ctx.db),
      directReplyTimes(ctx, said, 'them', 'me', from, to),
      directReplyTimes(ctx, said, 'me', 'them', from, to),
      ctx.db
        .selectFrom('connection_sides as cs')
        .innerJoin('connections as cn', 'cn.id', 'cs.connection_id')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('cs.owner_id', '=', userId)
        .where('cs.merged_into', 'is', null)
        .where('cn.status', '=', 'active')
        .executeTakeFirstOrThrow(),
      ctx.db
        .selectFrom('relationships as r')
        .innerJoin('connections as cn', 'cn.id', 'r.connection_id')
        .select(['r.sphere', sql<number>`count(distinct r.subject_id)::int`.as('n')])
        .where('r.owner_id', '=', userId)
        .where('r.status', '=', 'active')
        .where('cn.status', '=', 'active')
        .groupBy('r.sphere')
        .orderBy(sql`count(distinct r.subject_id)`, 'desc')
        .execute(),
    ]);
  const c = counts.rows[0];
  const people = await personViewsFor(ctx, userId, [
    ...per.rows.map((r) => r.other_id),
    ...quietRows.rows.map((r) => r.other_id),
  ]);
  const ref = (id: string, conversationId: string | null): InsightPersonRef | null => {
    const p = people.get(id);
    return p
      ? { userId: id, displayName: p.displayName, avatarUrl: p.avatarUrl, conversationId }
      : null;
  };
  const byHour = new Array<number>(24).fill(0);
  for (const h of hours.rows) if (h.hour >= 0 && h.hour < 24) byHour[h.hour] = h.n;
  return {
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    connections: {
      total: connections.n,
      bySphere: spheres.map((r) => ({ sphere: r.sphere, count: r.n })),
    },
    active: { count: c?.active ?? 0, previous: c?.p_active ?? 0 },
    messages: {
      sent: c?.sent ?? 0,
      received: c?.received ?? 0,
      previous: { sent: c?.p_sent ?? 0, received: c?.p_received ?? 0 },
    },
    reply: { yours, theirs },
    closest: per.rows.flatMap((r) => {
      const p = ref(r.other_id, r.conversation_id);
      return p
        ? [{ ...p, messages: r.n, yourShare: r.n ? Math.round((r.mine / r.n) * 100) / 100 : 0 }]
        : [];
    }),
    quiet: quietRows.rows.flatMap((r) => {
      const p = ref(r.other_id, r.conversation_id);
      return p ? [{ ...p, lastAt: r.last_at.toISOString() }] : [];
    }),
    hours: byHour,
    started: { byYou: started.rows[0]?.by_me ?? 0, byThem: started.rows[0]?.by_them ?? 0 },
  };
}

/**
 * Reply times in one-to-ones: how long `answerer` took to answer `asker`. A wait starts at the
 * asker's last message before the answer (an answer is to what was said last), and is
 * unanswered while the asker's is the last word. Unlike a customer's wait (`replyTimes`), it
 * doesn't start at the first message of a run: between two people, writing twice isn't waiting
 * twice as long.
 */
async function directReplyTimes(
  ctx: AppContext,
  said: ReturnType<typeof sql>,
  asker: 'me' | 'them',
  answerer: 'me' | 'them',
  from: Date,
  to: Date,
): Promise<ReplyTimesView> {
  const { rows } = await sql<{
    answered: number;
    unanswered: number;
    within_hour: number;
    median_seconds: number | null;
  }>`
    with ${said},
    turns as (
      select *, lead(who) over (partition by conversation_id order by seq) as next from said
    ),
    waits as (
      select w.created_at as started,
        (select min(a.created_at) from said a
          where a.conversation_id = w.conversation_id and a.seq > w.seq and a.who = ${answerer}) as answered
      from turns w
      where w.who = ${asker} and (w.next is null or w.next = ${answerer})
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
