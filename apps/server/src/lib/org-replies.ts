/**
 * An organization's replies (M16 H2). Quick replies its team keeps for what customers ask often,
 * put into a reply by "/" and a shortcut; and the two its automatic replies say: a greeting the
 * first time a customer writes (or after a quiet fortnight), and an away message while its
 * hours say it's closed, which ends with when it opens again, on the customer's clock and in
 * their language, so nobody keeps the hours twice. Those come from its own automatic-replies
 * account (a bot named as it, made the first time one is sent, in the conversations it writes in
 * and not on the team), as automated messages that never move a thread; neither while its AI
 * agent answers (the agent's introduction greets), and no away message while someone on the team
 * is answering there. Each is sent once: a greeting for the message that opened the
 * conversation or a quiet stretch, an away message once a closed spell for each conversation.
 * The same account and job send the form a booked or ordered item names (M16 H5,
 * `lib/org-forms.ts`), after its card.
 */
import { randomBytes } from 'node:crypto';
import {
  type BookingHours,
  defaultPrivacy,
  type InterfaceLanguage,
  nextOpening,
  openAt,
  type QuickReplyView,
  safeLocale,
  uuidv7,
  zonedParts,
} from '@caime/core';
import { writtenIn } from '@caime/core/chat-intent';
import { formatDeadline, formatSoon } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { agentAnswersNow } from './agent';
import { onCustomerMessage } from './business';
import { AppError } from './errors';
import { inLanguage, languageOf } from './i18n';
import { enqueue, registerJob } from './jobs';
import { intakeForms } from './org-forms';
import { postAs } from './post-as';

/** A conversation quiet this long greets its customer again when they write. */
export const QUIET_DAYS = 14;
const DAY_MS = 86_400_000;
/** Someone on the team who wrote there this recently is answering: no away message says not. */
export const TEAM_HERE_MS = 3_600_000;
/** An away message asked for with a greeting follows it this long after. */
const AWAY_AFTER_GREETING_MS = 2_000;

export type AutoReply = 'greeting' | 'away';

export async function quickReplies(
  ctx: Pick<AppContext, 'db'>,
  orgId: string,
): Promise<QuickReplyView[]> {
  return ctx.db
    .selectFrom('org_quick_replies')
    .select(['id', 'shortcut', 'body'])
    .where('org_id', '=', orgId)
    .orderBy('position')
    .orderBy('created_at')
    .execute();
}

/**
 * Saves the team's whole list in its order, under the organization's row so two saves at once
 * are one after the other: what it leaves out goes; what it keeps (by id) keeps who made it.
 */
export async function saveQuickReplies(
  ctx: AppContext,
  orgId: string,
  userId: string,
  replies: Array<{ id?: string; shortcut: string; body: string }>,
): Promise<QuickReplyView[]> {
  const now = ctx.now();
  await ctx.db.transaction().execute(async (trx) => {
    await trx
      .selectFrom('organizations')
      .select('id')
      .where('id', '=', orgId)
      .forNoKeyUpdate()
      .executeTakeFirst();
    const before = new Map(
      (
        await trx
          .selectFrom('org_quick_replies')
          .select(['id', 'shortcut', 'body', 'created_by', 'created_at', 'updated_at'])
          .where('org_id', '=', orgId)
          .execute()
      ).map((r) => [r.id, r]),
    );
    await trx.deleteFrom('org_quick_replies').where('org_id', '=', orgId).execute();
    if (!replies.length) return;
    await trx
      .insertInto('org_quick_replies')
      .values(
        replies.map((r, position) => {
          // An id that isn't one of its own is a new reply: never another organization's row.
          const was = r.id ? before.get(r.id) : undefined;
          const same = was && was.shortcut === r.shortcut && was.body === r.body;
          return {
            id: was?.id ?? uuidv7(),
            org_id: orgId,
            shortcut: r.shortcut,
            body: r.body,
            position,
            created_by: was ? was.created_by : userId,
            created_at: was?.created_at ?? now,
            updated_at: same ? was.updated_at : now,
          };
        }),
      )
      .execute();
  });
  return quickReplies(ctx, orgId);
}

/**
 * The account an organization's automatic replies come from: a bot named as the organization
 * (and renamed with it), made the first time one is sent, under the organization's row so two
 * at once make one.
 */
async function repliesBot(ctx: AppContext, orgId: string): Promise<string | null> {
  return ctx.db.transaction().execute(async (trx) => {
    const org = await trx
      .selectFrom('organizations')
      .select(['name', 'replies_bot_id'])
      .where('id', '=', orgId)
      .where('archived_at', 'is', null)
      .forNoKeyUpdate()
      .executeTakeFirst();
    if (!org) return null;
    if (org.replies_bot_id) {
      await trx
        .updateTable('users')
        .set({ display_name: org.name, updated_at: ctx.now() })
        .where('id', '=', org.replies_bot_id)
        .where('display_name', '<>', org.name)
        .execute();
      return org.replies_bot_id;
    }
    const botId = uuidv7();
    // Like an app's bot, it can never sign in, be found, or be written to first.
    await trx
      .insertInto('users')
      .values({
        id: botId,
        email: `bot+${botId}@bots.caime.invalid`,
        handle: `bot.${randomBytes(6).toString('hex')}`,
        password_hash: '!',
        display_name: org.name,
        kind: 'bot',
        privacy: JSON.stringify({
          ...defaultPrivacy({ minor: false }),
          discoverByHandle: false,
          discoverByEmail: false,
          discoverByPhone: false,
          messageRequests: 'nobody',
        }),
        onboarded_at: ctx.now(),
      })
      .execute();
    await trx
      .updateTable('organizations')
      .set({ replies_bot_id: botId })
      .where('id', '=', orgId)
      .execute();
    return botId;
  });
}

/**
 * A customer wrote (registered at startup, run after the message is written): a greeting when
 * this message opened the conversation or a quiet fortnight, and an away message while the
 * organization is closed and nobody on its team is answering there, each queued once. Most
 * organizations have neither, and this is one query for them.
 */
export async function queueAutoReplies(
  ctx: AppContext,
  orgId: string,
  conversationId: string,
  seq: number,
): Promise<void> {
  const org = await ctx.db
    .selectFrom('organizations as o')
    .select((eb) => [
      'o.greeting',
      'o.away_message',
      'o.booking',
      'o.suspended_at',
      eb
        .selectFrom('org_agents as a')
        .select('a.answers_when')
        .whereRef('a.org_id', '=', 'o.id')
        .where('a.paused_at', 'is', null)
        .where('a.review', '=', false)
        .as('agent_answers'),
    ])
    .where('o.id', '=', orgId)
    .where('o.archived_at', 'is', null)
    .executeTakeFirst();
  if (!org || org.suspended_at || (!org.greeting && !org.away_message)) return;
  const now = ctx.now();
  const hours = org.booking as BookingHours | null;
  // Its AI agent answers instead, and introduces itself (when Caime has a model to answer with),
  // unless it answers only while the organization is closed and it's open now (M16 G6a), or its
  // answers wait for the team to check them (M16 G6b): then the organization's own words go now.
  if (org.agent_answers && ctx.ai && agentAnswersNow(org.agent_answers, hours, now)) return;
  let greeted = false;
  if (org.greeting) {
    const before = await ctx.db
      .selectFrom('messages')
      .select('created_at')
      .where('conversation_id', '=', conversationId)
      .where('seq', '<', String(seq))
      .where('kind', '<>', 'system')
      .orderBy('seq', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (!before || now.getTime() - before.created_at.getTime() >= QUIET_DAYS * DAY_MS) {
      greeted = true;
      await enqueue(
        ctx,
        'org.reply',
        { orgId, conversationId, seq, what: 'greeting' },
        { dedupeKey: `org-reply:greeting:${conversationId}:${seq}`, maxAttempts: 3 },
      );
    }
  }
  if (!org.away_message || !hours || openAt(hours, now)) return;
  // Someone on the team wrote there a moment ago: they're answering, whatever the hours say.
  const thread = await ctx.db
    .selectFrom('business_threads')
    .select('last_team_at')
    .where('conversation_id', '=', conversationId)
    .executeTakeFirst();
  if (thread?.last_team_at && now.getTime() - thread.last_team_at.getTime() < TEAM_HERE_MS) return;
  // Once for each closed spell: the next opening names it.
  const opens = nextOpening(hours, now)?.toISOString() ?? 'later';
  await enqueue(
    ctx,
    'org.reply',
    // With the greeting asked for by the same message, which it says first if it runs first.
    { orgId, conversationId, seq, what: 'away', opens, greeting: greeted },
    {
      dedupeKey: `org-reply:away:${conversationId}:${opens}`,
      maxAttempts: 3,
      // After the greeting asked for by the same message.
      ...(greeted ? { runAt: new Date(now.getTime() + AWAY_AFTER_GREETING_MS) } : {}),
    },
  );
}

/**
 * When the organization opens again, as it says so to whoever reads it: "We’re open again
 * tomorrow at 9:00", or a day further on with its date.
 */
export function openAgainLine(opens: Date, now: Date, timeZone: string, locale: string): string {
  const a = zonedParts(opens, timeZone);
  const n = zonedParts(now, timeZone);
  const days = Math.round(
    (Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(n.year, n.month - 1, n.day)) / DAY_MS,
  );
  return days <= 1
    ? tr('We’re open again {when}.', {
        when: formatSoon(opens.toISOString(), now, timeZone, locale),
      })
    : tr('We’re open again on {date}.', {
        date: formatDeadline(opens.toISOString(), now, timeZone, locale),
      });
}

/**
 * The away message as the customer reads it: the organization's words, then when it opens
 * again, in the language they wrote in (else theirs) and on their own clock (a customer reached
 * by mail has none on Caime: the organization's).
 */
async function awayText(
  ctx: AppContext,
  text: string,
  hours: BookingHours,
  conversationId: string,
  seq: number,
  now: Date,
): Promise<string> {
  const opens = nextOpening(hours, now);
  if (!opens) return text;
  const customer = await ctx.db
    .selectFrom('business_threads as t')
    .innerJoin('users as u', 'u.id', 't.customer_id')
    .select(['u.id', 'u.kind', 'u.time_zone', 'u.locale'])
    .where('t.conversation_id', '=', conversationId)
    .executeTakeFirst();
  if (!customer) return text;
  const wrote = await ctx.db
    .selectFrom('messages')
    .select('body')
    .where('conversation_id', '=', conversationId)
    .where('seq', '=', String(seq))
    .executeTakeFirst();
  const language: InterfaceLanguage =
    writtenIn(wrote?.body ?? '') ?? (await languageOf(ctx, customer.id));
  const zone = customer.kind === 'human' ? customer.time_zone || 'UTC' : hours.timeZone;
  // Its dates in the same language as its words, in the customer's own form of it where it is.
  const theirs = safeLocale(customer.locale);
  const locale = theirs.split('-')[0] === language ? theirs : language;
  return `${text}\n\n${inLanguage(language, () => openAgainLine(opens, now, zone, locale))}`;
}

/**
 * A job's automatic reply. An away message asked for with a greeting says the greeting first
 * (once: by the greeting's own client id, so whichever of the two jobs runs first, the other
 * finds it said), and the customer reads them in that order however the jobs were run.
 */
async function sendAutoReply(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  if (payload.what === 'form') return postForm(ctx, payload);
  const what: AutoReply = payload.what === 'away' ? 'away' : 'greeting';
  if (what === 'away' && payload.greeting === true) await postReply(ctx, payload, 'greeting');
  await postReply(ctx, payload, what);
}

/** Sends one automatic reply, as it reads when it's sent: turned off or open since, nothing. */
async function postReply(
  ctx: AppContext,
  payload: Record<string, unknown>,
  what: AutoReply,
): Promise<void> {
  const orgId = String(payload.orgId);
  const conversationId = String(payload.conversationId);
  const seq = Number(payload.seq);
  const org = await ctx.db
    .selectFrom('organizations')
    .select(['greeting', 'away_message', 'booking', 'suspended_at'])
    .where('id', '=', orgId)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  const text = what === 'away' ? org?.away_message : org?.greeting;
  if (!org || org.suspended_at || !text) return;
  const now = ctx.now();
  const hours = org.booking as BookingHours | null;
  if (what === 'away' && (!hours || openAt(hours, now))) return;
  const body =
    what === 'away' && hours ? await awayText(ctx, text, hours, conversationId, seq, now) : text;
  const botId = await repliesBotIn(ctx, orgId, conversationId);
  if (!botId) return;
  try {
    await postAs(
      ctx,
      botId,
      conversationId,
      { kind: 'text', body, payload: { autoReply: what } },
      {
        // Once each (a client id is at most 64): the message for a greeting, the minute it opens
        // again for an away message.
        clientId: `${what}:${conversationId}:${
          what === 'greeting'
            ? String(seq)
            : Number.isNaN(Date.parse(String(payload.opens)))
              ? 'later'
              : String(Math.floor(Date.parse(String(payload.opens)) / 60_000))
        }`,
        serverPayload: true,
      },
    );
  } catch (err) {
    // The customer blocked the organization since, or it closed: nobody writes there now.
    if (!(err instanceof AppError)) throw err;
    ctx.log.warn({ err, conversationId }, 'automatic reply could not post');
  }
}

/**
 * The organization's automatic-replies account, in the conversation it writes in as the team is
 * (to the customer, the organization); null for an organization that closed.
 */
async function repliesBotIn(
  ctx: AppContext,
  orgId: string,
  conversationId: string,
): Promise<string | null> {
  const botId = await repliesBot(ctx, orgId);
  if (!botId) return null;
  await sql`
    insert into participants (conversation_id, user_id, role, last_read_seq, last_delivered_seq)
    select ${conversationId}, ${botId}, 'agent', c.last_seq, c.last_seq
    from conversations c where c.id = ${conversationId}
    on conflict (conversation_id, user_id) do update set left_at = null, role = 'agent'
  `.execute(ctx.db);
  return botId;
}

/**
 * The form a booked or ordered item names (M16 H5), as a Form card answering its card, once: by
 * the card and the form (a client id is at most 64), so a job run again finds it sent. Nothing
 * when the card was taken down since, the form let go, or the organization suspended.
 */
async function postForm(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const orgId = String(payload.orgId);
  const conversationId = String(payload.conversationId);
  const messageId = String(payload.messageId);
  const formId = String(payload.formId);
  const org = await ctx.db
    .selectFrom('organizations')
    .select('suspended_at')
    .where('id', '=', orgId)
    .where('archived_at', 'is', null)
    .executeTakeFirst();
  if (!org || org.suspended_at) return;
  const card = await ctx.db
    .selectFrom('messages')
    .select('id')
    .where('id', '=', messageId)
    .where('conversation_id', '=', conversationId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!card) return;
  if (!(await intakeForms(ctx.db, orgId)).some((f) => f.id === formId)) return;
  const botId = await repliesBotIn(ctx, orgId, conversationId);
  if (!botId) return;
  try {
    await postAs(
      ctx,
      botId,
      conversationId,
      { kind: 'kit', payload: { kit: 'form', fields: {}, form: { formId } }, replyToId: messageId },
      { clientId: `form:${messageId}:${formId.slice(-12)}` },
    );
  } catch (err) {
    // The customer blocked the organization since, or it closed: nobody writes there now.
    if (!(err instanceof AppError)) throw err;
    ctx.log.warn({ err, conversationId }, 'a booked item’s form could not post');
  }
}

export function registerAutoReplies(): void {
  registerJob('org.reply', sendAutoReply);
  onCustomerMessage(queueAutoReplies);
}
