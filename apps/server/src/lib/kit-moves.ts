/**
 * Moving a card (PRD §41), whoever moves it: a tap on the kit route, and the answer someone
 * reached by email gives a meeting or an appointment from their calendar (M16 F3). Who may make
 * which move is the kit's flow in core (`kitMoves`, `customMoves`); the move is applied only where
 * the card still stands, under its row's lock, with what moves with it in the same transaction
 * (an order's stock, a share's split), then what follows any move (`afterCardMove`). The route
 * keeps what is the request's alone: who's asking, an app's own cards, how often. Another time
 * for a meeting or an appointment (M16 F5, `retimeCard`) is a move of its own kind: the card asks
 * again where it stands, of the other side, and a line says so where they'll see it.
 */
import {
  type AppointmentBooking,
  askedBy,
  customMoves,
  isCardKit,
  isCustomCard,
  kitMoves,
  type MessageView,
  type PaysShare,
  RETIMES,
  type RetimeBlock,
  retimeBlock,
  standsAside,
} from '@caime/core';
import { msg, tr } from '@caime/core/i18n';
import { AGREED_STATES } from '@caime/core/kit-states';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS, type Message } from '../db/schema';
import { pickProvider } from './booking';
import type { CustomerMask } from './business';
import { afterCardMove } from './card-moves';
import { expireCheckout, stillPayableAfter } from './checkout';
import { cardStartAt } from './kits';
import { queueCardUpdate } from './mail-out';
import { askGuestsForTime } from './meeting-guests';
import { insertSystemMessage, messageViews, participantsOf } from './messages';
import { shareMoved } from './splits';
import { orderMoved, tellStockChanged } from './stock';

type CardPayload = {
  kit?: unknown;
  state?: string;
  title?: string;
  fields?: Record<string, unknown>;
  history?: Array<{ state: string; by: string; at: string }>;
  share?: PaysShare;
  /** Who suggested the time it has now (M16 F5): they're the side it asks of the other. */
  proposedBy?: string;
  /** Its calendar invitations' count (RFC 5546 SEQUENCE): one higher with each new time. */
  sequence?: number;
  /** The line that says another time was suggested, which asks while the card does. */
  askLine?: string;
  invitation?: unknown;
  movedTo?: unknown;
  booking?: unknown;
};

/**
 * Whether this person may take the card to `to` from where it stands: in a business
 * conversation the team is one side, and anyone on it acts for a card the team sent.
 */
export function mayMove(
  m: Pick<Message, 'sender_id' | 'payload'>,
  to: string,
  actorId: string,
  business: CustomerMask | null,
): boolean {
  const card = (m.payload ?? {}) as CardPayload;
  const own = isCustomCard(m.payload) ? m.payload : null;
  const onTeam = (userId: string | null) => Boolean(business && userId !== business.customerId);
  // Whoever asked for the card as it stands (its sender, or who suggested its time since).
  const asker = askedBy(card, m.sender_id);
  const senderSide = asker === actorId || (onTeam(asker) && onTeam(actorId));
  const from = card.state ?? '';
  // An organization's own card says who moves it: the organization (its team and its apps),
  // its customer, or either.
  if (own) return business ? customMoves(own, onTeam(actorId)).some((x) => x.to === to) : false;
  return (
    isCardKit(card.kit) &&
    !standsAside(card, actorId, m.sender_id) &&
    kitMoves(card.kit, from, senderSide, card.fields).some((x) => x.to === to)
  );
}

/**
 * The move made, from the state the card was read in: its view as the mover sees it, or
 * 'conflict' when someone moved it first. Check `mayMove` before.
 */
export async function moveCard(
  ctx: AppContext,
  m: Message,
  input: { to: string; actorId: string; business: CustomerMask | null },
): Promise<MessageView | 'conflict'> {
  const { to, actorId, business } = input;
  const card = (m.payload ?? {}) as CardPayload;
  const from = card.state ?? '';
  // Only if nobody moved it first, and only where it stands (merged into the card, so an app's
  // change to its fields at the same moment is kept): its row is locked while its history is
  // added to, from the row as it is, the last 50 moves kept.
  const moved = await ctx.db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('messages')
      .select(['deleted_at', 'payload'])
      .where('id', '=', m.id)
      .forUpdate()
      .executeTakeFirst();
    const now = (row?.payload ?? {}) as CardPayload;
    if (!row || row.deleted_at || now.state !== from) return null;
    const history = [...(now.history ?? []), { state: to, by: actorId, at: ctx.now() }];
    // An order's stock (R60): given back if it's cancelled, spent once it's on its way.
    const restocked = card.kit === 'order_status' ? await orderMoved(trx, m.id, to, ctx.now()) : [];
    // A share's Pay card received (R62): the share it paid is settled with it.
    const split = await shareMoved(trx, m, to, actorId, ctx.now());
    const after = await trx
      .updateTable('messages')
      .set({
        payload: sql`payload || ${JSON.stringify({ state: to, history: history.slice(-50) })}::jsonb`,
      })
      .where('id', '=', m.id)
      .returning(MESSAGE_COLUMNS)
      .executeTakeFirstOrThrow();
    return { row: after, restocked, split };
  });
  if (!moved) return 'conflict';
  await tellStockChanged(ctx, moved.restocked);
  if (moved.split) {
    const [split] = await messageViews(ctx.db, [moved.split], actorId);
    const members = (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id);
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...split, clientId: null } });
  }
  // Confirmed by the team (R58): a booking from the catalog with nobody named yet gets the free
  // member with the fewest that day; the customer never sees who (masked).
  const confirmed = await assignOnConfirm(ctx, moved.row, to, business?.orgId ?? null);
  // A Pay card settled another way (R65): its open card session ends, so nobody pays twice.
  if (card.kit === 'payment_request' && !stillPayableAfter(card.fields, to))
    await expireCheckout(ctx, m.id).catch((e) =>
      ctx.log.warn({ err: (e as Error).message }, 'checkout expire'),
    );
  // Agreeing to what came as a message request (a booking from one's public catalog, a meeting
  // proposed by someone new) answers it, as a reply does (R14): it leaves Requests.
  if ((card.kit === 'meeting' || card.kit === 'appointment') && to === AGREED_STATES[card.kit])
    await answerRequest(ctx, m.conversation_id, actorId);
  // What follows any move, a payment by card's too (M11): the brief, the event, the people.
  return afterCardMove(ctx, confirmed, { from, to, actorId, business });
}

/** Whoever agreed, if the conversation was still a request to them, has answered it. */
async function answerRequest(ctx: AppContext, conversationId: string, userId: string) {
  const answered = await ctx.db
    .updateTable('participants')
    .set({ request_state: 'accepted', archived_at: null })
    .where('conversation_id', '=', conversationId)
    .where('user_id', '=', userId)
    .where('request_state', 'in', ['pending', 'declined'])
    .executeTakeFirst();
  if (Number(answered.numUpdatedRows) > 0)
    await ctx.bus.publish(
      (await participantsOf(ctx.db, conversationId)).map((p) => p.user_id),
      { type: 'conversation.updated', data: { conversationId } },
    );
}

async function assignOnConfirm<T extends { id: string; payload: unknown }>(
  ctx: AppContext,
  row: T,
  to: string,
  orgId: string | null,
): Promise<T> {
  const p = (row.payload ?? {}) as {
    kit?: string;
    fields?: { start?: { at?: string } };
    booking?: AppointmentBooking | null;
  };
  if (to !== 'confirmed' || p.kit !== 'appointment' || !orgId || !p.booking || p.booking.providerId)
    return row;
  const start = p.fields?.start?.at ? new Date(p.fields.start.at) : null;
  if (!start) return row;
  const org = await ctx.db
    .selectFrom('organizations')
    .select(['id', 'booking', 'booking_items'])
    .where('id', '=', orgId)
    .executeTakeFirst();
  if (!org) return row;
  const who = await pickProvider(ctx, org, p.booking, start);
  if (!who) return row;
  const booking = { ...p.booking, providerId: who.id, providerName: who.name };
  const saved = await ctx.db
    .updateTable('messages')
    .set({ payload: sql`payload || ${JSON.stringify({ booking })}::jsonb` })
    .where('id', '=', row.id)
    .returning(MESSAGE_COLUMNS)
    .executeTakeFirst();
  return saved ? ({ ...row, ...saved } as T) : row;
}

/** What a person is told when a card can't take another time (M16 F5). */
function retimeSaid(block: RetimeBlock): string {
  switch (block) {
    case 'kind':
      return tr('Only a meeting or an appointment takes another time.');
    case 'series':
      return tr('Each time of a series keeps its own: cancel this one and send another.');
    case 'invitation':
      return tr('It’s their calendar’s meeting: only they can move it.');
    case 'moved':
      return tr('It has its own space now: suggest another time there.');
    case 'booking':
      return tr('A booking keeps its open time: cancel it and book another.');
    default:
      return tr('You can’t make that change to this card.');
  }
}

/**
 * Why this person can't give the card another time, said, or null when they can (M16 F5): core
 * `retimeBlock`, and only between its two sides (a share's Pay card stands others aside).
 */
export function retimeRefusal(
  m: Pick<Message, 'kind' | 'deleted_at' | 'payload' | 'sender_id'>,
  actorId: string,
): string | null {
  const p = (m.payload ?? {}) as CardPayload;
  if (m.kind !== 'kit' || m.deleted_at) return retimeSaid('kind');
  const block = retimeBlock(p);
  if (block) return retimeSaid(block);
  return standsAside(p, actorId, m.sender_id) ? retimeSaid('state') : null;
}

/**
 * Another time for a meeting or an appointment, from either side (M16 F5): written where the
 * card stands, under its lock, the card asks again (an agreed one too: what was agreed was
 * another time), now of the other side (`proposedBy`), its calendar invitations one sequence on;
 * then what follows any move, said as a new time, the line that asks the other side, the updated
 * invitation to whoever has it by mail, and the guests asked again for the new time. Check
 * `retimeRefusal` before; 'conflict' when someone moved it first.
 */
export async function retimeCard(
  ctx: AppContext,
  m: Message,
  input: {
    start: Date;
    durationMinutes?: number;
    actorId: string;
    business: CustomerMask | null;
  },
): Promise<MessageView | 'conflict'> {
  const p = (m.payload ?? {}) as CardPayload;
  const kit = p.kit === 'appointment' ? 'appointment' : 'meeting';
  const { to } = RETIMES[kit];
  const from = p.state ?? '';
  const row = await ctx.db.transaction().execute(async (trx) => {
    const now = await trx
      .selectFrom('messages')
      .select(['deleted_at', 'payload'])
      .where('id', '=', m.id)
      .forUpdate()
      .executeTakeFirst();
    const card = (now?.payload ?? {}) as CardPayload;
    if (!now || now.deleted_at || card.state !== from) return null;
    const fields = {
      ...(card.fields ?? {}),
      start: { at: input.start.toISOString(), hasTime: true },
      ...(input.durationMinutes ? { durationMinutes: input.durationMinutes } : {}),
    };
    const next = {
      fields,
      state: to,
      proposedBy: input.actorId,
      sequence: (card.sequence ?? 0) + 1,
      history: [
        ...(card.history ?? []),
        { state: to, by: input.actorId, at: ctx.now().toISOString() },
      ].slice(-50),
    };
    return trx
      .updateTable('messages')
      .set({
        payload: sql`payload || ${JSON.stringify(next)}::jsonb`,
        card_start_at: cardStartAt({ kit, fields }),
      })
      .where('id', '=', m.id)
      .returning(MESSAGE_COLUMNS)
      .executeTakeFirstOrThrow();
  });
  if (!row) return 'conflict';
  const view = await afterCardMove(ctx, row, {
    from,
    to,
    actorId: input.actorId,
    business: input.business,
    label: msg('New time'),
    asks: true,
  });
  await askAgain(ctx, row, input.actorId);
  // Whoever has it by mail gets its update, and a space's guests are asked again (their links
  // new, as for any time they're asked to).
  await queueCardUpdate(ctx, row, input.actorId);
  await askGuestsForTime(ctx, row);
  return view;
}

/**
 * The line that says another time was suggested, from whoever suggested it (M16 F5): it asks the
 * others where they'll see it (Needs you, as a card that asks does), until the card's next move
 * (`afterCardMove` lets it go, by the card's `askLine`).
 */
export async function askAgain(ctx: AppContext, card: Message, actorId: string): Promise<void> {
  const p = (card.payload ?? {}) as CardPayload;
  const line = await insertSystemMessage(
    ctx,
    card.conversation_id,
    actorId,
    'time_suggested',
    { messageId: card.id, title: p.title ?? null },
    { asks: true },
  );
  await ctx.db
    .updateTable('messages')
    .set({ payload: sql`payload || ${JSON.stringify({ askLine: line.id })}::jsonb` })
    .where('id', '=', card.id)
    .execute();
  const members = (await participantsOf(ctx.db, card.conversation_id)).map((x) => x.user_id);
  const [view] = await messageViews(ctx.db, [line], actorId);
  if (view)
    await ctx.bus.publish(members, { type: 'message.created', data: { ...view, clientId: null } });
}
