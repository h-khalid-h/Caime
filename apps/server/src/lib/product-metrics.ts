/**
 * The product's health for its operator (PRD §82–83, COMPETITIVE.md): activation, engagement,
 * the core rates and retention, computed from what the product already keeps. Aggregates only:
 * nothing here is about anyone in particular, and nothing reads what anyone wrote. "Active"
 * means opened Caime or sent a message; people are humans, never an app's bot.
 */
import type {
  AiCostByPlanView,
  AiCostView,
  OrgPlan,
  Plan,
  ProductMetricsView,
  Rate,
} from '@caime/core';
import { INSTALLED_SURFACES, SURFACES, type Surface } from '@caime/core/api';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { costUsd, inEuros, LONG_PROMPT, PRICES } from './ai-costs';
import { replyTimes } from './insights';
import { effectivePlansOf } from './plans';

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
    waits_due: number;
    waits_on_time: number;
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
      (select count(*)::int from tasks where assignee_id is distinct from owner_id
        and due_at > ${ago(days + 7)} and due_at <= ${ago(7)}) as waits_due,
      (select count(*)::int from tasks where assignee_id is distinct from owner_id
        and due_at > ${ago(days + 7)} and due_at <= ${ago(7)}
        and status in ('done', 'declined', 'cancelled')
        and coalesce(completed_at, updated_at) <= due_at + interval '7 days') as waits_on_time,
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

  // Booking and writing before an account (R97 (1)): their messages are the ones their routes
  // sent (the client id says which), read through the senders they could be, people who were or
  // still are provisional, so the scan is that handful's messages by the sender index, never the
  // table.
  const door = await q<{
    booked: number;
    written: number;
    sites: number;
    cohort: number;
    joined: number;
  }>(sql`
    with s as (select id, claimed_at from users where kind = 'provisional' or claimed_at is not null),
    b as (
      select m.sender_id, min(m.created_at) as first_at,
        count(*) filter (where m.client_id like 'public-book:%'
          and m.created_at > ${from} and m.created_at <= ${to})::int as in_window,
        count(*) filter (where m.client_id like 'public-write:%'
          and m.created_at > ${from} and m.created_at <= ${to})::int as written,
        count(*) filter (where (m.client_id like 'public-write:site:%'
            or m.client_id like 'public-book:site:%')
          and m.created_at > ${from} and m.created_at <= ${to})::int as sites
      from s join messages m on m.sender_id = s.id
      where (m.client_id like 'public-book:%' or m.client_id like 'public-write:%')
        and m.created_at > ${from < ago(60) ? from : ago(60)}
      group by m.sender_id
    )
    select
      coalesce((select sum(in_window) from b), 0)::int as booked,
      coalesce((select sum(written) from b), 0)::int as written,
      coalesce((select sum(sites) from b), 0)::int as sites,
      (select count(*)::int from b where first_at > ${ago(60)} and first_at <= ${ago(30)}) as cohort,
      (select count(*)::int from b join s on s.id = b.sender_id
        where b.first_at > ${ago(60)} and b.first_at <= ${ago(30)}
          and s.claimed_at is not null and s.claimed_at <= b.first_at + interval '30 days') as joined
  `);

  // Join links (M16 C3e): made and joined through in the window, and of those joins, how many
  // were by an account made for the link (under a day old when it joined).
  const joinLinks = await q<{ made: number; joined: number; fresh: number; asked: number }>(sql`
    select
      count(*) filter (where type = 'join_link.made')::int as made,
      count(*) filter (where type = 'join_link.joined')::int as joined,
      count(*) filter (where type = 'join_link.joined' and (payload->>'fresh')::boolean)::int as fresh,
      count(*) filter (where type = 'join_link.asked')::int as asked
    from domain_events
    where type in ('join_link.made', 'join_link.joined', 'join_link.asked')
      and created_at > ${from} and created_at <= ${to}
  `);

  // Meeting guests (R84, M16 C3f): who came in by their link in the window, and of guests, who
  // made it their account in the window: the same row, claimed, by link or by address.
  // M16 F6c: and who came in to a call in their one-to-one by the link their mail carried.
  const guests = await q<{ joined: number; kept: number; from_mail: number }>(sql`
    select
      (select count(distinct g.user_id)::int from meeting_guests g
        join meeting_spaces ms on ms.space_message_id = g.space_message_id
        where g.joined_at > ${from} and g.joined_at <= ${to}) as joined,
      (select count(distinct g.user_id)::int from meeting_guests g
        where not exists (select 1 from meeting_spaces ms
          where ms.space_message_id = g.space_message_id)
          and g.joined_at > ${from} and g.joined_at <= ${to}) as from_mail,
      (select count(distinct g.user_id)::int from meeting_guests g
        join users u on u.id = g.user_id
        where u.claimed_at > ${from} and u.claimed_at <= ${to}) as kept
  `);

  // Chats brought over from WhatsApp (R45, M16 C3g): one-to-ones and groups, and their lines.
  const imports = await q<{ chats: number; groups: number; messages: number }>(sql`
    select
      count(*) filter (where not (payload->>'group')::boolean)::int as chats,
      count(*) filter (where (payload->>'group')::boolean)::int as groups,
      coalesce(sum((payload->>'count')::int), 0)::int as messages
    from domain_events
    where type = 'chat.imported' and created_at > ${from} and created_at <= ${to}
  `);

  // Where the window's people used Caime (R120): each surface's people, from the sessions seen in
  // it, and of everyone seen, those on an app installed on the device.
  const surfaceRows = (
    await sql<{ surface: Surface | null; people: number }>`
      select s.surface, count(distinct s.user_id)::int as people
      from sessions s join users u on u.id = s.user_id and u.kind = 'human'
      where s.kind <> 'api' and s.last_seen_at > ${from} and s.last_seen_at <= ${to}
      group by s.surface
    `.execute(ctx.db)
  ).rows;
  const seen = await q<{ people: number; installed: number }>(sql`
    select count(distinct s.user_id)::int as people,
      count(distinct s.user_id) filter (where s.surface in (${sql.join([...INSTALLED_SURFACES])}))::int
        as installed
    from sessions s join users u on u.id = s.user_id and u.kind = 'human'
    where s.kind <> 'api' and s.last_seen_at > ${from} and s.last_seen_at <= ${to}
  `);
  const surfaces = {
    people: Object.fromEntries(
      [...SURFACES, 'unknown' as const].map((k) => [
        k,
        surfaceRows.find((r) => (r.surface ?? 'unknown') === k)?.people ?? 0,
      ]),
    ) as Record<Surface | 'unknown', number>,
    installed: rate(seen.installed, seen.people),
  };

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

  // Advantage 2's number (REVIEW-2026-10-17 §14): what customers book and order in the
  // conversation, by the cards made in the window (a repeating appointment once, by its first).
  const commerce = await q<{ bookings: number; orders: number; organizations: number }>(sql`
    select
      count(*) filter (where m.payload->>'kit' = 'appointment')::int as bookings,
      count(*) filter (where m.payload->>'kit' = 'order_status')::int as orders,
      count(distinct t.org_id)::int as organizations
    from messages m
    join business_threads t on t.conversation_id = m.conversation_id
    where m.kind = 'kit' and m.deleted_at is null
      and m.payload->>'kit' in ('appointment', 'order_status')
      and coalesce(m.payload->'series'->>'n', '0') = '0'
      and m.created_at > ${from} and m.created_at <= ${to}
  `);
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
      waitsClosedOnTime: rate(core.waits_on_time, core.waits_due),
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
      door: {
        booked: door.booked,
        written: door.written,
        fromSites: door.sites,
        joined: rate(door.joined, door.cohort),
      },
      joinLinks: {
        made: joinLinks.made,
        joined: joinLinks.joined,
        newPeople: joinLinks.fresh,
        asked: joinLinks.asked,
      },
      guests: { joined: guests.joined, kept: guests.kept, fromMail: guests.from_mail },
      imports: { chats: imports.chats, groups: imports.groups, messages: imports.messages },
      surfaces,
    },
    ai: {
      calls: ai.reduce((n, r) => n + r.n, 0),
      ok: ai.filter((r) => r.outcome === 'ok').reduce((n, r) => n + r.n, 0),
      byFeature,
      // What someone missed, summed up (M17 I3): recaps per active person in the window, from
      // the runs kept; a recap by the rules alone leaves no row and is counted on
      // `caime_recaps_total` instead.
      recaps: {
        summaries: byFeature.missed?.ok ?? 0,
        perActivePerson: rate(byFeature.missed?.ok ?? 0, engagement.people),
      },
      cost: await aiSpend(ctx, { from, to, days, active: engagement.people }),
    },
    business: {
      organizations: business.orgs,
      activeOrganizations: business.active,
      customerConversations: business.conversations,
      reply: await replyTimes(ctx, { orgId: null, from, to }),
      commerce: {
        bookings: commerce.bookings,
        orders: commerce.orders,
        organizations: commerce.organizations,
      },
    },
    notMeasured: [
      'Time to find counts searches in the apps only; what was searched for is never kept.',
      'Needs you precision counts answers and “doesn’t need me”; something left alone says nothing.',
      'Invites count sign-ups through someone’s @handle link; a link that was opened and not followed isn’t seen.',
      'Join links count links made and joins through them; a link opened and not followed isn’t seen.',
      'AI cost is the price list’s, read on the day it names, at the plan each person has now; a call on a model it doesn’t name is counted as unpriced, never guessed.',
    ],
  };
}

/** What a run's sum carries, from either of `aiSpend`'s queries. */
interface Spent {
  provider: string;
  model: string | null;
  long: boolean;
  calls: number;
  no_length: number;
  input: string;
  output: string;
  cache_read: string;
  cache_creation: string;
  audio_ms: string | null;
}

/**
 * What the window's model calls cost (M16 H7; REVIEW-2026-10-17 §14, advantage 4's number), at
 * the price list's prices (lib/ai-costs.ts): two summing queries (by feature, and by who answers
 * for the call: a person, or an organization through its agent) and each person's plan read with
 * their seats, a query a thousand. Never per person in what it answers.
 */
async function aiSpend(
  ctx: AppContext,
  w: { from: Date; to: Date; days: number; active: number },
): Promise<AiCostView> {
  const sums = sql`count(*)::int as calls,
    count(*) filter (where r.provider <> 'anthropic' and r.model is not null
      and r.audio_ms is null)::int as no_length,
    coalesce(sum(r.input_tokens), 0)::text as input,
    coalesce(sum(r.output_tokens), 0)::text as output,
    coalesce(sum(r.cache_read_tokens), 0)::text as cache_read,
    coalesce(sum(r.cache_creation_tokens), 0)::text as cache_creation,
    sum(r.audio_ms)::text as audio_ms`;
  // Haiku's dearer rate starts past a prompt this long, so a call is summed with its own kind.
  const long = sql`coalesce(r.input_tokens, 0) + coalesce(r.cache_read_tokens, 0)
    + coalesce(r.cache_creation_tokens, 0) > ${LONG_PROMPT}`;
  const [byFeature, byOwner] = await Promise.all([
    sql<Spent & { feature: string }>`
      select r.feature, r.provider, r.model, ${long} as long, ${sums}
      from ai_runs r
      where r.created_at > ${w.from} and r.created_at <= ${w.to}
      group by r.feature, r.provider, r.model, 4
    `.execute(ctx.db),
    sql<Spent & { user_id: string | null; org_id: string | null; org_plan: OrgPlan | null }>`
      select case when a.org_id is null then r.user_id end as user_id, a.org_id,
        o.plan as org_plan, r.provider, r.model, ${long} as long, ${sums}
      from ai_runs r
      left join org_agents a on a.bot_user_id = r.user_id
      left join organizations o on o.id = a.org_id
      where r.created_at > ${w.from} and r.created_at <= ${w.to}
      group by 1, a.org_id, o.plan, r.provider, r.model, 6
    `.execute(ctx.db),
  ]);
  const usdOf = (r: Spent) =>
    costUsd({
      provider: r.provider,
      model: r.model,
      long: r.long,
      inputTokens: Number(r.input),
      outputTokens: Number(r.output),
      cacheReadTokens: Number(r.cache_read),
      cacheCreationTokens: Number(r.cache_creation),
      audioMs: r.audio_ms === null ? null : Number(r.audio_ms),
    });

  let total = 0;
  let unpriced = 0;
  const features = new Map<string, number>();
  for (const r of byFeature.rows) {
    const usd = usdOf(r);
    if (usd === null) unpriced += r.calls;
    else {
      total += usd;
      // A recording whose length wasn't kept is counted, never priced.
      unpriced += r.no_length;
    }
    features.set(r.feature, (features.get(r.feature) ?? 0) + (usd ?? 0));
  }

  const people = [...new Set(byOwner.rows.flatMap((r) => (r.user_id ? [r.user_id] : [])))];
  const plans = await effectivePlansOf(ctx, people);
  const groups = new Map<
    string,
    { plan: Plan | OrgPlan; whose: AiCostByPlanView['whose']; usd: number; of: Set<string> }
  >();
  for (const r of byOwner.rows) {
    const owner = r.org_id ?? r.user_id;
    if (!owner) continue;
    const whose = r.org_id ? 'organization' : 'person';
    const plan: Plan | OrgPlan = r.org_id
      ? (r.org_plan ?? 'free')
      : (plans.get(owner) ?? 'personal');
    const key = `${whose}:${plan}`;
    const g = groups.get(key) ?? { plan, whose, usd: 0, of: new Set<string>() };
    g.usd += usdOf(r) ?? 0;
    g.of.add(owner);
    groups.set(key, g);
  }
  const month = 30 / w.days;
  return {
    eur: inEuros(total),
    perActivePersonMonth: w.active > 0 ? inEuros((total / w.active) * month) : null,
    byPlan: [...groups.values()]
      .map((g) => ({
        plan: g.plan,
        whose: g.whose,
        eur: inEuros(g.usd),
        count: g.of.size,
        perMonth: inEuros((g.usd / g.of.size) * month),
      }))
      .sort((a, b) => a.whose.localeCompare(b.whose) || b.eur - a.eur),
    byFeature: Object.fromEntries([...features].map(([f, usd]) => [f, inEuros(usd)])),
    unpriced,
    priced: PRICES.read,
  };
}
