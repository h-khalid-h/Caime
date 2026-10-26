/**
 * What follows a card's move, whoever moved it (review 2026-10-09 M11): the kit route when
 * someone taps, and a Checkout payment settled from Stripe (R65) run the same after-effects, so
 * a card paid by card tells the same people a hand-made "paid" does. The brief is queued when
 * a meeting or an appointment is agreed, the event recorded, everyone shown the card as it
 * stands, its people's own calendars put in step (R96), the organization's apps told, and the
 * other side notified. Ending a Pay card's open
 * session (`expireCheckout`) stays with the route: a payment settled here has none left to end.
 */
import {
  askedBy,
  type CardKitId,
  customState,
  isCustomCard,
  KITS,
  kitStateLabel,
  type MessageView,
  type PaysShare,
  standsAside,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import { cardAsks } from '@caime/core/kit-states';
import type { AppContext } from '../context';
import type { Message } from '../db/schema';
import { mailProvisionalBooker } from './booking-mail';
import { queueBrief } from './briefs';
import type { CustomerMask } from './business';
import { queueCalendarPush } from './calendar-push';
import { recordEvent } from './events';
import { tellCardApp } from './kits';
import { queueCancellation, queueInvitationAnswer } from './mail-out';
import { tellGuestsCancelled } from './meeting-guests';
import { queueNextTime } from './meeting-series';
import { queueMeetingStart } from './meeting-start';
import { messageViews, participantsOf } from './messages';
import { notify } from './notify';

export async function afterCardMove(
  ctx: AppContext,
  m: Message,
  input: {
    from: string;
    to: string;
    actorId: string;
    business: CustomerMask | null;
    /** What the others are told happened, as a key, when it isn't the state's own name. */
    label?: string;
    /** The move asks the others where they stand (another time, M16 F5): it matters to them. */
    asks?: boolean;
  },
): Promise<MessageView> {
  const { from, to, actorId, business } = input;
  const card = (m.payload ?? {}) as {
    kit?: string;
    title?: string;
    share?: PaysShare;
    askLine?: string;
  };
  const own = isCustomCard(m.payload) ? m.payload : null;
  const onTeam = (userId: string | null) => Boolean(business && userId !== business.customerId);
  // Agreed (R58): its people get a brief an hour before.
  if (
    (card.kit === 'meeting' && to === 'accepted') ||
    (card.kit === 'appointment' && to === 'confirmed')
  )
    await queueBrief(ctx, m.id);
  // Held on Caime (R83; an appointment that says so, M16 F6): at its time, its people are told
  // it's starting, with its Join; and one that repeats (R58) posts its next time when this one
  // ends (an appointment books it).
  if (
    (card.kit === 'meeting' && to === 'accepted') ||
    (card.kit === 'appointment' && to === 'confirmed')
  ) {
    await queueMeetingStart(ctx, m.id);
    await queueNextTime(ctx, m.id);
  }
  // A card asks until the move that answers it (M14): answered, it no longer needs anyone, and
  // nor does the line that said another time was suggested (M16 F5).
  if (card.askLine)
    await ctx.db
      .updateTable('messages')
      .set({ is_request: false })
      .where('id', '=', card.askLine)
      .where('is_request', '=', true)
      .execute();
  const asks = cardAsks(m.payload);
  if (asks !== m.is_request)
    await ctx.db.updateTable('messages').set({ is_request: asks }).where('id', '=', m.id).execute();
  const moved: Message = asks === m.is_request ? m : { ...m, is_request: asks };
  const members = (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id);
  const [view] = await messageViews(ctx.db, [moved], actorId);
  if (!view) throw new Error('A moved card has no view');
  await recordEvent(ctx.db, 'kit.moved', actorId, { messageId: m.id, kit: card.kit, to });
  await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
  // Its people's own calendars follow it (R96): agreed, cancelled, declined, done.
  if (card.kit === 'meeting' || card.kit === 'appointment') await queueCalendarPush(ctx, members);
  // The organization's apps hear who moved it, unless one of them did (PRD §74).
  if (business) await tellCardApp(ctx, m, business, actorId, 'kit.moved', { from, to });
  // A customer who booked before an account has no device to be told on: confirmed or
  // cancelled reaches them by mail, with the event for their calendar, and a confirmed one is
  // recalled the day before (R97 (1), C1b, C1c), whether an organization or a person is the host.
  if (card.kit === 'appointment' && (to === 'confirmed' || to === 'cancelled'))
    await mailProvisionalBooker(ctx, moved, to, actorId);
  // A meeting or an appointment that went to someone by mail (M16 F3), cancelled here: the
  // cancellation goes by mail too, with the update that takes it off their calendar.
  if (card.kit === 'meeting' || card.kit === 'appointment')
    await queueCancellation(ctx, moved, to, actorId);
  // An invitation from someone's calendar answered here (M16 F4): the answer goes back to it.
  if (card.kit === 'meeting') await queueInvitationAnswer(ctx, moved, to, actorId);
  // A meeting's guests (R84), called off: the cancellation takes it off their calendars (M16 F5).
  if (card.kit === 'meeting' && to === 'cancelled') await tellGuestsCancelled(ctx, moved);
  const mover = await ctx.db
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', actorId)
    .executeTakeFirstOrThrow();
  // Everyone else hears it; an answer to what the sender asked matters more than an update.
  // In a business conversation, the other side does: the customer hears the organization.
  for (const userId of members) {
    if (userId === actorId) continue;
    // A share's Pay card (R62) is its two sides' alone: the rest of a group isn't told of it.
    if (standsAside(card, userId, m.sender_id)) continue;
    if (business && onTeam(userId) === onTeam(actorId)) continue;
    if (business && onTeam(userId) && userId !== m.sender_id) continue;
    await notify(ctx, {
      userId,
      kind: 'kit',
      level:
        input.asks || userId === askedBy(m.payload ?? {}, m.sender_id) ? 'attention' : 'activity',
      title: () =>
        `${business && !onTeam(userId) ? business.orgName : mover.display_name}: ${own ? customState({ ...own, state: to }).label : tr(input.label ?? kitStateLabel(to))}`,
      body: () => `${own ? own.label : tr(KITS[card.kit as CardKitId].name)} · ${card.title ?? ''}`,
      // A card's moves are one notification, its latest.
      groupKey: `kit:${m.id}`,
      data: { conversationId: m.conversation_id, messageId: m.id },
    });
  }
  return view;
}
