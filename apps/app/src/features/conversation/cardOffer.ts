/**
 * The card someone else's message could be answered with (M17 I9b): the server reads it as the
 * message is sent, on its writer's clock, and keeps it with the message's entities; a reader is
 * offered that card, filled and replying to it. A meeting keeps its instant, so a reader elsewhere
 * gets the same time; a Pay card goes the other way (asked to pay, they pay; told they'll be paid,
 * they ask for it). Nothing is sent but what the reader sends.
 */
import type { MessageView } from '@caime/core/api';
import type { KeptCardOffer } from '@caime/core/card-offer';
import type { KitChoice, KitStart } from '@/features/kits/KitForm';

export function offerOf(m: MessageView | null | undefined): KeptCardOffer | null {
  const o = (m?.entities as { offer?: KeptCardOffer } | undefined)?.offer;
  if (!o || typeof o !== 'object') return null;
  if (o.kind === 'meeting' && typeof o.at === 'string') return o;
  if (o.kind === 'pay' && typeof o.value === 'number' && o.value > 0) return o;
  return null;
}

/** The card to open for it, and what it opens with. */
export function answerFor(
  o: KeptCardOffer,
  replyToId: string,
  title: string,
): { kit: KitChoice; start: KitStart } {
  return o.kind === 'meeting'
    ? { kit: 'meeting', start: { title, at: { at: o.at, hasTime: o.hasTime }, replyToId } }
    : {
        kit: 'payment_request',
        start: {
          direction: o.direction === 'ask' ? 'send' : 'ask',
          amount: { value: o.value, currency: o.currency },
          replyToId,
        },
      };
}
