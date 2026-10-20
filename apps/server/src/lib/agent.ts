/**
 * An organization's AI agent at work (PRD §74–75). A customer writing queues it; a moment later,
 * so a burst of messages is answered once, it reads the conversation and what the organization
 * told it, and answers, hands the conversation to the team, or closes it once the customer is
 * done. It is its own member of the team (a users row of kind 'agent'), so everything it writes
 * says "AI agent", and like any app's bot it never takes a conversation or counts as the team's
 * answer (R16).
 *
 * It stays out of a conversation a person on the team has taken, one it handed over (until
 * that's resolved), one that's escalated or private (R18), and anyone under 18; it deals with
 * each customer message once, answers at most AGENT_REPLIES_PER_CONVERSATION times in a
 * conversation a day and thinks at most AGENT_CALLS_PER_CONVERSATION times (answered or not),
 * and stops for the day at what the plan includes. Whenever it stays out, the team answers as
 * it would without one.
 *
 * Its first message in a conversation opens with its introduction (R87), written by the rules
 * rather than the model so it always says who it is, that it's an AI and whom it answers for, in
 * the language the customer wrote in: "Hi Paola, I'm Nour, the AI assistant for Nile Dental."
 *
 * What it may do is the organization's to say (M16 G6a): offer and book times, take orders, and
 * answer always or only while its hours say it's closed. Each answer keeps the passages of what it
 * was told that it rests on (`payload.cited`, the team's alone: the customer never sees them), and
 * every call keeps the version of its instructions (`ai_runs.prompt_hash`), so the team can say
 * why it said what it said, and which instructions said it.
 *
 * Its organization may have it draft rather than send (M16 G6b, `org_agents.review`): its
 * answer, booking, order or close waits for someone on the team to send it as it is, take it into
 * their own reply, or let it go, and nothing it wrote reaches the customer before (handing over,
 * it tells the team alone). What it couldn't answer from what it was told is kept for its owner
 * and admins, the customer's message by reference (`agent_questions`).
 */
import {
  AGENT_CALLS_PER_CONVERSATION,
  AGENT_REPLIES_PER_CONVERSATION,
  type AgentCitation,
  type AgentDraftAction,
  type AgentWhen,
  type BookingHours,
  CITATION_CHARS,
  isBooked,
  isOrdered,
  knowledgePassages,
  ORG_ALLOWANCES,
  openAt,
  orderableMax,
  tr,
  truncate,
  uuidv7,
  writtenIn,
} from '@caime/core';
import { firstName } from '@caime/core/format';
import type { InterfaceLanguage } from '@caime/core/i18n';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { AgentDraft } from './agent-drafts';
import { type AgentReply, AiError, type AiUsage, PROMPT_VERSIONS } from './ai';
import { emitWebhook } from './apps';
import { catalogLines, itemsFor, menuLines, openSlotsFor, orgHost, slotLine } from './booking';
import { onCustomerMessage, publishThread, teamOf, threadViews } from './business';
import { AppError, notFound } from './errors';
import { recordEvent } from './events';
import { inLanguage, languageOf } from './i18n';
import { enqueue, registerJob } from './jobs';
import { readableBy } from './messages';
import { notify } from './notify';
import { bookablePlaceLines } from './places';
import { agentRepliesToday, agentSpent } from './plans';
import { postAs } from './post-as';
import { stockFor, withStock } from './stock';
import { transcriptText, wordsFor } from './transcript';
import { minorOf } from './users';

/** How long it waits after a customer writes, so a message sent in three parts is read whole. */
export const AGENT_DELAY_MS = 3000;
const TRANSCRIPT_MESSAGES = 20;
/** Each message's words, at most: a customer's long letter is read, not all of a pasted file. */
const MESSAGE_CHARS = 1500;
/** How far ahead, and how many, of the open slots the agent may offer (R51). */
const AGENT_SLOT_DAYS = 14;
const AGENT_SLOTS = 8;
const DAY_MS = 86_400_000;

/** The organization's agent, if it's on: its user, its name and what it knows. */
export async function activeAgent(ctx: Pick<AppContext, 'db'>, orgId: string) {
  return ctx.db
    .selectFrom('org_agents as a')
    .innerJoin('users as u', 'u.id', 'a.bot_user_id')
    .select([
      'a.org_id',
      'a.bot_user_id',
      'a.knowledge',
      'a.may_book',
      'a.may_order',
      'a.answers_when',
      'a.review',
      'u.display_name as name',
    ])
    .where('a.org_id', '=', orgId)
    .where('a.paused_at', 'is', null)
    .executeTakeFirst();
}

/**
 * Whether it answers now (M16 G6a): always, or, where it answers only while the organization is
 * closed, while its hours say so. Without hours nothing says it's open, so it answers. The
 * automatic replies read the same rule: while it's quiet, they greet.
 */
export function agentAnswersNow(
  answersWhen: AgentWhen,
  hours: BookingHours | null,
  now: Date,
): boolean {
  return answersWhen === 'always' || !hours || !openAt(hours, now);
}

/** Why it handed a conversation to the team, as `caime_agent_actions_total` counts it. */
export type HandOverReason = 'unknown' | 'person' | 'limit' | 'refused' | 'none';

/** The passages of what it was told that an answer rests on, as the team reads them under it. */
export function citationsOf(knowledge: string, sources: readonly number[]): AgentCitation[] {
  const passages = knowledgePassages(knowledge);
  return sources.flatMap((n) => {
    const text = passages[n - 1];
    return text ? [{ n, text: truncate(text, CITATION_CHARS) }] : [];
  });
}

/** A customer wrote: the agent looks at it in a moment, once. */
export async function queueAgent(
  ctx: AppContext,
  orgId: string,
  conversationId: string,
  seq: number,
): Promise<void> {
  if (!ctx.ai || !(await activeAgent(ctx, orgId))) return;
  await enqueue(
    ctx,
    'agent.reply',
    { conversationId, seq },
    {
      runAt: new Date(ctx.now().getTime() + AGENT_DELAY_MS),
      dedupeKey: `agent:${conversationId}:${seq}`,
      maxAttempts: 2,
    },
  );
}

/** One model call for the agent, recorded in `ai_runs` as every AI call is (never the text). */
async function recordRun(
  ctx: AppContext,
  feature: 'agent' | 'agent_try',
  userId: string,
  conversationId: string | null,
  started: number,
  outcome: string,
  usage: AiUsage | null,
): Promise<string> {
  ctx.metrics.ai.inc({ feature, outcome });
  ctx.metrics.aiSeconds.observe({ feature }, (Date.now() - started) / 1000);
  if (usage) {
    ctx.metrics.aiTokens.inc({ feature, direction: 'input' }, usage.inputTokens);
    ctx.metrics.aiTokens.inc({ feature, direction: 'output' }, usage.outputTokens);
    // Its knowledge is a cached prefix (lib/ai.ts): what was read from the cache and written to
    // it is what it cost (M16 H7), as every other call keeps.
    if (usage.cacheReadTokens)
      ctx.metrics.aiTokens.inc({ feature, direction: 'cache_read' }, usage.cacheReadTokens);
    if (usage.cacheCreationTokens)
      ctx.metrics.aiTokens.inc({ feature, direction: 'cache_creation' }, usage.cacheCreationTokens);
  }
  const id = uuidv7();
  await ctx.db
    .insertInto('ai_runs')
    .values({
      id,
      user_id: userId,
      conversation_id: conversationId,
      feature,
      provider: 'anthropic',
      model: usage?.model ?? ctx.ai?.model ?? null,
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
      cache_read_tokens: usage?.cacheReadTokens ?? null,
      cache_creation_tokens: usage?.cacheCreationTokens ?? null,
      latency_ms: Date.now() - started,
      outcome,
      prompt_hash: PROMPT_VERSIONS[feature] ?? null,
      created_at: ctx.now(),
    })
    .execute();
  return id;
}

/** An answer it thought of but never sent: no plan counts it, though the call still happened. */
const discard = (ctx: AppContext, runId: string) =>
  ctx.db.updateTable('ai_runs').set({ discarded_at: ctx.now() }).where('id', '=', runId).execute();

/**
 * Ask the model, as the agent. Failing, it says nothing and the team answers; `null` then. The
 * run is recorded either way, against the conversation it's for, and counts against the plan
 * only when what it answered is sent (an answer thrown away is marked so: `discard`).
 */
export async function askAgent(
  ctx: AppContext,
  feature: 'agent' | 'agent_try',
  runBy: string,
  input: Parameters<NonNullable<AppContext['ai']>['supportAgent']>[0],
  conversationId: string | null = null,
): Promise<(AgentReply & { runId: string }) | null> {
  const ai = ctx.ai;
  if (!ai) return null;
  const started = Date.now();
  try {
    const r = await ai.supportAgent(input);
    const runId = await recordRun(ctx, feature, runBy, conversationId, started, 'ok', r.usage);
    return { ...r.value, runId };
  } catch (err) {
    const reason = err instanceof AiError ? err.reason : 'error';
    await recordRun(
      ctx,
      feature,
      runBy,
      conversationId,
      started,
      reason,
      err instanceof AiError ? err.usage : null,
    );
    ctx.log.warn({ feature, reason, detail: (err as Error).message }, 'ai agent failed');
    return null;
  }
}

/**
 * The conversation as the agent reads it: who wrote, never their name, oldest first; its own
 * introduction left out (it names the customer).
 */
async function transcriptFor(
  ctx: AppContext,
  conversationId: string,
  customerId: string,
  agentId: string,
) {
  const rows = await ctx.db
    .selectFrom('messages as m')
    .leftJoin('users as u', 'u.id', 'm.sender_id')
    .select([
      'm.seq',
      'm.sender_id',
      'm.kind',
      'm.body',
      'm.payload',
      'm.deleted_at',
      'u.kind as sender_kind',
    ])
    .where('m.conversation_id', '=', conversationId)
    .where('m.kind', '<>', 'system')
    // There for everyone and not past its time (`readableBy`; nothing is hidden for an agent).
    .where(readableBy(agentId, ctx.now(), 'm'))
    .orderBy('m.seq', 'desc')
    .limit(TRANSCRIPT_MESSAGES)
    .execute();
  // Its introduction, the first line of its first message, names the customer: never shown to
  // the model (R87).
  const opens = (m: (typeof rows)[number]) =>
    m.sender_id === agentId &&
    (m.payload as { introduction?: unknown } | null)?.introduction === true;
  const lines = rows.reverse().map((m) => ({
    who:
      m.sender_id === customerId
        ? 'Customer'
        : m.sender_id === agentId
          ? 'You'
          : m.sender_kind === 'human'
            ? 'Team'
            : 'Automated',
    words: wordsFor(
      opens(m) ? { ...m, body: (m.body ?? '').split('\n').slice(1).join('\n') } : m,
      MESSAGE_CHARS,
    ),
  }));
  return {
    text: transcriptText(lines),
    introduced: lines.some((l) => l.who === 'You'),
  };
}

/**
 * "Friday 26 September 2026" where the customer is, for the model to know what "today" and
 * "tomorrow" mean to them. Built from its parts, so it reads the same on every ICU version.
 */
export function todayForAgent(now: Date, timeZone = 'UTC'): string {
  const day = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: zone,
    }).formatToParts(now);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`;
  };
  try {
    return day(timeZone);
  } catch {
    return day('UTC');
  }
}

/**
 * How it opens its first message in a conversation (R87): its name, that it's an AI, and the
 * organization it answers for, greeting the customer by their first name when it has one. In the
 * scope's language: the caller picks it (`customerLanguage`).
 */
export function introduction(agentName: string, orgName: string, customerName: string | null) {
  const name = customerName ? firstName(customerName) : '';
  return name
    ? tr('Hi {name}, I’m {agent}, the AI assistant for {org}.', {
        name,
        agent: agentName,
        org: orgName,
      })
    : tr('Hello, I’m {agent}, the AI assistant for {org}.', { agent: agentName, org: orgName });
}

/** The language a customer is answered in: the one their message is written in, else theirs. */
async function customerLanguage(
  ctx: AppContext,
  customerId: string,
  text: string | null | undefined,
): Promise<InterfaceLanguage> {
  return writtenIn(text ?? '') ?? (await languageOf(ctx, customerId));
}

/** The thread moved without a person: the team hears it, and so do the organization's apps. */
async function threadMoved(
  ctx: AppContext,
  conversationId: string,
  agentId: string,
  change: string,
) {
  const thread = await ctx.db
    .selectFrom('business_threads')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .executeTakeFirstOrThrow();
  await recordEvent(ctx.db, 'business.thread_updated', agentId, {
    conversationId,
    orgId: thread.org_id,
    change,
  });
  await publishThread(ctx, thread.org_id, conversationId);
  const [view] = await threadViews(ctx, agentId, [thread]);
  await emitWebhook(ctx, thread.org_id, 'business.thread', {
    conversationId,
    change,
    state: view!.state,
    assignee: view!.assignee,
    by: 'ai_agent',
  });
}

/**
 * The people on the team hear that a conversation needs one of them now: handed to them, or a
 * draft of its answer waits for one of them to check (M16 G6b).
 */
async function tellTeam(
  ctx: AppContext,
  orgId: string,
  conversationId: string,
  agentName: string,
  why: 'handed' | 'drafted' = 'handed',
) {
  const [people, about] = await Promise.all([
    ctx.db
      .selectFrom('org_members as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .select('m.user_id')
      .where('m.org_id', '=', orgId)
      .where('m.left_at', 'is', null)
      .where('u.kind', '=', 'human')
      .execute(),
    ctx.db
      .selectFrom('business_threads as t')
      .innerJoin('organizations as o', 'o.id', 't.org_id')
      .leftJoin('users as c', 'c.id', 't.customer_id')
      .select(['o.name as org_name', 'c.display_name as customer_name'])
      .where('t.conversation_id', '=', conversationId)
      .executeTakeFirstOrThrow(),
  ]);
  for (const p of people)
    await notify(ctx, {
      userId: p.user_id,
      kind: 'business',
      level: 'attention',
      title: () =>
        why === 'drafted'
          ? tr('{agentName} drafted an answer for you to check', { agentName })
          : tr('{agentName} handed a conversation to the team', { agentName }),
      body: () => `${about.customer_name ?? tr('A customer')} · ${about.org_name}`,
      data: { conversationId, orgId },
      groupKey: `conv:${conversationId}`,
    });
}

/**
 * Handed over: it stays out until the conversation is resolved, and the team is told. What it
 * didn't know (`unknown`) is kept for its owner and admins (M16 G6b): the customer's message
 * `seq`, by reference, once.
 */
async function handOver(
  ctx: AppContext,
  orgId: string,
  conversationId: string,
  agent: { bot_user_id: string; name: string },
  reason: HandOverReason,
  seq: number | null = null,
) {
  ctx.metrics.agentActions.inc({ action: 'hand_over', reason });
  await ctx.db
    .updateTable('business_threads')
    .set({ agent_handed_over_at: ctx.now(), updated_at: ctx.now() })
    .where('conversation_id', '=', conversationId)
    .execute();
  if (reason === 'unknown' && seq !== null)
    await sql`
      insert into agent_questions (id, org_id, conversation_id, message_id, created_at)
      select ${uuidv7()}, ${orgId}, ${conversationId}, m.id, ${ctx.now()}
      from messages m where m.conversation_id = ${conversationId} and m.seq = ${String(seq)}
      on conflict (message_id) do nothing`.execute(ctx.db);
  await threadMoved(ctx, conversationId, agent.bot_user_id, 'handed_over');
  await tellTeam(ctx, orgId, conversationId, agent.name);
}

/**
 * Nobody on the team is in the conversation now: nobody has it, or the customer wrote to it
 * resolved (a new question) and whoever had it hasn't written since. They keep it either way.
 */
function noPersonOnIt(alias: 't' | null) {
  const col = (c: string) => sql.ref(alias ? `${alias}.${c}` : c);
  return sql<boolean>`(${col('assignee_id')} is null or (${col('reopened_at')} is not null and coalesce(${col('last_team_at')}, '-infinity') < ${col('reopened_at')}))`;
}

/** The job: look at the customer's message `seq` and do what the agent decides. */
export async function agentReply(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const conversationId = String(payload.conversationId);
  const seq = Number(payload.seq);
  const thread = await ctx.db
    .selectFrom('business_threads as t')
    .innerJoin('conversations as c', 'c.id', 't.conversation_id')
    .innerJoin('organizations as o', 'o.id', 't.org_id')
    .select([
      't.org_id',
      't.customer_id',
      't.agent_seq',
      'c.privacy_class',
      'o.name as org_name',
      'o.country as org_country',
      'o.plan',
      'o.archived_at',
      'o.suspended_at',
      'o.booking',
      'o.booking_items',
      'o.ordering',
      'o.collections',
    ])
    .where('t.conversation_id', '=', conversationId)
    // Still its to answer: the customer's latest, nobody on the team answering, not handed over.
    .where('t.last_customer_seq', '=', String(seq))
    .where('t.last_team_seq', '<', String(seq))
    .where('t.agent_seq', '<', String(seq))
    .where(noPersonOnIt('t'))
    .where('t.escalated_at', 'is', null)
    .where('t.resolved_at', 'is', null)
    .where('t.agent_handed_over_at', 'is', null)
    .executeTakeFirst();
  // A closed or suspended organization's agent says nothing (R42, M16 B3).
  if (
    !thread?.customer_id ||
    thread.archived_at ||
    thread.suspended_at ||
    thread.privacy_class === 'private'
  )
    return;
  const agent = await activeAgent(ctx, thread.org_id);
  if (!agent) return;
  // Only while the organization is closed, where it said so (M16 G6a): open, its team answers.
  if (!agentAnswersNow(agent.answers_when, thread.booking, ctx.now())) return;
  const customer = await ctx.db
    .selectFrom('users')
    .select(['birth_date', 'time_zone', 'age_minor_until', 'locale', 'display_name'])
    .where('id', '=', thread.customer_id)
    .executeTakeFirst();
  // A person answers anyone under 18 (R29).
  if (!customer || minorOf(customer, ctx.now())) return;
  // Past the day's answers, or what a day of them may cost (M16 G9), the team answers.
  if (
    (await agentRepliesToday(ctx, thread.org_id)) >=
      ORG_ALLOWANCES[thread.plan].agentRepliesPerDay ||
    (await agentSpent(ctx, thread.org_id, thread.plan)).roomAt
  )
    return;

  // Deal with this message once, whatever happens next.
  const claim = () =>
    ctx.db
      .updateTable('business_threads')
      .set({ agent_seq: String(seq) })
      .where('conversation_id', '=', conversationId)
      .where('agent_seq', '<', String(seq))
      .where('last_customer_seq', '=', String(seq))
      .where('last_team_seq', '<', String(seq))
      .where(noPersonOnIt(null))
      .where('escalated_at', 'is', null)
      .where('resolved_at', 'is', null)
      .where('agent_handed_over_at', 'is', null)
      .returning('conversation_id')
      .executeTakeFirst();

  // The customer's message it's answering, for the language it answers in.
  const latestBody = async () =>
    (
      await ctx.db
        .selectFrom('messages')
        .select('body')
        .where('conversation_id', '=', conversationId)
        .where('seq', '=', String(seq))
        .executeTakeFirst()
    )?.body;

  // A long conversation is a person's to finish: after so many answers, or so many calls to
  // the model however they ended (a customer writing while it thinks throws its answer away).
  const dayAgo = new Date(ctx.now().getTime() - DAY_MS);
  const [answered, thought] = await Promise.all([
    ctx.db
      .selectFrom('messages')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('conversation_id', '=', conversationId)
      .where('sender_id', '=', agent.bot_user_id)
      .where('created_at', '>', dayAgo)
      .executeTakeFirstOrThrow(),
    ctx.db
      .selectFrom('ai_runs')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('conversation_id', '=', conversationId)
      .where('feature', '=', 'agent')
      .where('created_at', '>', dayAgo)
      .executeTakeFirstOrThrow(),
  ]);
  if (answered.n >= AGENT_REPLIES_PER_CONVERSATION || thought.n >= AGENT_CALLS_PER_CONVERSATION) {
    if (!(await claim())) return;
    // Said without the model, so the customer isn't left wondering who answers now: in the
    // language they write in, else theirs.
    const language = await customerLanguage(ctx, thread.customer_id, await latestBody());
    const passed = inLanguage(language, () =>
      tr('I’ve passed this to the team at {org}. Someone will answer here.', {
        org: thread.org_name,
      }),
    );
    await postAs(ctx, agent.bot_user_id, conversationId, passed).catch((err) =>
      ctx.log.warn({ err, conversationId }, 'ai agent could not post'),
    );
    await handOver(ctx, thread.org_id, conversationId, agent, 'limit');
    return;
  }

  const transcript = await transcriptFor(
    ctx,
    conversationId,
    thread.customer_id,
    agent.bot_user_id,
  );
  const offer = await offerFor(ctx, thread, agent, !minorOf(customer, ctx.now()));
  const { items, menu, open } = offer;
  const slots = open
    ? open.slots.map((d) => `${d.toISOString()} · ${slotLine(d, open.hours.timeZone)}`).join('\n')
    : null;
  const catalog = catalogLines(
    items,
    items.some((i) => i.placeId) ? await bookablePlaceLines(ctx, offer.host) : undefined,
  );
  const reply = await askAgent(
    ctx,
    'agent',
    agent.bot_user_id,
    {
      tier: ORG_ALLOWANCES[thread.plan].agentModel,
      orgName: thread.org_name,
      agentName: agent.name,
      country: thread.org_country,
      knowledge: agent.knowledge,
      conversation: transcript.text,
      introduced: transcript.introduced,
      today: todayForAgent(ctx.now(), customer.time_zone),
      slots: slots || null,
      catalog,
      menu,
    },
    conversationId,
  );
  if (!reply) return;
  // The conversation moved on while it thought (they wrote again, a person answered): the
  // answer goes nowhere, and the next message, if any, is looked at on its own.
  if (!(await claim())) {
    await discard(ctx, reply.runId);
    return;
  }
  // What its answer rests on, for the team to read under it (M16 G6a).
  const cited = citationsOf(agent.knowledge, reply.sources);
  // Its first message here opens with who it is, by the rules (R87): a line of its own, which
  // the model never reads back, since it names the customer.
  const body = transcript.introduced
    ? reply.message
    : `${inLanguage(await customerLanguage(ctx, thread.customer_id, await latestBody()), () =>
        introduction(agent.name, thread.org_name, customer.display_name),
      )}\n${reply.message}`;
  // Its team checks it first (M16 G6b): nothing it wrote reaches the customer before; handing
  // over, it tells the team alone, since a person answers from here anyway.
  if (agent.review) {
    if (reply.action === 'hand_over') {
      await discard(ctx, reply.runId);
      await handOver(ctx, thread.org_id, conversationId, agent, reply.reason ?? 'none', seq);
      return;
    }
    await writeDraft(ctx, {
      orgId: thread.org_id,
      conversationId,
      seq,
      agent,
      action: reply.action,
      body,
      reply,
      cited,
      introduction: !transcript.introduced,
      offer,
    });
    return;
  }
  try {
    const marks = {
      ...(transcript.introduced ? {} : { introduction: true }),
      ...(cited.length ? { cited } : {}),
    };
    const marked = Object.keys(marks).length > 0;
    await postAs(
      ctx,
      agent.bot_user_id,
      conversationId,
      marked ? { kind: 'text', body, payload: marks } : body,
      { serverPayload: marked },
    );
  } catch (err) {
    // The customer blocked the organization, or it closed: nobody writes there now.
    ctx.log.warn({ err, conversationId }, 'ai agent could not post');
    await discard(ctx, reply.runId);
    return;
  }
  await carryOut(ctx, thread.org_id, conversationId, seq, agent, reply, offer);
}

/**
 * What it may offer a customer now, as they'd see it: the items they may book or order, the next
 * open times (R51) and the menu (R60), within what its organization lets it do (M16 G6a).
 */
async function offerFor(
  ctx: AppContext,
  org: {
    org_id: string;
    booking: unknown;
    booking_items: unknown;
    ordering: unknown;
    collections: unknown;
  },
  agent: { may_book: boolean; may_order: boolean },
  adult: boolean,
) {
  const host = orgHost({
    id: org.org_id,
    booking: org.booking,
    booking_items: org.booking_items,
    ordering: org.ordering,
    collections: org.collections,
  });
  // With a catalog (R58), the items this customer may book.
  const items = itemsFor(host, { isConnected: true, spheres: [], adult });
  // What this customer may order (R60), as they'd see it: a count only where it limits them, so
  // the agent knows no more of the stock than the customer would. Only where the organization
  // lets it take orders (M16 G6a); else it hands an order over.
  const takesOrders = host.ordering !== null && agent.may_order;
  const orderable = takesOrders
    ? withStock(items.filter(isOrdered), await stockFor(ctx.db, host.id, items), false)
    : [];
  const menuText = menuLines(orderable);
  const menu =
    host.ordering && takesOrders && menuText
      ? { lines: menuText, ways: host.ordering.fulfilment }
      : null;
  // The next open times of the first item it may book, where it may book: else it hands a
  // booking over.
  const open = agent.may_book
    ? await openSlotsFor(
        ctx,
        host,
        { from: ctx.now(), to: new Date(ctx.now().getTime() + AGENT_SLOT_DAYS * DAY_MS) },
        { item: items.find(isBooked) ?? null, limit: AGENT_SLOTS },
      )
    : null;
  return { host, items, orderable, menu, open };
}
type Offer = Awaited<ReturnType<typeof offerFor>>;

/** What it decided beyond its words: a time, an order, a close, or the team. */
type Plan = Pick<
  AgentReply,
  'action' | 'bookAt' | 'bookFor' | 'bookItem' | 'orderLines' | 'orderWay' | 'reason'
>;

/** From the catalog, the item it named, else the one whose times it offered. */
const bookedItem = (offer: Offer, plan: Plan) =>
  offer.items.find((i) => i.id === plan.bookItem && isBooked(i)) ??
  offer.items.find(isBooked) ??
  null;
/** The card's title: the item's name, else what the customer said it's for. */
const bookingTitle = (item: ReturnType<typeof bookedItem>, plan: Plan) =>
  item && !item.askTopic ? item.name : plan.bookFor || item?.name || 'Appointment';
/** How an order goes: as asked, else the one way there is. */
const orderWayOf = (offer: Offer, plan: Plan) =>
  plan.orderWay ?? (offer.menu?.ways.length === 1 ? (offer.menu.ways[0] ?? null) : null);

/**
 * Carries out what it decided once its words are in, as it would itself or once its team sent
 * its draft (M16 G6b): books one of the times it offered, writes an order down, closes the
 * conversation, or hands it to the team.
 */
async function carryOut(
  ctx: AppContext,
  orgId: string,
  conversationId: string,
  seq: number,
  agent: { bot_user_id: string; name: string },
  plan: Plan,
  offer: Offer,
) {
  // Booked (R51): one of the slots it offered, still open, becomes an appointment card from the
  // organization, which the customer confirms; the team sees it under Bookings meanwhile.
  if (plan.action === 'book') {
    const at = plan.bookAt ? new Date(plan.bookAt) : null;
    const stillOpen =
      at &&
      !Number.isNaN(at.getTime()) &&
      offer.open?.slots.some((d) => d.getTime() === at.getTime());
    // The server checks the slot for that item as for any booking, and a refusal hands over.
    const item = bookedItem(offer, plan);
    let booked = false;
    if (stillOpen && at) {
      booked = await postAs(ctx, agent.bot_user_id, conversationId, {
        kind: 'kit',
        payload: {
          kit: 'appointment',
          fields: {
            title: bookingTitle(item, plan),
            start: { at: at.toISOString(), hasTime: true },
          },
          ...(item ? { booking: { itemId: item.id, quantity: 1 } } : {}),
        },
      })
        .then(() => true)
        .catch((err) => {
          ctx.log.warn({ err, conversationId }, 'ai agent could not book');
          return false;
        });
    }
    if (booked) ctx.metrics.agentActions.inc({ action: 'book', reason: 'none' });
    // Not a slot it was given, or taken meanwhile: a person books it.
    else await handOver(ctx, orgId, conversationId, agent, 'refused');
  }
  // Ordered (R60): what the customer said they want from the menu becomes an Order card from the
  // organization, checked against its catalog and stock as anyone's is; the team confirms it.
  // Anything not on the menu, sold out, or a way not chosen where there are two: a person takes it.
  if (plan.action === 'order') {
    const onMenu = new Set(offer.orderable.filter((i) => orderableMax(i) > 0).map((i) => i.id));
    const lines = plan.orderLines ?? [];
    const way = orderWayOf(offer, plan);
    let ordered = false;
    if (offer.menu && lines.length && lines.every((l) => onMenu.has(l.itemId)) && way) {
      ordered = await postAs(ctx, agent.bot_user_id, conversationId, {
        kind: 'kit',
        payload: { kit: 'order_status', fields: {}, order: { lines, fulfilment: way } },
      })
        .then(() => true)
        .catch((err) => {
          ctx.log.warn({ err, conversationId }, 'ai agent could not order');
          return false;
        });
    }
    if (ordered) ctx.metrics.agentActions.inc({ action: 'order', reason: 'none' });
    else await handOver(ctx, orgId, conversationId, agent, 'refused');
  }
  if (plan.action === 'answer') ctx.metrics.agentActions.inc({ action: 'answer', reason: 'none' });
  if (plan.action === 'hand_over')
    await handOver(ctx, orgId, conversationId, agent, plan.reason ?? 'none', seq);
  if (plan.action === 'resolve') {
    ctx.metrics.agentActions.inc({ action: 'resolve', reason: 'none' });
    await ctx.db
      .updateTable('business_threads')
      .set({ resolved_at: ctx.now(), resolved_by: agent.bot_user_id, updated_at: ctx.now() })
      .where('conversation_id', '=', conversationId)
      .where('resolved_at', 'is', null)
      .execute();
    await threadMoved(ctx, conversationId, agent.bot_user_id, 'resolved');
  }
}

/**
 * Its answer as a draft for its team (M16 G6b): what the customer would read, what it would do
 * and what it rests on, the conversation's one draft (a newer one takes its place). Its run counts
 * against the plan as an answer written, as it costs one, until the draft is let go or replaced
 * (the plan's daily answers bound what drafts cost as they bound answers).
 */
async function writeDraft(
  ctx: AppContext,
  d: {
    orgId: string;
    conversationId: string;
    seq: number;
    agent: { name: string };
    action: AgentDraftAction;
    body: string;
    reply: AgentReply & { runId: string };
    cited: AgentCitation[];
    introduction: boolean;
    offer: Offer;
  },
) {
  const plan = d.reply;
  const at = d.action === 'book' && plan.bookAt ? new Date(plan.bookAt) : null;
  const way = d.action === 'order' ? orderWayOf(d.offer, plan) : null;
  const draft: AgentDraft = {
    message: plan.message,
    introduction: d.introduction,
    cited: d.cited,
    plan: {
      bookAt: plan.bookAt,
      bookFor: plan.bookFor,
      bookItem: plan.bookItem,
      orderLines: plan.orderLines,
      orderWay: plan.orderWay,
    },
    // What it would book or order, as the card would say, for the team to read before it does.
    booking:
      at && !Number.isNaN(at.getTime())
        ? { at: at.toISOString(), title: bookingTitle(bookedItem(d.offer, plan), plan) }
        : null,
    order:
      d.action === 'order' && plan.orderLines?.length
        ? {
            lines: plan.orderLines.map((l) => ({
              name: d.offer.items.find((i) => i.id === l.itemId)?.name ?? l.itemId,
              quantity: l.quantity,
            })),
            fulfilment: way,
          }
        : null,
  };
  const row = {
    seq: String(d.seq),
    action: d.action,
    body: d.body,
    draft: JSON.stringify(draft),
    run_id: d.reply.runId,
    created_at: ctx.now(),
  };
  const before = await ctx.db
    .selectFrom('agent_drafts')
    .select('run_id')
    .where('conversation_id', '=', d.conversationId)
    .executeTakeFirst();
  await ctx.db
    .insertInto('agent_drafts')
    .values({ conversation_id: d.conversationId, org_id: d.orgId, ...row })
    .onConflict((oc) => oc.column('conversation_id').doUpdateSet(row))
    .execute();
  // The draft it replaces was never sent: not an answer the plan counts.
  if (before?.run_id && before.run_id !== d.reply.runId) await discard(ctx, before.run_id);
  ctx.metrics.agentDrafts.inc({ outcome: 'drafted' });
  await publishThread(ctx, d.orgId, d.conversationId);
  await tellTeam(ctx, d.orgId, d.conversationId, d.agent.name, 'drafted');
}

/**
 * Someone on its team sends its draft as it is (M16 G6b): its words go as the agent's, with who
 * checked them kept for the team (`payload.checkedBy`, never the customer's), and what it decided
 * is carried out as it would have been, the times and the menu read again now. Only the draft for
 * the customer's latest message while nobody on the team has written since, and once.
 */
export async function sendDraft(
  ctx: AppContext,
  conversationId: string,
  userId: string,
  seq: number,
): Promise<void> {
  const thread = await ctx.db
    .selectFrom('business_threads as t')
    .innerJoin('organizations as o', 'o.id', 't.org_id')
    .select([
      't.org_id',
      't.customer_id',
      't.last_customer_seq',
      't.last_team_seq',
      'o.booking',
      'o.booking_items',
      'o.ordering',
      'o.collections',
    ])
    .where('t.conversation_id', '=', conversationId)
    .executeTakeFirst();
  if (!thread) throw notFound(tr('That conversation'));
  // Taken once: a second send, or a draft replaced meanwhile, finds nothing.
  const taken = await ctx.db
    .deleteFrom('agent_drafts')
    .where('conversation_id', '=', conversationId)
    .where('seq', '=', String(seq))
    .returning(['action', 'body', 'draft', 'run_id'])
    .executeTakeFirst();
  if (!taken)
    throw new AppError(409, 'conflict', tr('That draft was sent, let go or replaced already.'));
  if (Number(thread.last_customer_seq) !== seq || Number(thread.last_team_seq) > seq)
    throw new AppError(
      409,
      'conflict',
      tr('The conversation moved on since that draft: answer it yourself.'),
    );
  const agent = await activeAgent(ctx, thread.org_id);
  if (!agent)
    throw new AppError(409, 'conflict', tr('The AI agent is paused or gone: answer it yourself.'));
  const draft = taken.draft as AgentDraft;
  await postAs(
    ctx,
    agent.bot_user_id,
    conversationId,
    {
      kind: 'text',
      body: taken.body,
      payload: {
        ...(draft.introduction ? { introduction: true } : {}),
        ...(draft.cited.length ? { cited: draft.cited } : {}),
        checkedBy: userId,
      },
    },
    { serverPayload: true },
  );
  ctx.metrics.agentDrafts.inc({ outcome: 'sent' });
  const customer = thread.customer_id
    ? await ctx.db
        .selectFrom('users')
        .select(['birth_date', 'time_zone', 'age_minor_until'])
        .where('id', '=', thread.customer_id)
        .executeTakeFirst()
    : undefined;
  const offer = await offerFor(
    ctx,
    thread,
    agent,
    customer ? !minorOf(customer, ctx.now()) : false,
  );
  await carryOut(
    ctx,
    thread.org_id,
    conversationId,
    seq,
    agent,
    { action: taken.action, reason: null, ...draft.plan },
    offer,
  );
}

/**
 * Lets go of its draft (M16 G6b): someone on its team let it go, or took it into their own reply
 * (`edited`). Never sent, it isn't an answer the plan counts. Null when there was none.
 */
export async function dropDraft(
  ctx: AppContext,
  conversationId: string,
  seq: number,
  edited: boolean,
): Promise<string | null> {
  const gone = await ctx.db
    .deleteFrom('agent_drafts')
    .where('conversation_id', '=', conversationId)
    .where('seq', '=', String(seq))
    .returning(['org_id', 'run_id'])
    .executeTakeFirst();
  if (!gone) return null;
  if (gone.run_id) await discard(ctx, gone.run_id);
  ctx.metrics.agentDrafts.inc({ outcome: edited ? 'edited' : 'dropped' });
  await publishThread(ctx, gone.org_id, conversationId);
  return gone.org_id;
}

/**
 * Its agent removed (M16 G6b): what it drafted and nobody sent goes with it, given back to the
 * plan, and the team's devices stop showing it, in one event for every conversation.
 */
export async function dropDraftsOf(ctx: AppContext, orgId: string): Promise<void> {
  const gone = await ctx.db
    .deleteFrom('agent_drafts')
    .where('org_id', '=', orgId)
    .returning('run_id')
    .execute();
  if (!gone.length) return;
  const runs = gone.flatMap((d) => (d.run_id ? [d.run_id] : []));
  if (runs.length)
    await ctx.db
      .updateTable('ai_runs')
      .set({ discarded_at: ctx.now() })
      .where('id', 'in', runs)
      .execute();
  ctx.metrics.agentDrafts.inc({ outcome: 'dropped' }, gone.length);
  await ctx.bus.publish(await teamOf(ctx.db, orgId), {
    type: 'business.updated',
    data: { orgId, drafts: true },
  });
}

export function registerAgentJob(): void {
  registerJob('agent.reply', agentReply);
  onCustomerMessage(queueAgent);
}
