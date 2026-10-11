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
