import { describe, expect, it } from 'vitest';
import {
  BUSINESS_VIEWS,
  inBusinessView,
  replyTimeText,
  type ThreadFacts,
  threadState,
  waitedFor,
  waitingSince,
} from './business';

const base: ThreadFacts = {
  assigneeId: null,
  escalatedAt: null,
  resolvedAt: null,
  lastCustomerSeq: 1,
  lastTeamSeq: 0,
  lastCustomerAt: '2026-09-26T10:00:00Z',
};
const views = (t: ThreadFacts, me = 'sara') =>
  BUSINESS_VIEWS.filter((v) => inBusinessView(v, t, me));

describe('business threads', () => {
  it('reads its state from what happened', () => {
    expect(threadState(base)).toBe('new');
    expect(views(base)).toEqual(['customer_waiting', 'new']);

    const answered = { ...base, assigneeId: 'sara', lastTeamSeq: 2 };
    expect(threadState(answered)).toBe('waiting');
    expect(views(answered)).toEqual(['mine', 'waiting']);
    expect(views(answered, 'omar')).toEqual(['waiting']);

    // Written in the same millisecond as the answer, and still after it.
    const again = { ...answered, lastCustomerSeq: 3, lastCustomerAt: '2026-09-26T10:09:00Z' };
    expect(threadState(again)).toBe('customer_waiting');
    expect(waitingSince(again)).toBe('2026-09-26T10:09:00Z');
    expect(waitingSince(answered)).toBeNull();

    const escalated = { ...again, escalatedAt: '2026-09-26T10:10:00Z' };
    expect(threadState(escalated)).toBe('escalated');
    expect(views(escalated)).toEqual(['customer_waiting', 'mine', 'escalated']);

    const resolved = { ...escalated, resolvedAt: '2026-09-26T11:00:00Z' };
    expect(threadState(resolved)).toBe('resolved');
    expect(views(resolved)).toEqual(['resolved']);
    expect(waitingSince(resolved)).toBeNull();
  });

  it('says how long in a few characters', () => {
    const now = new Date('2026-09-26T12:00:00Z');
    expect(waitedFor('2026-09-26T11:59:40Z', now)).toBe('just now');
    expect(waitedFor('2026-09-26T11:56:00Z', now)).toBe('4 min');
    expect(waitedFor('2026-09-26T09:30:00Z', now)).toBe('2 h');
    expect(waitedFor('2026-09-25T11:00:00Z', now)).toBe('1 day');
    expect(waitedFor('2026-09-22T12:00:00Z', now)).toBe('4 days');
  });

  it('writes a reply time the way a person would say it', () => {
    expect(replyTimeText(0.4)).toBe('under a minute');
    expect(replyTimeText(12.3)).toBe('12 min');
    expect(replyTimeText(60)).toBe('1 h');
    expect(replyTimeText(125)).toBe('2 h 5 min');
    expect(replyTimeText(26 * 60)).toBe('1 day');
    expect(replyTimeText(3 * 24 * 60)).toBe('3 days');
  });
});
