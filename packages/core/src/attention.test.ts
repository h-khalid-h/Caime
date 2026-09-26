import { describe, expect, it } from 'vitest';
import {
  type AttentionInput,
  attentionHeadline,
  classifyAttention,
  groupBySection,
} from './attention';

const now = new Date('2026-09-23T14:00:00Z');
const base: AttentionInput = {
  archived: false,
  isMessageRequest: false,
  mutedUntil: null,
  override: 'auto',
  unreadCount: 0,
  unreadMentions: 0,
  lastActivityAt: '2026-09-23T13:00:00Z',
  pendingInbound: null,
  awaitingReply: null,
  followUpDue: false,
  openRequestsToMe: 0,
  overdueToMe: 0,
  dueSoonToMe: 0,
  waitingOnThem: 0,
  relationship: { priorityNow: 'normal', label: 'Colleague · DATA C' },
};
const at = (patch: Partial<AttentionInput>) => classifyAttention({ ...base, ...patch }, now);

describe('attention sections', () => {
  it('a question from the other side needs me, with the reason and the relationship', () => {
    const r = at({
      unreadCount: 1,
      pendingInbound: {
        isQuestion: true,
        isRequest: false,
        at: '2026-09-23T13:00:00Z',
        dismissed: false,
      },
    });
    expect(r.section).toBe('needs_you');
    expect(r.reasons.map((x) => x.label)).toEqual(['Asked you a question', 'Colleague · DATA C']);
  });

  it('a dismissed question does not (R8: "Doesn\'t need me")', () => {
    const r = at({
      unreadCount: 1,
      pendingInbound: {
        isQuestion: true,
        isRequest: false,
        at: '2026-09-23T13:00:00Z',
        dismissed: true,
      },
    });
    expect(r.section).toBe('recent');
  });

  it('plain unread chat is Recent, not Needs you', () => {
    expect(at({ unreadCount: 3 }).section).toBe('recent');
  });

  it('priority relationships with unread are Important', () => {
    const r = at({
      unreadCount: 2,
      relationship: { priorityNow: 'priority', label: 'Manager · DATA C' },
    });
    expect(r.section).toBe('important');
    expect(r.reasons[0]).toEqual({ code: 'priority_relationship', label: 'Manager · DATA C' });
  });

  it('waiting: my open waiting item and nothing new', () => {
    expect(at({ waitingOnThem: 1 }).section).toBe('waiting');
    expect(at({ awaitingReply: { at: '2026-09-22T10:00:00Z' } }).reasons[0]?.code).toBe(
      'awaiting_reply',
    );
  });

  it('a follow-up that is due needs me', () => {
    expect(at({ awaitingReply: { at: '2026-09-21T10:00:00Z' }, followUpDue: true }).section).toBe(
      'needs_you',
    );
  });

  it('the user is the authority: quiet and muted win over ordinary activity', () => {
    expect(at({ unreadCount: 5, override: 'quiet' }).section).toBe('quiet');
    expect(at({ unreadCount: 5, mutedUntil: '2026-09-24T00:00:00Z' }).section).toBe('quiet');
    expect(at({ unreadCount: 5, mutedUntil: '2026-09-20T00:00:00Z' }).section).toBe('recent');
  });

  it('...but a mention, an overdue item or a request for me still surfaces', () => {
    expect(at({ override: 'quiet', unreadMentions: 1 }).section).toBe('needs_you');
    expect(at({ archived: true, overdueToMe: 1 }).section).toBe('needs_you');
    expect(at({ mutedUntil: '2026-09-24T00:00:00Z', openRequestsToMe: 1 }).section).toBe(
      'needs_you',
    );
  });

  it('archived and message requests have their own places', () => {
    expect(at({ archived: true, unreadCount: 2 }).section).toBe('archived');
    expect(at({ isMessageRequest: true, unreadCount: 1 }).section).toBe('requests');
  });

  it('quiet relationships (e.g. Public) sit in Quiet unless I raise them', () => {
    expect(
      at({ unreadCount: 1, relationship: { priorityNow: 'quiet', label: 'Public figure' } })
        .section,
    ).toBe('quiet');
    expect(
      at({
        unreadCount: 1,
        override: 'priority',
        relationship: { priorityNow: 'quiet', label: 'Public figure' },
      }).section,
    ).toBe('important');
  });

  it('within Needs you, overdue ranks above a question', () => {
    const overdue = at({ overdueToMe: 1, lastActivityAt: '2026-09-20T00:00:00Z' });
    const question = at({
      pendingInbound: {
        isQuestion: true,
        isRequest: false,
        at: '2026-09-23T13:59:00Z',
        dismissed: false,
      },
    });
    expect(overdue.rank).toBeGreaterThan(question.rank);
  });
});

describe('grouping and headline', () => {
  it('groups in section order and omits empty sections', () => {
    const items = [at({ unreadCount: 1 }), at({ overdueToMe: 1 }), at({ waitingOnThem: 1 })];
    const groups = groupBySection(items, (r) => r);
    expect(groups.map((g) => g.section)).toEqual(['needs_you', 'waiting', 'recent']);
  });

  it('speaks in attention, not unread totals', () => {
    expect(attentionHeadline({ needs_you: 3 })).toBe('3 need you');
    expect(attentionHeadline({ needs_you: 1 })).toBe('1 needs you');
    expect(attentionHeadline({ recent: 40 })).toBe('You’re all caught up');
  });
});
