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
 */
import {
  AGENT_CALLS_PER_CONVERSATION,
  AGENT_REPLIES_PER_CONVERSATION,
  type AgentAction,
  ORG_ALLOWANCES,
  SendMessageBody,
  tr,
  uuidv4,
  uuidv7,
} from '@caime/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { type AgentReply, AiError, type AiUsage } from './ai';
import { emitWebhook } from './apps';
import { openSlotsFor, slotLine } from './booking';
import { onCustomerMessage, publishThread, threadViews } from './business';
import { recordEvent } from './events';
import { enqueue, registerJob } from './jobs';
import { afterMessage } from './message-effects';
import { messagePreview, messageViews, participantsOf, sendMessage } from './messages';
import { notify } from './notify';
import { agentRepliesToday } from './plans';
import { minorOf } from './users';

/** How long it waits after a customer writes, so a message sent in three parts is read whole. */
export const AGENT_DELAY_MS = 3000;
const TRANSCRIPT_MESSAGES = 20;
/** How far ahead, and how many, of the open slots the agent may offer (R51). */
const AGENT_SLOT_DAYS = 14;
const AGENT_SLOTS = 8;
const DAY_MS = 86_400_000;

/** The organization's agent, if it's on: its user, its name and what it knows. */
export async function activeAgent(ctx: Pick<AppContext, 'db'>, orgId: string) {
  return ctx.db
    .selectFrom('org_agents as a')
    .innerJoin('users as u', 'u.id', 'a.bot_user_id')
    .select(['a.org_id', 'a.bot_user_id', 'a.knowledge', 'u.display_name as name'])
    .where('a.org_id', '=', orgId)
    .where('a.paused_at', 'is', null)
    .executeTakeFirst();
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
      latency_ms: Date.now() - started,
      outcome,
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

/** The conversation as the agent reads it: who wrote, never their name, oldest first. */
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
    .where('m.deleted_at', 'is', null)
    .orderBy('m.seq', 'desc')
    .limit(TRANSCRIPT_MESSAGES)
    .execute();
  const lines = rows.reverse().map((m, i) => {
    const who =
      m.sender_id === customerId
        ? 'Customer'
        : m.sender_id === agentId
          ? 'You'
          : m.sender_kind === 'human'
            ? 'Team'
            : 'Automated';
    const text = (m.kind === 'text' ? (m.body ?? '') : messagePreview(m)).replace(/\s+/g, ' ');
    return { who, line: `[${i + 1}] ${who}: ${text.trim()}` };
  });
  return {
    text: lines.map((l) => l.line).join('\n'),
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

/** What it tells the customer when it passes a conversation on without asking the model. */
function passedOn(orgName: string, language: 'ar' | 'fr' | 'en'): string {
  if (language === 'ar') return `حوّلت محادثتك إلى فريق ${orgName}، وسيرد عليك أحدهم هنا.`;
  if (language === 'fr')
    return `J’ai transmis votre demande à l’équipe de ${orgName}. Quelqu’un vous répondra ici.`;
  return `I’ve passed this to the team at ${orgName}. Someone will answer here.`;
}

/** Post as the agent, as any message is: stored, sent live, notified, recorded on the thread. */
async function postAs(
  ctx: AppContext,
  senderId: string,
  conversationId: string,
  what: string | { kind: 'kit'; payload: unknown },
) {
  const result = await sendMessage(
    ctx,
    senderId,
    conversationId,
    SendMessageBody.parse({
      clientId: `agent:${uuidv4()}`,
      ...(typeof what === 'string' ? { body: what } : what),
    }),
  );
  if (!result.created) return;
  const [view] = await messageViews(ctx.db, [result.message], senderId);
  await ctx.bus.publish(
    (await participantsOf(ctx.db, conversationId))
      .map((p) => p.user_id)
      .filter((u) => u !== senderId),
    { type: 'message.created', data: { ...view, clientId: null } },
  );
  const { message, analysis } = result;
  ctx.defer('after-message', () => afterMessage(ctx, message, analysis));
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

/** The people on the team hear that a conversation needs one of them now. */
async function tellTeam(ctx: AppContext, orgId: string, conversationId: string, agentName: string) {
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
      title: () => tr('{agentName} handed a conversation to the team', { agentName }),
      body: () => `${about.customer_name ?? tr('A customer')} · ${about.org_name}`,
      data: { conversationId, orgId },
      groupKey: `conv:${conversationId}`,
    });
}

/** Handed over: it stays out until the conversation is resolved, and the team is told. */
async function handOver(
  ctx: AppContext,
  orgId: string,
  conversationId: string,
  agent: { bot_user_id: string; name: string },
) {
  await ctx.db
    .updateTable('business_threads')
    .set({ agent_handed_over_at: ctx.now(), updated_at: ctx.now() })
    .where('conversation_id', '=', conversationId)
    .execute();
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
      'o.plan',
      'o.archived_at',
      'o.booking',
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
  if (!thread?.customer_id || thread.archived_at || thread.privacy_class === 'private') return;
  const agent = await activeAgent(ctx, thread.org_id);
  if (!agent) return;
  const customer = await ctx.db
    .selectFrom('users')
    .select(['birth_date', 'time_zone', 'locale'])
    .where('id', '=', thread.customer_id)
    .executeTakeFirst();
  // A person answers anyone under 18 (R29).
  if (!customer || minorOf(customer, ctx.now())) return;
  if (
    (await agentRepliesToday(ctx, thread.org_id)) >= ORG_ALLOWANCES[thread.plan].agentRepliesPerDay
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
    // language they write in (Arabic when they write in it, or read Caime in it), else English.
    const latest = await ctx.db
      .selectFrom('messages')
      .select('body')
      .where('conversation_id', '=', conversationId)
      .where('seq', '=', String(seq))
      .executeTakeFirst();
    const language =
      /\p{Script=Arabic}/u.test(latest?.body ?? '') || customer.locale.startsWith('ar')
        ? 'ar'
        : customer.locale.startsWith('fr')
          ? 'fr'
          : 'en';
    await postAs(ctx, agent.bot_user_id, conversationId, passedOn(thread.org_name, language)).catch(
      (err) => ctx.log.warn({ err, conversationId }, 'ai agent could not post'),
    );
    await handOver(ctx, thread.org_id, conversationId, agent);
    return;
  }

  const transcript = await transcriptFor(
    ctx,
    conversationId,
    thread.customer_id,
    agent.bot_user_id,
  );
  // The next open slots (R51), where the organization takes bookings: it may offer them.
  const open = await openSlotsFor(
    ctx,
    { id: thread.org_id, booking: thread.booking },
    { from: ctx.now(), to: new Date(ctx.now().getTime() + AGENT_SLOT_DAYS * DAY_MS) },
    AGENT_SLOTS,
  );
  const slots = open
    ? open.slots.map((d) => `${d.toISOString()} · ${slotLine(d, open.hours.timeZone)}`).join('\n')
    : null;
  const reply = await askAgent(
    ctx,
    'agent',
    agent.bot_user_id,
    {
      orgName: thread.org_name,
      agentName: agent.name,
      knowledge: agent.knowledge,
      conversation: transcript.text,
      introduced: transcript.introduced,
      today: todayForAgent(ctx.now(), customer.time_zone),
      slots: slots || null,
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
  try {
    await postAs(ctx, agent.bot_user_id, conversationId, reply.message);
  } catch (err) {
    // The customer blocked the organization, or it closed: nobody writes there now.
    ctx.log.warn({ err, conversationId }, 'ai agent could not post');
    await discard(ctx, reply.runId);
    return;
  }
  // Booked (R51): one of the slots it offered, still open, becomes an appointment card from the
  // organization, which the customer confirms; the team sees it under Bookings meanwhile.
  if (reply.action === 'book') {
    const at = reply.bookAt ? new Date(reply.bookAt) : null;
    const stillOpen =
      at && !Number.isNaN(at.getTime()) && open?.slots.some((d) => d.getTime() === at.getTime());
    if (stillOpen && at) {
      await postAs(ctx, agent.bot_user_id, conversationId, {
        kind: 'kit',
        payload: {
          kit: 'appointment',
          fields: {
            title: reply.bookFor || 'Appointment',
            start: { at: at.toISOString(), hasTime: true },
          },
        },
      }).catch((err) => ctx.log.warn({ err, conversationId }, 'ai agent could not book'));
    } else {
      // Not a slot it was given, or taken meanwhile: a person books it.
      await handOver(ctx, thread.org_id, conversationId, agent);
    }
  }
  if (reply.action === 'hand_over') await handOver(ctx, thread.org_id, conversationId, agent);
  if (reply.action === 'resolve') {
    await ctx.db
      .updateTable('business_threads')
      .set({ resolved_at: ctx.now(), resolved_by: agent.bot_user_id, updated_at: ctx.now() })
      .where('conversation_id', '=', conversationId)
      .where('resolved_at', 'is', null)
      .execute();
    await threadMoved(ctx, conversationId, agent.bot_user_id, 'resolved');
  }
}

export function registerAgentJob(): void {
  registerJob('agent.reply', agentReply);
  onCustomerMessage(queueAgent);
}
