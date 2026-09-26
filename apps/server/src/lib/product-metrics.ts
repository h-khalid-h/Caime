/**
 * The product's health for its operator (PRD §82–83, COMPETITIVE.md): activation, engagement,
 * the core rates and retention, computed from what the product already keeps. Aggregates only:
 * nothing here is about anyone in particular, and nothing reads what anyone wrote. "Active"
 * means opened Caishy or sent a message; people are humans, never an app's bot.
 */
import type { ProductMetricsView, Rate } from '@caishy/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { replyTimes } from './insights';

const DAY_MS = 86_400_000;

const rate = (count: number, of: number): Rate => ({
  count,
  of,
  rate: of > 0 ? Math.round((count / of) * 1000) / 1000 : null,
});

export async function productMetrics(ctx: AppContext, days: number): Promise<ProductMetricsView> {
  const to = ctx.now();
  const from = new Date(to.getTime() - days * DAY_MS);
  const ago = (d: number) => new Date(to.getTime() - d * DAY_MS);
  const q = async <T>(query: ReturnType<typeof sql<T>>) =>
    (await query.execute(ctx.db)).rows[0] as T;

  const people = await q<{ total: number; active7: number; active28: number }>(sql`
    with p as (select id, last_active_at from users where kind = 'human' and deleted_at is null)
    select
      (select count(*)::int from p) as total,
      (select count(*)::int from p where last_active_at > ${ago(7)} or exists (
        select 1 from messages m where m.sender_id = p.id and m.created_at > ${ago(7)})) as active7,
      (select count(*)::int from p where last_active_at > ${ago(28)} or exists (
        select 1 from messages m where m.sender_id = p.id and m.created_at > ${ago(28)})) as active28
  `);

  // Everyone who signed up in the window, and what they did; "activated" only for those who've
  // had their whole first day.
  const activation = await q<{
    signed_up: number;
    connected: number;
    messaged: number;
    classified: number;
    first_day: number;
    activated: number;
  }>(sql`
    with cohort as (
      select id, created_at from users
      where kind = 'human' and deleted_at is null and created_at > ${from} and created_at <= ${to}
    ),
    did as (
      select c.id, c.created_at,
        exists (select 1 from connection_sides s join connections x on x.id = s.connection_id
          where s.owner_id = c.id and x.status = 'active') as connected,
        (select min(m.created_at) from messages m
          where m.sender_id = c.id and m.kind <> 'system') as first_message,
        (select min(r.created_at) from relationships r where r.owner_id = c.id) as first_label
      from cohort c
    )
    select
      count(*)::int as signed_up,
      count(*) filter (where connected)::int as connected,
      count(*) filter (where first_message is not null)::int as messaged,
      count(*) filter (where first_label is not null)::int as classified,
      count(*) filter (where created_at <= ${ago(1)})::int as first_day,
      count(*) filter (where created_at <= ${ago(1)}
        and first_message < created_at + interval '1 day'
        and first_label < created_at + interval '1 day')::int as activated
    from did
  `);

  const engagement = await q<{
    messages: number;
    people: number;
    conversations: number;
    connections: number;
  }>(sql`
    select count(*)::int as messages,
      count(distinct m.sender_id)::int as people,
      count(distinct m.conversation_id)::int as conversations,
      count(distinct c.connection_id)::int as connections
    from messages m
    join users u on u.id = m.sender_id and u.kind = 'human'
    join conversations c on c.id = m.conversation_id
    where m.kind <> 'system' and m.created_at > ${from} and m.created_at <= ${to}
  `);

  const core = await q<{
    requests: number;
    accepted: number;
    sides: number;
    labelled: number;
    waiting: number;
    waiting_closed: number;
    from_messages: number;
    from_messages_closed: number;
    notifications: number;
    important: number;
  }>(sql`
    select
      (select count(*)::int from connection_requests
        where created_at > ${from} and created_at <= ${to}) as requests,
      (select count(*)::int from connection_requests
        where created_at > ${from} and created_at <= ${to} and status = 'accepted') as accepted,
      (select count(*)::int from connection_sides s
        join connections x on x.id = s.connection_id and x.status = 'active'
        join users u on u.id = s.owner_id and u.kind = 'human' and u.deleted_at is null) as sides,
      (select count(*)::int from connection_sides s
        join connections x on x.id = s.connection_id and x.status = 'active'
        join users u on u.id = s.owner_id and u.kind = 'human' and u.deleted_at is null
        where exists (select 1 from relationships r where r.owner_id = s.owner_id
          and r.subject_id = s.other_id and r.status = 'active')) as labelled,
      (select count(*)::int from tasks where assignee_id is distinct from owner_id
        and created_at > ${from} and created_at <= ${to}) as waiting,
      (select count(*)::int from tasks where assignee_id is distinct from owner_id
        and created_at > ${from} and created_at <= ${to}
        and status in ('done', 'declined', 'cancelled')) as waiting_closed,
      (select count(*)::int from tasks where message_id is not null
        and created_at > ${from} and created_at <= ${to}) as from_messages,
      (select count(*)::int from tasks where message_id is not null
        and created_at > ${from} and created_at <= ${to}
        and status in ('done', 'declined', 'cancelled')) as from_messages_closed,
      (select count(*)::int from notifications
        where created_at > ${from} and created_at <= ${to}) as notifications,
      (select count(*)::int from notifications
        where created_at > ${from} and created_at <= ${to}
        and level in ('attention', 'urgency')) as important
  `);

  // Of the people who signed up 7–14 (28–56) days ago, those who sent something a week (four
  // weeks) or more after they joined.
  const retention = await q<{ d7: number; d7_of: number; d28: number; d28_of: number }>(sql`
    with p as (select id, created_at from users where kind = 'human' and deleted_at is null)
    select
      (select count(*)::int from p where created_at > ${ago(14)} and created_at <= ${ago(7)}
        and exists (select 1 from messages m where m.sender_id = p.id and m.kind <> 'system'
          and m.created_at >= p.created_at + interval '7 days')) as d7,
      (select count(*)::int from p where created_at > ${ago(14)} and created_at <= ${ago(7)}) as d7_of,
      (select count(*)::int from p where created_at > ${ago(56)} and created_at <= ${ago(28)}
        and exists (select 1 from messages m where m.sender_id = p.id and m.kind <> 'system'
          and m.created_at >= p.created_at + interval '28 days')) as d28,
      (select count(*)::int from p where created_at > ${ago(56)} and created_at <= ${ago(28)}) as d28_of
  `);

  // Recorded as they happen, without anyone's id: Needs you answered or waved off, and how
  // searches in the app ended (PRD §83).
  const measures = await q<{
    answered: number;
    dismissed: number;
    searches: number;
    found: number;
    median_ms: number | null;
  }>(sql`
    with e as (select type, payload from domain_events
      where type in ('attention.answered', 'attention.dismissed', 'search.outcome')
        and created_at > ${from} and created_at <= ${to})
    select
      count(*) filter (where type = 'attention.answered')::int as answered,
      count(*) filter (where type = 'attention.dismissed')::int as dismissed,
      count(*) filter (where type = 'search.outcome')::int as searches,
      count(*) filter (where type = 'search.outcome' and (payload->>'found')::boolean)::int as found,
      (percentile_cont(0.5) within group (order by (payload->>'ms')::int)
        filter (where type = 'search.outcome' and (payload->>'found')::boolean))::float8 as median_ms
    from e
  `);

  const invites = await q<{ invited: number; via_people: number; via_orgs: number }>(sql`
    select
      count(*) filter (where invited_by is not null or invited_by_org is not null)::int as invited,
      count(*) filter (where invited_by is not null)::int as via_people,
      count(*) filter (where invited_by is null and invited_by_org is not null)::int as via_orgs
    from users
    where kind = 'human' and deleted_at is null and created_at > ${from} and created_at <= ${to}
  `);

  const suggestions = await q<{ accepted: number; decided: number }>(sql`
    select count(*) filter (where status = 'accepted')::int as accepted,
      count(*) filter (where status in ('accepted', 'dismissed'))::int as decided
    from suggestions where created_at > ${from} and created_at <= ${to}
  `);

  const ai = await ctx.db
    .selectFrom('ai_runs')
    .select(['feature', 'outcome', sql<number>`count(*)::int`.as('n')])
    .where('created_at', '>', from)
    .where('created_at', '<=', to)
    .groupBy(['feature', 'outcome'])
    .execute();
  const byFeature: Record<string, { ok: number; other: number }> = {};
  for (const r of ai) {
    const f = byFeature[r.feature] ?? { ok: 0, other: 0 };
    if (r.outcome === 'ok') f.ok += r.n;
    else f.other += r.n;
    byFeature[r.feature] = f;
  }

  const business = await q<{ orgs: number; active: number; conversations: number }>(sql`
    select
      (select count(*)::int from organizations where archived_at is null) as orgs,
      (select count(distinct t.org_id)::int from messages m
        join business_threads t on t.conversation_id = m.conversation_id
        where m.sender_id = t.customer_id and m.created_at > ${from} and m.created_at <= ${to}) as active,
      (select count(distinct m.conversation_id)::int from messages m
        join business_threads t on t.conversation_id = m.conversation_id
        where m.sender_id = t.customer_id and m.created_at > ${from} and m.created_at <= ${to}) as conversations
  `);

  return {
    window: { from: from.toISOString(), to: to.toISOString(), days },
    people: { total: people.total, active7d: people.active7, active28d: people.active28 },
    activation: {
      signedUp: activation.signed_up,
      connected: rate(activation.connected, activation.signed_up),
      messaged: rate(activation.messaged, activation.signed_up),
      classified: rate(activation.classified, activation.signed_up),
      activated: rate(activation.activated, activation.first_day),
    },
    engagement: {
      messages: engagement.messages,
      activePeople: engagement.people,
      activeConversations: engagement.conversations,
      activeConnections: engagement.connections,
    },
    core: {
      connectionCompletion: rate(core.accepted, core.requests),
      relationshipCompletion: rate(core.labelled, core.sides),
      waitingResolution: rate(core.waiting_closed, core.waiting),
      attentionResolution: rate(core.from_messages_closed, core.from_messages),
      notificationEfficiency: rate(core.important, core.notifications),
      retention: {
        day7: rate(retention.d7, retention.d7_of),
        day28: rate(retention.d28, retention.d28_of),
      },
      needsYouPrecision: rate(measures.answered, measures.answered + measures.dismissed),
      informationRetrieval: {
        found: rate(measures.found, measures.searches),
        medianSeconds:
          measures.median_ms == null ? null : Math.round(measures.median_ms / 100) / 10,
      },
    },
    value: {
      tasksFromMessages: core.from_messages,
      suggestionsAccepted: rate(suggestions.accepted, suggestions.decided),
    },
    growth: {
      invited: rate(invites.invited, activation.signed_up),
      viaOrganizations: invites.via_orgs,
      kFactor:
        engagement.people > 0
          ? Math.round((invites.via_people / engagement.people) * 1000) / 1000
          : null,
    },
    ai: {
      calls: ai.reduce((n, r) => n + r.n, 0),
      ok: ai.filter((r) => r.outcome === 'ok').reduce((n, r) => n + r.n, 0),
      byFeature,
    },
    business: {
      organizations: business.orgs,
      activeOrganizations: business.active,
      customerConversations: business.conversations,
      reply: await replyTimes(ctx, { orgId: null, from, to }),
    },
    notMeasured: [
      'Time to find counts searches in the apps only; what was searched for is never kept.',
      'Needs you precision counts answers and “doesn’t need me”; something left alone says nothing.',
      'Invites count sign-ups through someone’s @handle link; a link that was opened and not followed isn’t seen.',
    ],
  };
}
