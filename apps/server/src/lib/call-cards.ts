/**
 * Which meeting a call is (M16 F6e). Decided once, as the call is placed, and kept on it
 * (`calls.card_id`): the meeting or appointment held here in that conversation whose Join is open
 * then (core `meetingAction`, the card's own rule: agreed, held on Caime, from `JOIN_EARLY_MS`
 * before it to `JOIN_LATE_MS` after it was to end), the one starting nearest; none, and the call is
 * nobody's meeting. However it was started, the card's Join or the conversation's call button, a
 * call there then is the meeting, as a room booked for the hour is where the meeting is held. What
 * came of it is read by that link alone: Cai's notes of the meeting's call, for whoever was in it
 * (`notesOfCards`), which its calendar event links and its short address opens.
 */
import { holdsCalls, JOIN_EARLY_MS, JOIN_LATE_MS, meetingAction } from '@caime/core/meetings';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { joinedHere } from './card-events';
import { readableBy } from './messages';
import type { CardAhead } from './upcoming';

/** The longest a card held here lasts (core `cardEndMs` caps its minutes at a day). */
const CARD_MAX_MS = 24 * 3_600_000;

type Db = Kysely<Database> | Transaction<Database>;

type CardPayload = {
  kit?: unknown;
  state?: unknown;
  fields?: Record<string, unknown> | null;
  movedTo?: unknown;
  invitation?: unknown;
  booking?: { endAt?: unknown } | null;
};

/** The meeting a call placed now in this conversation is, or null. */
export async function meetingNow(
  db: Db,
  conversation: { id: string; kind: string },
  now: Date,
): Promise<string | null> {
  if (!holdsCalls(conversation.kind)) return null;
  const t = now.getTime();
  const rows = await db
    .selectFrom('messages')
    .select(['id', 'card_start_at', 'payload'])
    .where('conversation_id', '=', conversation.id)
    .where('kind', '=', 'kit')
    .where('deleted_at', 'is', null)
    .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
    .where('card_start_at', '>', new Date(t - CARD_MAX_MS - JOIN_LATE_MS))
    .where('card_start_at', '<=', new Date(t + JOIN_EARLY_MS))
    .execute();
  let best: { id: string; off: number } | null = null;
  for (const r of rows) {
    const p = (r.payload ?? {}) as CardPayload;
    if (meetingAction(p, now) !== 'join' || !r.card_start_at) continue;
    const off = Math.abs(r.card_start_at.getTime() - t);
    if (!best || off < best.off) best = { id: r.id, off };
  }
  return best?.id ?? null;
}

/** Where a call's notes are: its line in the meeting's conversation. */
export interface CardNotes {
  callId: string;
  seq: number;
}

/**
 * Cai's notes of each card's call, for one reader (M16 F6e): of the cards joined here that have
 * begun, the latest call that was the meeting whose notes are written, that they were in, its line
 * still theirs to read. One query for the set, none when nothing has begun. What they may read in
 * the notes is the notes' own rule (`summaryFor`); this says only where they are.
 */
export async function notesOfCards(
  ctx: AppContext,
  userId: string,
  cards: CardAhead[],
): Promise<Map<string, CardNotes>> {
  const now = ctx.now().getTime();
  return notesOf(
    ctx,
    userId,
    cards
      .filter((c) => joinedHere(c) && c.at.getTime() - JOIN_EARLY_MS <= now)
      .map((c) => c.messageId),
  );
}

/** The same, by the cards' ids. */
export async function notesOf(
  ctx: AppContext,
  userId: string,
  cardIds: string[],
): Promise<Map<string, CardNotes>> {
  const out = new Map<string, CardNotes>();
  const ids = [...new Set(cardIds)];
  if (ids.length === 0) return out;
  const rows = await ctx.db
    .selectFrom('calls')
    .innerJoin('call_note_summaries as s', 's.call_id', 'calls.id')
    .innerJoin('messages as line', 'line.id', 's.message_id')
    .select(['calls.card_id', 'calls.id as call_id', 'line.seq'])
    .distinctOn('calls.card_id')
    .where('calls.card_id', 'in', ids)
    .where('s.state', '=', 'written')
    .where(readableBy(userId, ctx.now(), 'line'))
    .where((eb) =>
      eb.or([
        eb.and([
          eb('calls.is_group', '=', false),
          eb('calls.answered_at', 'is not', null),
          eb.or([eb('calls.caller_id', '=', userId), eb('calls.callee_id', '=', userId)]),
        ]),
        eb.and([
          eb('calls.is_group', '=', true),
          eb.exists(
            eb
              .selectFrom('call_members as cm')
              .select(sql<number>`1`.as('one'))
              .whereRef('cm.call_id', '=', 'calls.id')
              .where('cm.user_id', '=', userId)
              .where('cm.joined_at', 'is not', null),
          ),
        ]),
      ]),
    )
    .orderBy('calls.card_id')
    .orderBy('calls.created_at', 'desc')
    .execute();
  for (const r of rows)
    if (r.card_id) out.set(r.card_id, { callId: r.call_id, seq: Number(r.seq) });
  return out;
}
