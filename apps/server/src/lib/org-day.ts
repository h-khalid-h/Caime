/**
 * An organization's day, for whoever runs it (M17 I15a, R115, the council in
 * docs/REVIEW-2026-10-25-CAI.md §6): what needs its team today, by the rules, counts and times
 * only, every number the Business inbox's own so that a tap on its link shows the same: "Needs a
 * reply" by core `customerWaiting` (and how many of those the AI agent answered, since its words
 * never move a thread), the agent's answers waiting to be sent (`standing`, as the inbox reads
 * them), the questions it couldn't answer that are still open (as its setup counts them), today's
 * bookings on the organization's own clock and orders still open. Never a customer's words, never
 * a team member's own conversations. Cai's answer to "how is the clinic doing" and the morning
 * brief read it: one round of queries for every organization someone runs.
 */
import {
  addDays,
  foldForIntent,
  formatClock,
  formatWhenAt,
  MANAGING_ROLES,
  safeLocale,
  tr,
  trn,
  zonedParts,
  zonedTimeToUtc,
} from '@caime/core';
import { HELD_APPOINTMENT_STATES, OPEN_ORDER_STATES } from '@caime/core/kit-states';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { STANDING_DRAFT } from './agent-drafts';
import { defaultZoneOf } from './geo';

/** At most this many organizations are told of at once; the rest are counted. */
export const ORGS_TOLD = 3;
/** How many organizations someone runs are looked at, to say how many more there are. */
const ORGS_READ = 50;

export interface RunOrg {
  id: string;
  name: string;
  handle: string;
  /** The organization's own clock: its zone, else its country's. */
  zone: string;
}

/** What needs an organization's team today. */
export interface OrgDay extends RunOrg {
  /** Bookings held today on its clock, and the first one's start. */
  bookings: number;
  firstAt: Date | null;
  /** "Needs a reply": customers whose last word nobody on the team has answered. */
  waiting: number;
  /** The oldest of those words. */
  waitingSince: Date | null;
  /** Of those, the ones the AI agent answered (its words never move a thread). */
  agentAnswered: number;
  /** The agent's answers waiting for someone on the team to send (M16 G6b). */
  drafts: number;
  /** Questions the agent couldn't answer, still open. */
  unanswered: number;
  /** Orders still open. */
  orders: number;
}

/** The organizations someone runs (`MANAGING_ROLES`), open ones, by name. */
export async function orgsRunBy(ctx: AppContext, userId: string): Promise<RunOrg[]> {
  const rows = await ctx.db
    .selectFrom('org_members as m')
    .innerJoin('organizations as o', 'o.id', 'm.org_id')
    .select(['o.id', 'o.name', 'o.handle', 'o.time_zone', 'o.country'])
    .where('m.user_id', '=', userId)
    .where('m.left_at', 'is', null)
    .where('m.role', 'in', [...MANAGING_ROLES])
    .where('o.archived_at', 'is', null)
    .orderBy('o.name')
    .limit(ORGS_READ)
    .execute();
  return rows.map((o) => ({
    id: o.id,
    name: o.name,
    handle: o.handle,
    zone: o.time_zone || defaultZoneOf(o.country),
  }));
}

/**
 * Which of the organizations someone runs a question names: its name or its handle as typed
 * ("nile dental", "@nile.dental", or the name's first words: "nile"), else none. Folded as the
 * rules fold what's typed.
 */
export function orgNamed(orgs: RunOrg[], name: string): RunOrg[] {
  const asked = foldForIntent(name).replace(/^@/, '').trim();
  if (!asked) return [];
  const exact = orgs.filter(
    (o) => foldForIntent(o.name) === asked || foldForIntent(o.handle) === asked,
  );
  if (exact.length) return exact;
  return orgs.filter((o) => {
    const words = foldForIntent(o.name).split(/\s+/);
    const said = asked.split(/\s+/);
    return said.length <= words.length && said.every((w, i) => words[i] === w);
  });
}

/** Today, from its midnight to the next, on a clock. */
function today(now: Date, zone: string): { from: Date; to: Date } {
  try {
    const p = zonedParts(now, zone);
    const day = { year: p.year, month: p.month, day: p.day, hour: 0, minute: 0 };
    return { from: zonedTimeToUtc(day, zone), to: zonedTimeToUtc(addDays(day, 1), zone) };
  } catch {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { from, to: new Date(from.getTime() + 86_400_000) };
  }
}

/** Each organization's day, read for all of them at once. */
export async function orgDays(ctx: AppContext, orgs: RunOrg[], now: Date): Promise<OrgDay[]> {
  if (!orgs.length) return [];
  const ids = orgs.map((o) => o.id);
  const days = orgs.map((o) => ({ ...o, ...today(now, o.zone) }));
  const [threads, bookings, orders, drafts, questions] = await Promise.all([
    // The inbox's "Needs a reply" by its own rule (core `customerWaiting`, open), and of those
    // the ones whose latest the agent dealt with and answered: no hand-over, no draft waiting.
    sql<{ org_id: string; waiting: number; since: Date | null; agent: number }>`
      select t.org_id,
        count(*)::int as waiting,
        min(t.last_customer_at) as since,
        count(*) filter (where t.agent_seq >= t.last_customer_seq
          and t.agent_handed_over_at is null
          and not exists (select 1 from agent_drafts d
            where d.conversation_id = t.conversation_id and ${STANDING_DRAFT}))::int as agent
      from business_threads t
      where t.org_id in (${sql.join(ids)})
        and t.resolved_at is null and t.last_customer_seq > t.last_team_seq
      group by t.org_id`.execute(ctx.db),
    sql<{ org_id: string; n: number; first_at: Date | null }>`
      select t.org_id, count(*)::int as n, min(m.card_start_at) as first_at
      from messages m
      join business_threads t on t.conversation_id = m.conversation_id
      join (values ${sql.join(
        days.map((d) => sql`(${d.id}::uuid, ${d.from}::timestamptz, ${d.to}::timestamptz)`),
      )}) as w(org_id, from_at, to_at) on w.org_id = t.org_id
      where m.kind = 'kit' and m.deleted_at is null and t.erased_at is null
        and m.payload->>'kit' = 'appointment'
        and m.payload->>'state' in (${sql.join([...HELD_APPOINTMENT_STATES])})
        and m.card_start_at >= w.from_at and m.card_start_at < w.to_at
      group by t.org_id`.execute(ctx.db),
    sql<{ org_id: string; n: number }>`
      select t.org_id, count(*)::int as n
      from messages m
      join business_threads t on t.conversation_id = m.conversation_id
      where t.org_id in (${sql.join(ids)}) and m.kind = 'kit' and m.deleted_at is null
        and t.erased_at is null and m.payload->>'kit' = 'order_status'
        and m.payload->>'state' in (${sql.join([...OPEN_ORDER_STATES])})
      group by t.org_id`.execute(ctx.db),
    sql<{ org_id: string; n: number }>`
      select t.org_id, count(*)::int as n
      from agent_drafts d
      join business_threads t on t.conversation_id = d.conversation_id
      where t.org_id in (${sql.join(ids)}) and ${STANDING_DRAFT}
      group by t.org_id`.execute(ctx.db),
    ctx.db
      .selectFrom('agent_questions')
      .select(['org_id', sql<number>`count(*)::int`.as('n')])
      .where('org_id', 'in', ids)
      .where('done_at', 'is', null)
      .groupBy('org_id')
      .execute(),
  ]);
  const of = <T extends { org_id: string }>(rows: T[], id: string) =>
    rows.find((r) => r.org_id === id);
  return orgs.map((o) => {
    const t = of(threads.rows, o.id);
    const b = of(bookings.rows, o.id);
    return {
      ...o,
      bookings: b?.n ?? 0,
      firstAt: b?.first_at ? new Date(b.first_at) : null,
      waiting: t?.waiting ?? 0,
      waitingSince: t?.since ? new Date(t.since) : null,
      agentAnswered: t?.agent ?? 0,
      drafts: of(drafts.rows, o.id)?.n ?? 0,
      unanswered: of(questions, o.id)?.n ?? 0,
      orders: of(orders.rows, o.id)?.n ?? 0,
    };
  });
}

/** Whether anything needs the team. */
export const anythingToday = (d: OrgDay) =>
  d.bookings + d.waiting + d.drafts + d.unanswered + d.orders > 0;

/**
 * The day's lines for one organization, in the reader's language and in what to do: bookings on
 * the organization's clock, how long someone has waited on the reader's.
 */
export function orgDayLines(
  d: OrgDay,
  now: Date,
  reader: { zone: string; locale: string },
): string[] {
  const locale = safeLocale(reader.locale);
  const lines: Array<string | null> = [
    d.waiting
      ? trn(
          d.waiting,
          '• One customer waiting for a reply, since {when}',
          '• {n} customers waiting for a reply, the longest since {when}',
          {
            when: d.waitingSince
              ? formatWhenAt(d.waitingSince.toISOString(), true, now, reader.zone, locale)
              : '',
          },
        )
      : null,
    d.agentAnswered
      ? d.agentAnswered === d.waiting
        ? trn(
            d.agentAnswered,
            '• The AI agent answered it; nobody on the team has yet',
            '• The AI agent answered all {n}; nobody on the team has yet',
          )
        : trn(
            d.agentAnswered,
            '• The AI agent answered one of them; nobody on the team has yet',
            '• The AI agent answered {n} of them; nobody on the team has yet',
          )
      : null,
    d.drafts
      ? trn(
          d.drafts,
          '• One answer the AI agent wrote is waiting for you to send',
          '• {n} answers the AI agent wrote are waiting for you to send',
        )
      : null,
    d.unanswered
      ? trn(
          d.unanswered,
          '• One question the AI agent couldn’t answer: teach it in its setup',
          '• {n} questions the AI agent couldn’t answer: teach it in its setup',
        )
      : null,
    d.bookings
      ? trn(
          d.bookings,
          '• One booking today, at {time}',
          '• {n} bookings today, the first at {time}',
          {
            time: d.firstAt ? formatClock(d.firstAt.toISOString(), d.zone, locale) : '',
          },
        )
      : null,
    d.orders ? trn(d.orders, '• One order still open', '• {n} orders still open') : null,
  ];
  return lines.filter((l): l is string => l !== null);
}

/** Where its inbox opens, on "Needs a reply". */
export const inboxLink = (ctx: AppContext, d: RunOrg) =>
  `${ctx.config.PUBLIC_URL}/o/${d.handle}/inbox`;

/**
 * What Cai says of an organization's day: its lines under its name, ending at its inbox, or that
 * nothing needs the team.
 */
export function orgDayText(
  ctx: AppContext,
  d: OrgDay,
  now: Date,
  reader: { zone: string; locale: string },
): string {
  const lines = orgDayLines(d, now, reader);
  return lines.length
    ? [
        tr('At {org} today:', { org: d.name }),
        ...lines,
        tr('Its inbox: {link}', { link: inboxLink(ctx, d) }),
      ].join('\n')
    : tr('Nothing needs the team at {org} today.', { org: d.name });
}
