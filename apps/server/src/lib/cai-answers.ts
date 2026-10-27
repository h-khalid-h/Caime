/**
 * Cai answers for someone who turned it on (R116, M17 I16a, ADR-18; the council in
 * docs/REVIEW-2026-10-25-CAI.md §7). Phase one: a stranger's message request.
 *
 * - When someone not connected with them writes first (a message request), Cai answers in that
 *   one-to-one for them, once: who it is, for whom, that they haven't read it yet (R87's
 *   introduction), and two choices, "Leave my message" (free, the request as it always was) and
 *   "Talk to Cai now" (on the stranger's own AI allowance, offered to an adult with assist on).
 * - Talking, the stranger's lines carry `payload.toCai` and pass the request's one-message rule up
 *   to a cap a day (`talkingToCai`, read by `sendMessage`). Cai answers each from what the stranger
 *   may know of the receiver (`aboutFor`: their profile as the privacy evaluator shows it to the
 *   stranger, what they offer to everyone, whether they're busy where that's allowed), never the
 *   receiver's label for them or another conversation, through `runAi('cai-answer')` on the
 *   stranger's id.
 * - It ends when the stranger is done, at `CAI_ANSWER_TURNS`, when the allowance runs out, or when
 *   the receiver replies or declines (`endCaiAnswer`); unless the receiver answered themselves,
 *   Cai tells them in their own chat with Cai what was asked and what to do.
 *
 * Cai's lines are Cai's (`insertCaiLine`): messages from Cai's fixed id marked
 * `payload.answering`, never through `sendMessage`, never with Cai as a member, and no message
 * effects run for them. Nothing here reaches someone under 18 on either side, a private
 * conversation, mail, or an organization's conversation.
 */
import {
  CAI_ANSWER_LINES_A_DAY,
  CAI_ANSWER_TURNS,
  type CaiAnswerChoice,
  type CaiAnswerEnd,
  type CaiAnsweringState,
  type CaiAnsweringView,
  canSee,
  firstName,
  formatAmount,
  isBooked,
  previewText,
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
import { viewerRelation } from './relations';
import { openSystemConversation } from './system-accounts';
import { transcriptClock } from './transcript';
import { transcriptOf } from './transcript-of';
import { minorOf, privacyOf } from './users';

const ANSWER_JOB = 'cai.answer';

/** What someone turned on, read from their preferences; off when never chosen. */
export function caiAnswersOn(preferences: unknown): boolean {
  const p = (preferences ?? {}) as { caiAnswers?: { strangers?: unknown } };
  return p.caiAnswers?.strangers === true;
}

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

/**
 * A stranger's first message to someone who turned Cai on (from the message's effects, for a
 * one-to-one whose receiver hasn't answered the request): Cai introduces itself for them, once a
 * conversation, in the caller's language, with the choices the caller may take.
 */
export async function offerCaiAnswer(
  ctx: AppContext,
  message: Pick<Message, 'conversation_id' | 'seq' | 'sender_id' | 'channel' | 'body' | 'sealed'>,
  receiverId: string,
): Promise<void> {
  const callerId = message.sender_id;
  if (!callerId || message.channel === 'mail' || message.sealed) return;
  if (systemAccountOf(callerId) || systemAccountOf(receiverId)) return;
  const [receiver, caller] = await Promise.all(
    [receiverId, callerId].map((id) =>
      ctx.db
        .selectFrom('users')
        .select([
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
        ])
        .where('id', '=', id)
        .executeTakeFirst(),
    ),
  );
  if (!receiver || !caller || receiver.deleted_at || receiver.suspended_at) return;
  // A person on Caime for a person on Caime, both adults (R29): never mail, never a child.
  if (receiver.kind !== 'human' || caller.kind !== 'human') return;
  if (minorOf(receiver, ctx.now()) || minorOf(caller, ctx.now())) return;
  if (!receiver.ai_enabled || !caiAnswersOn(receiver.preferences)) return;
  // A stranger's request is answered once: never again in that conversation.
  if (await answeringOf(ctx, message.conversation_id)) return;
  const talk = await mayTalk(ctx, callerId);
  const made = await ctx.db
    .insertInto('cai_answering')
    .values({
      id: uuidv7(),
      conversation_id: message.conversation_id,
      receiver_id: receiverId,
      caller_id: callerId,
      state: 'offered',
      talk,
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
  const said = { name: firstName(caller.display_name), receiver: receiver.display_name };
  const line = await inCallersWords(ctx, callerId, message.body, () =>
    talk
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
  // Both views say Cai answers here now (the stranger's choices, above their composer).
  await tellViews(ctx, {
    conversation_id: message.conversation_id,
    caller_id: callerId,
    receiver_id: receiverId,
  });
  ctx.metrics.caiAnswers.inc({ scope: 'person', payer: 'none', outcome: 'offered' });
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
 * left as it was, or a talk with Cai now on their own allowance (`aiGate`'s rules: an adult with
 * assist on and room left). Theirs alone, once, while it's offered.
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
  if (choice === 'talk') {
    if (!a.talk || !(await mayTalk(ctx, callerId)))
      throw forbidden(tr('Talking to Cai is for adults with AI assist on.'));
    await assertAiAllowance(ctx, callerId);
  }
  const moved = await ctx.db
    .updateTable('cai_answering')
    .set(
      choice === 'talk'
        ? { state: 'talking', payer_id: callerId }
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
    payer: choice === 'talk' ? 'caller' : 'none',
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
  if (!a || a.state !== 'talking' || a.caller_id !== senderId) return false;
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
  if (!a || a.state !== 'talking' || a.caller_id !== m.sender_id) return;
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
  let out: { reply: string; done: boolean; summary: string };
  try {
    await assertAiAllowance(ctx, payer);
    const [about, { transcript }, callerLanguage, receiverLanguage] = await Promise.all([
      aboutFor(ctx, a.receiver_id, a.caller_id),
      // From the stranger's first line on: never what came before it (bounded by the turns).
      transcriptOf(ctx, a.caller_id, m.conversation_id, 0, zone, {
        fromSeq: Number(a.from_seq),
      }),
      languageOf(ctx, a.caller_id),
      languageOf(ctx, a.receiver_id),
    ]);
    out = await runAi(ctx, 'cai-answer', payer, () =>
      ai.answerFor({
        receiver: receiverName,
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
  if (out.done) await endCaiAnswer(ctx, m.conversation_id, 'handed_over', out.summary);
  else if (turns >= CAI_ANSWER_TURNS)
    await endCaiAnswer(ctx, m.conversation_id, 'limit', out.summary);
}

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
    .returning(['id', 'conversation_id', 'receiver_id', 'caller_id', 'payer_id', 'turns', 'state'])
    .executeTakeFirst();
  if (!ended) return;
  await tellViews(ctx, ended);
  ctx.metrics.caiAnswers.inc({
    scope: 'person',
    payer: ended.payer_id ? 'caller' : 'none',
    outcome: by,
  });
  if (by === 'receiver' || by === 'declined' || ended.turns === 0) return;
  const callerName = await nameOf(ctx, ended.caller_id);
  const said = summary?.trim() ? truncate(summary.trim(), 600) : null;
  await asReader(ctx, ended.receiver_id, async () => {
    const cai = systemAccountOf(CAI_ID)!;
    const chat = await openSystemConversation(ctx, ended.receiver_id, cai);
    const body = said
      ? tr(
          '{name} wrote to you and talked with me. {summary} Their message is in your requests: reply, or leave it.',
          {
            name: callerName,
            summary: said,
          },
        )
      : tr(
          '{name} wrote to you and talked with me. Their message is in your requests: reply, or leave it.',
          {
            name: callerName,
          },
        );
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
  };
}

export function registerCaiAnswers(): void {
  registerJob(ANSWER_JOB, answerJob);
}
