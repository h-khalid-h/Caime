/**
 * Cai answers for someone who turned it on (R116, M17 I16a and I16a2, ADR-18; the council in
 * docs/REVIEW-2026-10-25-CAI.md §7).
 *
 * - A stranger's message request (I16a): when someone not connected with them writes first, Cai
 *   answers in that one-to-one for them, once: who it is, for whom, that they haven't read it yet
 *   (R87's introduction), and two choices, "Leave my message" (free, the request as it always was)
 *   and "Talk to Cai now" (on the stranger's own AI allowance, offered to an adult with assist on).
 * - The people they know (I16a2), by the ways they know them they picked: a message from one of
 *   them left unanswered for the minutes they chose (the `cai.answer.wait` job, one a stretch of
 *   their silence) or while they're busy is met the same way, once a stretch, only where a talk can
 *   be offered: on the receiver's own allowance for the people they cover (up to their number in
 *   thirty days, `CAI_COVERED_A_DAY` a caller), else on the caller's.
 * - Talking, the caller's lines carry `payload.toCai`: past the request's one-message rule up to a
 *   cap a day for a stranger, and as the device asks (`toCai` on a send, checked) for someone they
 *   know (`talkingToCai`, read by `sendMessage`). Cai answers each from what the caller may know
 *   of the receiver (`aboutFor`: their profile as the privacy evaluator shows it to the caller,
 *   what they offer to everyone, whether they're busy where that's allowed) and the conversation
 *   from the caller's line (the twenty lines before it too for someone they know), never the
 *   receiver's label for them or another conversation, through `runAi('cai-answer')` on the
 *   payer's id. For the people they picked, what can't wait reaches them at once (`ringThrough`).
 * - It ends when the caller is done, at `CAI_ANSWER_TURNS`, when the allowance runs out, or when
 *   the receiver writes there or answers the request (`endCaiAnswer`); unless the receiver answered
 *   themselves, Cai tells them in their own chat with Cai what was asked and what to do.
 *
 * Cai's lines are Cai's (`insertCaiLine`): messages from Cai's fixed id marked
 * `payload.answering`, never through `sendMessage`, never with Cai as a member, and no message
 * effects run for them. Nothing here reaches someone under 18 on either side, a private
 * conversation, mail, or an organization's conversation.
 */
import {
  CAI_ANSWER_LINES_A_DAY,
  CAI_ANSWER_TURNS,
  CAI_COVERED_A_DAY,
  CAI_KNOWN_CONTEXT_LINES,
  type CaiAnswerChoice,
  type CaiAnswerEnd,
  type CaiAnsweringState,
  type CaiAnsweringView,
  type CaiAnswerReason,
  type CaiAnswersSettings,
  caiAnswersOf,
  canSee,
  firstName,
  formatAmount,
  isBooked,
  previewText,
  type Sphere,
  truncate,
  uuidv7,
  writtenIn,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import { systemAccountOf } from '@caime/core/system-accounts';
import { CAI_ID } from '@caime/core/system-ids';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS, type Message } from '../db/schema';
import { languageName } from './ai';
import { runAi } from './ai-run';
import { itemsFor, personHost } from './booking';
import { busyNow } from './calendar';
import { AppError, badRequest, forbidden } from './errors';
import { asReader, inLanguage, languageOf, readerOf } from './i18n';
import { enqueue, registerJob } from './jobs';
import { expiresAt, messageViews, retentionFor } from './messages';
import { notify } from './notify';
import { assertAiAllowance } from './plans';
import { postAs } from './post-as';
import { activeRelationships, viewerRelation } from './relations';
import { openSystemConversation } from './system-accounts';
import { transcriptClock } from './transcript';
import { transcriptOf } from './transcript-of';
import { minorOf, privacyOf } from './users';

const ANSWER_JOB = 'cai.answer';
const WAIT_JOB = 'cai.answer.wait';
const MONTH_MS = 30 * 86_400_000;
const DAY_MS = 86_400_000;

/**
 * Cai's line in a one-to-one, for its receiver (ADR-18): the next of the conversation's lines
 * under its row, from Cai's fixed id, marked as answering for them; told live to both and, as a
 * push, to the caller. Never through `sendMessage`, never a member, no effects.
 */
export async function insertCaiLine(
  ctx: AppContext,
  conversationId: string,
  answering: { for: string; callerId: string; offer?: CaiAnswerChoice[] },
  body: string,
): Promise<Message> {
  const row = await ctx.db.transaction().execute(async (trx) => {
    const bumped = await trx
      .updateTable('conversations')
      .set({
        last_seq: sql`last_seq + 1`,
        updated_at: ctx.now(),
        last_message_at: ctx.now(),
      })
      .where('id', '=', conversationId)
      .returning(['last_seq', 'retention_days'])
      .executeTakeFirstOrThrow();
    const kept = await retentionFor(trx, conversationId, bumped.retention_days);
    return trx
      .insertInto('messages')
      .values({
        id: uuidv7(),
        conversation_id: conversationId,
        seq: bumped.last_seq,
        sender_id: CAI_ID,
        client_id: null,
        kind: 'text',
        body,
        payload: JSON.stringify({
          answering: { for: answering.for, ...(answering.offer ? { offer: answering.offer } : {}) },
        }),
        expires_at: expiresAt(ctx.now(), kept),
        created_at: ctx.now(),
      })
      .returning(MESSAGE_COLUMNS)
      .executeTakeFirstOrThrow();
  });
  const [view] = await messageViews(ctx.db, [row], answering.callerId);
  await ctx.bus.publish([answering.callerId, answering.for], {
    type: 'message.created',
    data: { ...view!, clientId: null },
  });
  return row;
}

/** The two people of a conversation Cai answers in, and where it stands. */
interface Answering {
  id: string;
  conversation_id: string;
  receiver_id: string;
  caller_id: string;
  state: CaiAnsweringState;
  talk: boolean;
  payer_id: string | null;
  turns: number;
  from_seq: number | string;
  reason: CaiAnswerReason;
  covered: boolean;
  rang_at: Date | null;
}

/** Cai's latest answering in a conversation (one live at a time), if it ever answered there. */
const answeringOf = (ctx: AppContext, conversationId: string) =>
  ctx.db
    .selectFrom('cai_answering')
    .select([
      'id',
      'conversation_id',
      'receiver_id',
      'caller_id',
      'state',
      'talk',
      'payer_id',
      'turns',
      'from_seq',
      'reason',
      'covered',
      'rang_at',
    ])
    .where('conversation_id', '=', conversationId)
    .orderBy('offered_at', 'desc')
    .limit(1)
    .executeTakeFirst() as Promise<Answering | undefined>;

/** Someone who may talk to Cai on their own allowance: an adult on Caime with assist on. */
async function mayTalk(ctx: AppContext, userId: string): Promise<boolean> {
  if (!ctx.ai) return false;
  const u = await ctx.db
    .selectFrom('users')
    .select(['kind', 'ai_enabled', 'birth_date', 'time_zone', 'age_minor_until'])
    .where('id', '=', userId)
    .executeTakeFirst();
  return Boolean(u && u.kind === 'human' && u.ai_enabled && !minorOf(u, ctx.now()));
}

/** The people someone runs Cai answering for, as their settings and the two of them stand. */
interface Fit {
  settings: CaiAnswersSettings;
  /** How the receiver knows the caller, among the ways Cai answers for: never said to anyone. */
  spheres: Sphere[];
}

const PEOPLE_COLUMNS = [
  'id',
  'kind',
  'display_name',
  'preferences',
  'ai_enabled',
  'birth_date',
  'time_zone',
  'age_minor_until',
  'deleted_at',
  'suspended_at',
] as const;

/**
 * Whether Cai answers this caller for this receiver: two adults on Caime (R29), neither one of
 * Caime's own, the receiver with assist on and Cai turned on for strangers (`known` false) or for
 * a way they know the caller (`known` true: their own labels, read here and never said).
 */
async function fitFor(
  ctx: AppContext,
  receiverId: string,
  callerId: string,
  known: boolean,
): Promise<Fit | null> {
  if (systemAccountOf(callerId) || systemAccountOf(receiverId)) return null;
  const person = (id: string) =>
    ctx.db.selectFrom('users').select(PEOPLE_COLUMNS).where('id', '=', id).executeTakeFirst();
  // The receiver first: for almost every message it's off, and nothing more is read.
  const receiver = await person(receiverId);
  if (!receiver || receiver.deleted_at || receiver.suspended_at || !receiver.ai_enabled)
    return null;
  const settings = caiAnswersOf(receiver.preferences);
  if (!known && !settings.strangers) return null;
  if (known && (!settings.spheres.length || (settings.after === null && !settings.whileBusy)))
    return null;
  // A person on Caime for a person on Caime, both adults (R29): never mail, never a child.
  const caller = await person(callerId);
  if (!caller || receiver.kind !== 'human' || caller.kind !== 'human') return null;
  if (minorOf(receiver, ctx.now()) || minorOf(caller, ctx.now())) return null;
  if (!known) return { settings, spheres: [] };
  const labels = await activeRelationships(ctx.db, receiverId, [callerId]);
  const spheres = settings.spheres.filter((s) => labels.some((r) => r.sphere === s));
  return spheres.length ? { settings, spheres } : null;
}

/**
 * Whether the receiver covers a talk with this caller now (M17 I16a2): one of the ways they cover,
 * under their number in thirty days and `CAI_COVERED_A_DAY` for this caller, with allowance left.
 */
async function coverRoom(
  ctx: AppContext,
  receiverId: string,
  callerId: string,
  fit: Fit,
): Promise<boolean> {
  if (!fit.spheres.some((s) => fit.settings.covers.includes(s))) return false;
  const now = ctx.now().getTime();
  const taken = await ctx.db
    .selectFrom('cai_answering')
    .select([
      sql<number>`count(*)::int`.as('month'),
      sql<number>`(count(*) filter (where caller_id = ${callerId} and offered_at > ${new Date(now - DAY_MS)}))::int`.as(
        'today',
      ),
    ])
    .where('receiver_id', '=', receiverId)
    .where('covered', '=', true)
    .where('payer_id', '=', receiverId)
    .where('offered_at', '>', new Date(now - MONTH_MS))
    .executeTakeFirstOrThrow();
  if (taken.month >= fit.settings.coverMonthly || taken.today >= CAI_COVERED_A_DAY) return false;
  try {
    await assertAiAllowance(ctx, receiverId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cai's first line for a receiver (from the message's effects for a stranger's request, from
 * `considerCaiAnswer` or its wait for someone they know): it introduces itself for them, in the
 * caller's language, with the choices the caller may take. A stranger's request is met once a
 * conversation; someone they know is met only where a talk can be offered, and the second time
 * in a conversation without the introduction.
 */
export async function offerCaiAnswer(
  ctx: AppContext,
  message: Pick<Message, 'conversation_id' | 'seq' | 'sender_id' | 'channel' | 'body' | 'sealed'>,
  receiverId: string,
  reason: CaiAnswerReason = 'request',
  given?: Fit,
): Promise<void> {
  const callerId = message.sender_id;
  if (!callerId || message.channel === 'mail' || message.sealed) return;
  const fit = given ?? (await fitFor(ctx, receiverId, callerId, reason !== 'request'));
  if (!fit) return;
  const before = await answeringOf(ctx, message.conversation_id);
  // A stranger's request is answered once: never again in that conversation.
  if (reason === 'request' && before) return;
  const covered = reason !== 'request' && (await coverRoom(ctx, receiverId, callerId, fit));
  const talk = covered || (await mayTalk(ctx, callerId));
  // Someone they know hears from Cai only where it can do something for them.
  if (reason !== 'request' && !talk) return;
  const made = await ctx.db
    .insertInto('cai_answering')
    .values({
      id: uuidv7(),
      conversation_id: message.conversation_id,
      receiver_id: receiverId,
      caller_id: callerId,
      state: 'offered',
      talk,
      reason,
      covered,
      from_seq: Number(message.seq),
      offered_at: ctx.now(),
    })
    // Two offers at once: the live one's index keeps the first.
    .onConflict((oc) =>
      oc.column('conversation_id').where('state', 'in', ['offered', 'talking']).doNothing(),
    )
    .returning('id')
    .executeTakeFirst();
  if (!made) return;
  const [caller, receiver] = await Promise.all([nameOf(ctx, callerId), nameOf(ctx, receiverId)]);
  const said = { name: firstName(caller), receiver };
  const line = await inCallersWords(ctx, callerId, message.body, () =>
    reason !== 'request'
      ? before
        ? tr(
            'Cai here again, for {receiver}, who hasn’t answered yet. You can leave your message for them, or talk to me now.',
            { receiver },
          )
        : tr(
            'Hi {name}, I’m Cai, an AI assistant answering for {receiver} on Caime. {receiver} hasn’t answered yet. You can leave your message for them, or talk to me now: I can pass on what you need.',
            said,
          )
      : talk
        ? tr(
            'Hi {name}, I’m Cai, an AI assistant answering for {receiver} on Caime. {receiver} hasn’t read your message yet. You can leave it for them, or talk to me now: I can tell you what {receiver} offers and pass on what you need.',
            said,
          )
        : tr(
            'Hi {name}, I’m Cai, an AI assistant answering for {receiver} on Caime. {receiver} hasn’t read your message yet; it’s waiting for them.',
            said,
          ),
  );
  await insertCaiLine(
    ctx,
    message.conversation_id,
    { for: receiverId, callerId, offer: talk ? ['leave', 'talk'] : undefined },
    line,
  );
  // Both views say Cai answers here now (the caller's choices, above their composer).
  await tellViews(ctx, {
    conversation_id: message.conversation_id,
    caller_id: callerId,
    receiver_id: receiverId,
  });
  ctx.metrics.caiAnswers.inc({ scope: 'person', payer: 'none', outcome: 'offered' });
}

/**
 * A message in a one-to-one from someone the receiver knows (the message's effects): Cai answers
 * at once while the receiver is busy, if they asked for that, else waits the minutes they chose
 * (one wait a stretch of their silence: `since` is where they last wrote there). Nothing at all
 * where it isn't on for this person, or where Cai already answered since they last wrote.
 */
export async function considerCaiAnswer(
  ctx: AppContext,
  message: Pick<Message, 'conversation_id' | 'seq' | 'sender_id' | 'channel' | 'body' | 'sealed'>,
  receiverId: string,
  since: number,
): Promise<void> {
  const callerId = message.sender_id;
  if (!ctx.ai || !callerId || message.channel === 'mail' || message.sealed) return;
  const fit = await fitFor(ctx, receiverId, callerId, true);
  if (!fit || (await answeredSince(ctx, message.conversation_id, since))) return;
  if (fit.settings.whileBusy && (await busyNow(ctx, receiverId, ctx.now()))) {
    await offerCaiAnswer(ctx, message, receiverId, 'busy', fit);
    return;
  }
  if (fit.settings.after === null) return;
  await enqueue(
    ctx,
    WAIT_JOB,
    { conversationId: message.conversation_id, receiverId, callerId, since },
    {
      runAt: new Date(ctx.now().getTime() + fit.settings.after * 60_000),
      dedupeKey: `cai-wait:${message.conversation_id}:${receiverId}:${since}`,
    },
  );
}

/** Cai is answering there now, or already answered since the receiver last wrote there. */
async function answeredSince(
  ctx: AppContext,
  conversationId: string,
  since: number,
): Promise<boolean> {
  const a = await answeringOf(ctx, conversationId);
  return Boolean(
    a && (a.state === 'offered' || a.state === 'talking' || Number(a.from_seq) > since),
  );
}

/**
 * The wait ran out (`cai.answer.wait`): read again whether the receiver wrote since, whether Cai
 * still answers this person for them and hasn't already; then met from the caller's latest line.
 */
async function waitJob(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const conversationId = String(payload.conversationId ?? '');
  const receiverId = String(payload.receiverId ?? '');
  const callerId = String(payload.callerId ?? '');
  const since = Number(payload.since ?? 0);
  const where = await ctx.db
    .selectFrom('participants')
    .select('last_sent_seq')
    .where('conversation_id', '=', conversationId)
    .where('user_id', '=', receiverId)
    .where('left_at', 'is', null)
    .executeTakeFirst();
  if (!where || Number(where.last_sent_seq ?? 0) > since) return;
  if (await answeredSince(ctx, conversationId, since)) return;
  const fit = await fitFor(ctx, receiverId, callerId, true);
  if (!fit || fit.settings.after === null) return;
  const latest = await ctx.db
    .selectFrom('messages')
    .select(['conversation_id', 'seq', 'sender_id', 'channel', 'body', 'sealed'])
    .where('conversation_id', '=', conversationId)
    .where('sender_id', '=', callerId)
    .where('seq', '>', String(since))
    .where('deleted_at', 'is', null)
    .orderBy('seq', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!latest) return;
  await offerCaiAnswer(ctx, latest, receiverId, 'unanswered', fit);
}

/** Words for the caller, in the language they wrote in, else their account's (R87). */
async function inCallersWords(
  ctx: AppContext,
  callerId: string,
  body: string | null,
  words: () => string,
): Promise<string> {
  const reader = await readerOf(ctx, callerId);
  const written = body ? writtenIn(body) : null;
  return inLanguage(written ?? reader.language, words, reader.variety, reader.gender);
}

/**
 * The caller's choice on Cai's first line (`POST /conversations/:id/cai-answer`): their message
 * left as it was, or a talk with Cai now, on the receiver's allowance where they cover it and
 * still have room (M17 I16a2), else on the caller's own (`aiGate`'s rules: an adult with assist on
 * and room left). Theirs alone, once, while it's offered.
 */
export async function chooseCaiAnswer(
  ctx: AppContext,
  callerId: string,
  conversationId: string,
  choice: CaiAnswerChoice,
): Promise<void> {
  const a = await answeringOf(ctx, conversationId);
  if (!a || a.caller_id !== callerId) throw badRequest(tr('There’s nothing to choose here.'));
  if (a.state !== 'offered') throw badRequest(tr('That was chosen already.'));
  let payer = callerId;
  if (choice === 'talk') {
    // Covered where the receiver still has room for it; else the caller's own, as for anyone.
    const fit = a.covered ? await fitFor(ctx, a.receiver_id, callerId, true) : null;
    if (fit && (await coverRoom(ctx, a.receiver_id, callerId, fit))) payer = a.receiver_id;
    else {
      if (!a.talk || !(await mayTalk(ctx, callerId)))
        throw forbidden(tr('Talking to Cai is for adults with AI assist on.'));
      await assertAiAllowance(ctx, callerId);
    }
  }
  const moved = await ctx.db
    .updateTable('cai_answering')
    .set(
      choice === 'talk'
        ? { state: 'talking', payer_id: payer, covered: payer === a.receiver_id }
        : { state: 'left', ended_at: ctx.now(), ended_by: 'caller' },
    )
    .where('id', '=', a.id)
    .where('state', '=', 'offered')
    .returning('id')
    .executeTakeFirst();
  if (!moved) throw badRequest(tr('That was chosen already.'));
  const receiver = await nameOf(ctx, a.receiver_id);
  const line = await inCallersWords(ctx, callerId, null, () =>
    choice === 'talk'
      ? tr('Go ahead: what would you like {receiver} to know?', { receiver })
      : tr('Your message stays for {receiver}, who answers when they can.', { receiver }),
  );
  await insertCaiLine(ctx, conversationId, { for: a.receiver_id, callerId }, line);
  await tellViews(ctx, a);
  ctx.metrics.caiAnswers.inc({
    scope: 'person',
    payer: choice === 'talk' ? (payer === a.receiver_id ? 'receiver' : 'caller') : 'none',
    outcome: choice === 'talk' ? 'talked' : 'left',
  });
}

const nameOf = async (ctx: AppContext, userId: string) =>
  (
    await ctx.db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', userId)
      .executeTakeFirstOrThrow()
  ).display_name;

/** Both sides' views of the conversation say where Cai stands now. */
const tellViews = (
  ctx: AppContext,
  a: Pick<Answering, 'conversation_id' | 'caller_id' | 'receiver_id'>,
) =>
  ctx.bus.publish([a.caller_id, a.receiver_id], {
    type: 'conversation.updated',
    data: { conversationId: a.conversation_id },
  });

/**
 * Whether the sender of a line in a one-to-one is talking to Cai there (`sendMessage`, past a
 * request's one-message rule): the caller, while it's on, within their lines a day.
 */
export async function talkingToCai(
  ctx: AppContext,
  senderId: string,
  conversationId: string,
): Promise<boolean> {
  const a = await answeringOf(ctx, conversationId);
  if (a?.state !== 'talking' || a.caller_id !== senderId) return false;
  const today = await ctx.db
    .selectFrom('messages')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('sender_id', '=', senderId)
    .where('created_at', '>', new Date(ctx.now().getTime() - 86_400_000))
    .where(sql<boolean>`(payload->>'toCai')::boolean`)
    .executeTakeFirstOrThrow();
  return today.n < CAI_ANSWER_LINES_A_DAY;
}

/** A line the caller wrote to Cai (its effects): answered by the job, the latest of a burst. */
export async function queueCaiAnswer(ctx: AppContext, message: Pick<Message, 'id'>): Promise<void> {
  await enqueue(
    ctx,
    ANSWER_JOB,
    { messageId: message.id },
    { dedupeKey: `cai-answer:${message.id}` },
  );
}

/**
 * What Cai may say of the receiver to this caller (ADR-10): built with the caller as the viewer.
 * Their name; their line and bio where the privacy evaluator shows them to the caller; what they
 * offer to everyone, with its page; and whether they're busy now where that's the caller's to
 * see. Never how the receiver labelled the caller, never another conversation, never an address.
 */
export async function aboutFor(
  ctx: AppContext,
  receiverId: string,
  callerId: string,
): Promise<string> {
  const user = await ctx.db
    .selectFrom('users')
    .select([
      'id',
      'handle',
      'display_name',
      'headline',
      'bio',
      'privacy',
      'birth_date',
      'time_zone',
      'age_minor_until',
      'booking',
      'booking_items',
      'collections',
      'ordering',
      'payments',
    ])
    .where('id', '=', receiverId)
    .executeTakeFirstOrThrow();
  const now = ctx.now();
  const settings = privacyOf(user, now);
  // The caller as the receiver's privacy reads them: a label of theirs may widen what they see,
  // and is never said.
  const viewer = await viewerRelation(ctx.db, receiverId, callerId);
  const lines = [`Name: ${user.display_name}`];
  if (user.headline && canSee(settings, 'identityDetails', viewer))
    lines.push(`What they do: ${user.headline}`);
  if (user.bio && canSee(settings, 'bio', viewer)) lines.push(`About them: ${user.bio}`);
  const host = personHost(user);
  const items = host.hours
    ? itemsFor(host, { isConnected: false, spheres: [], adult: true }).filter(isBooked)
    : [];
  const page = `${ctx.config.PUBLIC_URL}/@${encodeURIComponent(user.handle)}`;
  for (const i of items.slice(0, 8)) {
    const price = i.price ? formatAmount(i.price.value, i.price.currency) : 'free';
    const length = i.minutes ? `${i.minutes} min` : i.unit === 'days' ? 'by the day' : null;
    lines.push(
      `Offers: ${[i.name, length, price].filter(Boolean).join(', ')}; booked at ${page}/${encodeURIComponent(i.slug ?? '')}`,
    );
  }
  if (canSee(settings, 'busy', viewer)) {
    const busy = await busyNow(ctx, receiverId, now);
    if (busy)
      lines.push(`Busy now, until ${transcriptClock(user.time_zone || 'UTC').time(busy.until)}`);
  }
  return lines.join('\n');
}

/** The longest line Cai writes when it answers for someone. */
const ANSWER_CHARS = 1_000;

/**
 * Cai's answer to the caller's latest line (the `cai.answer` job): from what the caller may know
 * of the receiver and their conversation as the caller reads it, on the payer's allowance, at most
 * `CAI_ANSWER_TURNS` lines; out of allowance or the model away, the messages stay for the receiver
 * and Cai says so.
 */
async function answerJob(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const ai = ctx.ai;
  const messageId = String(payload.messageId ?? '');
  const m = await ctx.db
    .selectFrom('messages')
    .select(['id', 'conversation_id', 'seq', 'sender_id', 'body'])
    .where('id', '=', messageId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!m?.sender_id || !ai) return;
  const a = await answeringOf(ctx, m.conversation_id);
  if (a?.state !== 'talking' || a.caller_id !== m.sender_id) return;
  // A burst is answered once, at its latest line.
  const later = await ctx.db
    .selectFrom('messages')
    .select('id')
    .where('conversation_id', '=', m.conversation_id)
    .where('sender_id', '=', m.sender_id)
    .where('seq', '>', m.seq)
    .executeTakeFirst();
  if (later) return;
  const answering = { for: a.receiver_id, callerId: a.caller_id };
  const receiverName = await nameOf(ctx, a.receiver_id);
  const payer = a.payer_id ?? a.caller_id;
  const caller = await ctx.db
    .selectFrom('users')
    .select(['time_zone'])
    .where('id', '=', a.caller_id)
    .executeTakeFirstOrThrow();
  const zone = caller.time_zone || 'UTC';
  const clock = transcriptClock(zone);
  const known = a.reason !== 'request';
  let out: { reply: string; done: boolean; summary: string; urgent: boolean };
  try {
    await assertAiAllowance(ctx, payer);
    const [about, { transcript }, callerLanguage, receiverLanguage] = await Promise.all([
      aboutFor(ctx, a.receiver_id, a.caller_id),
      // From a stranger's first line on, never what came before it (bounded by the turns); for
      // someone they know, the two's own last lines before it too (R116 (3)).
      transcriptOf(ctx, a.caller_id, m.conversation_id, 0, zone, {
        fromSeq: known
          ? Math.max(1, Number(a.from_seq) - CAI_KNOWN_CONTEXT_LINES)
          : Number(a.from_seq),
      }),
      languageOf(ctx, a.caller_id),
      languageOf(ctx, a.receiver_id),
    ]);
    out = await runAi(ctx, 'cai-answer', payer, () =>
      ai.answerFor({
        receiver: receiverName,
        known,
        about,
        transcript: transcript.text,
        language: languageName((m.body ? writtenIn(m.body) : null) ?? callerLanguage),
        receiverLanguage: languageName(receiverLanguage),
        today: clock.day(ctx.now()),
        now: clock.time(ctx.now()),
      }),
    );
  } catch (err) {
    if (err instanceof AppError || (err as { kind?: string }).kind) {
      const line = await inCallersWords(ctx, a.caller_id, m.body, () =>
        tr('I can’t go on now. Your messages stay for {receiver}.', { receiver: receiverName }),
      );
      await insertCaiLine(ctx, m.conversation_id, answering, line);
      await endCaiAnswer(ctx, m.conversation_id, 'limit');
      return;
    }
    throw err;
  }
  const turns = a.turns + 1;
  await ctx.db.updateTable('cai_answering').set({ turns }).where('id', '=', a.id).execute();
  const reply = truncate(out.reply.trim(), ANSWER_CHARS);
  if (reply) {
    const line = await insertCaiLine(ctx, m.conversation_id, answering, reply);
    // Told as any line is, in case they've put the phone away; one at a time.
    await notify(ctx, {
      userId: a.caller_id,
      kind: 'message',
      level: 'attention',
      title: () => tr('Cai, for {name}', { name: receiverName }),
      body: previewText(reply, 140),
      data: { conversationId: m.conversation_id },
      quotes: [line.id],
      groupKey: `cai-answer:${m.conversation_id}`,
    });
  }
  // What can't wait reaches the receiver at once, for the people they picked (R116 (1)).
  if (out.urgent && known && !a.rang_at)
    await ringThrough(ctx, a, receiverName, out.summary, m.body);
  if (out.done) await endCaiAnswer(ctx, m.conversation_id, 'handed_over', out.summary);
  else if (turns >= CAI_ANSWER_TURNS)
    await endCaiAnswer(ctx, m.conversation_id, 'limit', out.summary);
}

/**
 * The caller says it can't wait, and the receiver picked the way they know them for that: they're
 * told at once, as urgent, with what Cai heard (once a talk), and the caller is told they were.
 */
async function ringThrough(
  ctx: AppContext,
  a: Answering,
  receiverName: string,
  summary: string,
  body: string | null,
): Promise<void> {
  const fit = await fitFor(ctx, a.receiver_id, a.caller_id, true);
  if (!fit?.spheres.some((s) => fit.settings.ringThrough.includes(s))) return;
  const rang = await ctx.db
    .updateTable('cai_answering')
    .set({ rang_at: ctx.now() })
    .where('id', '=', a.id)
    .where('rang_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  if (!rang) return;
  const callerName = await nameOf(ctx, a.caller_id);
  await asReader(ctx, a.receiver_id, () =>
    notify(ctx, {
      userId: a.receiver_id,
      kind: 'cai',
      level: 'urgency',
      title: () => tr('{name} needs you now', { name: callerName }),
      body: summary.trim() ? truncate(summary.trim(), 300) : null,
      data: { conversationId: a.conversation_id },
      groupKey: `cai-rang:${a.conversation_id}`,
    }),
  );
  const line = await inCallersWords(ctx, a.caller_id, body, () =>
    tr('I’ve let {receiver} know it can’t wait.', { receiver: receiverName }),
  );
  await insertCaiLine(ctx, a.conversation_id, { for: a.receiver_id, callerId: a.caller_id }, line);
  ctx.metrics.caiAnswers.inc({ scope: 'person', payer: payerOf(a), outcome: 'rang' });
}

/** Whose allowance a talk spends, as the metric names it. */
const payerOf = (a: Pick<Answering, 'payer_id' | 'receiver_id'>) =>
  !a.payer_id ? 'none' : a.payer_id === a.receiver_id ? 'receiver' : 'caller';

/**
 * Cai stops answering in a conversation, once: the caller done, the turns or the allowance spent,
 * or the receiver who answered or declined. Unless it was the receiver, Cai tells them in their own
 * chat with Cai what was asked and what to do, and says so to the caller when it ran out.
 */
export async function endCaiAnswer(
  ctx: AppContext,
  conversationId: string,
  by: CaiAnswerEnd,
  summary: string | null = null,
  /** Only where it answers for this person: their own line or answer ends it, nobody else's. */
  receiverId?: string,
): Promise<void> {
  let ending = ctx.db
    .updateTable('cai_answering')
    .set({ state: 'ended', ended_at: ctx.now(), ended_by: by })
    .where('conversation_id', '=', conversationId)
    .where('state', 'in', ['offered', 'talking']);
  if (receiverId) ending = ending.where('receiver_id', '=', receiverId);
  const ended = await ending
    .returning([
      'id',
      'conversation_id',
      'receiver_id',
      'caller_id',
      'payer_id',
      'turns',
      'state',
      'reason',
    ])
    .executeTakeFirst();
  if (!ended) return;
  await tellViews(ctx, ended);
  ctx.metrics.caiAnswers.inc({ scope: 'person', payer: payerOf(ended), outcome: by });
  if (by === 'receiver' || by === 'declined' || ended.turns === 0) return;
  const callerName = await nameOf(ctx, ended.caller_id);
  const said = summary?.trim() ? truncate(summary.trim(), 600) : null;
  await asReader(ctx, ended.receiver_id, async () => {
    const cai = systemAccountOf(CAI_ID)!;
    const chat = await openSystemConversation(ctx, ended.receiver_id, cai);
    // A stranger's message waits in their requests; someone they know's, in their chat.
    const request = ended.reason === 'request';
    const body = said
      ? request
        ? tr(
            '{name} wrote to you and talked with me. {summary} Their message is in your requests: reply, or leave it.',
            { name: callerName, summary: said },
          )
        : tr('{name} wrote to you and talked with me. {summary} Reply when you can.', {
            name: callerName,
            summary: said,
          })
      : request
        ? tr(
            '{name} wrote to you and talked with me. Their message is in your requests: reply, or leave it.',
            { name: callerName },
          )
        : tr('{name} wrote to you and talked with me. Reply when you can.', { name: callerName });
    const { message } = await postAs(
      ctx,
      CAI_ID,
      chat.id,
      { kind: 'text', body, payload: { answered: { conversationId, callerId: ended.caller_id } } },
      { serverPayload: true },
    );
    await ctx.db
      .updateTable('cai_answering')
      .set({ summary_message_id: message.id })
      .where('id', '=', ended.id)
      .execute();
    await notify(ctx, {
      userId: ended.receiver_id,
      kind: 'cai',
      level: 'attention',
      title: () => tr('Cai talked with {name} for you', { name: callerName }),
      body: said,
      data: { conversationId },
      groupKey: `cai-answered:${conversationId}`,
    });
  });
}

/** Where Cai answering stands in a conversation, for whoever reads its view (null for none). */
export async function caiAnsweringView(
  ctx: AppContext,
  conversationId: string,
  viewerId: string,
): Promise<CaiAnsweringView | null> {
  const a = await answeringOf(ctx, conversationId);
  if (!a || (a.caller_id !== viewerId && a.receiver_id !== viewerId)) return null;
  return {
    state: a.state,
    receiverId: a.receiver_id,
    side: a.caller_id === viewerId ? 'caller' : 'receiver',
    talk: a.talk,
    covered: a.covered,
  };
}

export function registerCaiAnswers(): void {
  registerJob(ANSWER_JOB, answerJob);
  registerJob(WAIT_JOB, waitJob);
}
