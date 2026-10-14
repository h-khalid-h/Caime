/**
 * A card's states (`kit-cards.ts`), apart: their English labels (the catalog's keys, shown
 * through `tr`) and whether each reads as good news. Light on purpose: a screen that lists
 * cards by state (the Business inbox's Orders view) imports this, never the whole card module,
 * which would move the kit definitions into the web's startup chunk.
 */
import { msg } from './i18n';

/** Every state a kit moves through, in English (the catalog's key): shown through `tr`. */
const STATE_LABELS: Record<string, string> = {
  pending: msg('Waiting for an answer'),
  in_transit: msg('On its way'),
  in_review: msg('In review'),
  in_progress: msg('In progress'),
  changes_requested: msg('Changes asked for'),
  out_for_delivery: msg('Out for delivery'),
  void: msg('Voided'),
  problem: msg('Problem reported'),
  waiting: msg('Waiting on a reply'),
  accepted: msg('Accepted'),
  approved: msg('Approved'),
  cancelled: msg('Cancelled'),
  closed: msg('Closed'),
  confirmed: msg('Confirmed'),
  declined: msg('Declined'),
  delivered: msg('Delivered'),
  done: msg('Done'),
  fulfilled: msg('Fulfilled'),
  open: msg('Open'),
  overdue: msg('Overdue'),
  paid: msg('Paid'),
  placed: msg('Placed'),
  ready: msg('Ready'),
  proposed: msg('Proposed'),
  rejected: msg('Rejected'),
  requested: msg('Requested'),
  resolved: msg('Resolved'),
  sent: msg('Sent'),
  not_received: msg('Not received yet'),
  settled: msg('Settled'),
  shared: msg('Shared'),
  shipped: msg('Shipped'),
};
const POSITIVE = new Set([
  'approved',
  'accepted',
  'paid',
  'delivered',
  'done',
  'resolved',
  'fulfilled',
  'confirmed',
  'ready',
]);
const NEGATIVE = new Set([
  'rejected',
  'declined',
  'cancelled',
  'void',
  'problem',
  'overdue',
  'changes_requested',
  'not_received',
]);

/** A state's English label, the catalog's key: the app and the server show it through `tr`. */
export function kitStateLabel(state: string): string {
  const label = STATE_LABELS[state] ?? state.replaceAll('_', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function kitStateTone(state: string): 'positive' | 'negative' | 'neutral' {
  return POSITIVE.has(state) ? 'positive' : NEGATIVE.has(state) ? 'negative' : 'neutral';
}

/** The state in which a meeting or an appointment is agreed: a calendar's, a brief's, the slots'. */
export const AGREED_STATES: Record<'meeting' | 'appointment', string> = {
  meeting: 'accepted',
  appointment: 'confirmed',
};

/**
 * An appointment that holds its time: asked for, or confirmed (R51). The team's Bookings and the
 * weekly digest's count of what's ahead (R87) read the same.
 */
export const HELD_APPOINTMENT_STATES: readonly string[] = ['requested', 'confirmed'];

/** An order that is still the team's to do: neither delivered nor cancelled (R60, R87). */
export const OPEN_ORDER_STATES: readonly string[] = ['placed', 'confirmed', 'ready', 'shipped'];

/**
 * The states in which a card asks something of whoever received it (review 2026-10-09 M14): a
 * yes or no, a time, a review, a confirmation, an invoice or a request to be paid. A card in one
 * of them is a request, as a message that asks is (`is_request`): the inbox says "Asked you to do
 * something", and the ask ends with the move that answers it. A Pay card that pays
 * (`direction: 'send'`) asks nothing: it tells.
 */
export const ASKING_STATES: Record<string, readonly string[]> = {
  approval: ['pending'],
  meeting: ['proposed'],
  document_review: ['requested', 'in_review'],
  order_status: ['placed'],
  invoice: ['sent', 'overdue'],
  purchase_order: ['sent'],
  payment_request: ['requested'],
  support_ticket: ['open'],
  appointment: ['requested'],
};

/** Whether a card, as its payload stands, asks something of whoever received it. */
export function cardAsks(payload: unknown): boolean {
  const card = payload as {
    kit?: unknown;
    state?: unknown;
    fields?: { direction?: unknown } | null;
  } | null;
  if (!card || typeof card.kit !== 'string' || typeof card.state !== 'string') return false;
  if (card.kit === 'payment_request' && card.fields?.direction === 'send') return false;
  return ASKING_STATES[card.kit]?.includes(card.state) ?? false;
}

/**
 * A card with a due date that is still owed (M14): a Pay card asked, said paid but not yet
 * received, or not received; an invoice sent or overdue. The calendar shows it on its day.
 */
export const DUE_STATES: Record<'payment_request' | 'invoice', readonly string[]> = {
  payment_request: ['requested', 'sent', 'not_received'],
  invoice: ['sent', 'overdue'],
};
