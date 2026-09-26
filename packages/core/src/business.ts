/**
 * The Business inbox (PRD §37–38, R15): a customer's conversation with an organization, as its
 * team works it. A thread's state is derived, never set by hand, so it can't drift from what
 * happened: who wrote last says whose turn it is, and only resolving and escalating are choices.
 */

export const THREAD_STATES = [
  'new',
  'customer_waiting',
  'waiting',
  'escalated',
  'resolved',
] as const;
export type ThreadState = (typeof THREAD_STATES)[number];

export const THREAD_STATE_LABELS: Record<ThreadState, string> = {
  new: 'New',
  customer_waiting: 'Customer waiting',
  waiting: 'Waiting on customer',
  escalated: 'Escalated',
  resolved: 'Resolved',
};

/**
 * The inbox's views, the one that needs the team first. A thread can be in more than one
 * (assigned to me and customer waiting).
 */
export const BUSINESS_VIEWS = [
  'customer_waiting',
  'new',
  'mine',
  'waiting',
  'escalated',
  'resolved',
] as const;
export type BusinessView = (typeof BUSINESS_VIEWS)[number];

export const BUSINESS_VIEW_LABELS: Record<BusinessView, string> = {
  new: 'New',
  mine: 'Assigned to me',
  customer_waiting: 'Customer waiting',
  waiting: 'Waiting on customer',
  escalated: 'Escalated',
  resolved: 'Resolved',
};

export interface ThreadFacts {
  assigneeId: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
  /**
   * Each side's last message by its place in the conversation (0: never). Order, not time:
   * two messages can share a millisecond, never a place.
   */
  lastCustomerSeq: number;
  lastTeamSeq: number;
  lastCustomerAt: string | null;
}

/** Has the customer written since the team last did? */
export function customerWaiting(t: ThreadFacts): boolean {
  return t.lastCustomerSeq > t.lastTeamSeq;
}

/** The one state a thread shows: resolved, then escalated, then new, then whose turn it is. */
export function threadState(t: ThreadFacts): ThreadState {
  if (t.resolvedAt) return 'resolved';
  if (t.escalatedAt) return 'escalated';
  if (!t.assigneeId && t.lastTeamSeq === 0) return 'new';
  return customerWaiting(t) ? 'customer_waiting' : 'waiting';
}

export function inBusinessView(view: BusinessView, t: ThreadFacts, me: string): boolean {
  if (view === 'resolved') return t.resolvedAt !== null;
  if (t.resolvedAt) return false;
  switch (view) {
    case 'new':
      return !t.assigneeId && t.lastTeamSeq === 0;
    case 'mine':
      return t.assigneeId === me;
    case 'customer_waiting':
      return customerWaiting(t);
    case 'waiting':
      return !customerWaiting(t) && t.lastTeamSeq > 0;
    case 'escalated':
      return t.escalatedAt !== null;
  }
}

/** Since when the customer has been waiting for an answer, or null when it isn't their wait. */
export function waitingSince(t: ThreadFacts): string | null {
  return !t.resolvedAt && customerWaiting(t) ? t.lastCustomerAt : null;
}

/** "4 min", "2 h", "3 days": how long, for a row that has little room. */
export function waitedFor(since: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(since)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}
