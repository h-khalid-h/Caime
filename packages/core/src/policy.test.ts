import { describe, expect, it } from 'vitest';
import {
  currentPriority,
  daysText,
  decideNotification,
  defaultPolicies,
  describePolicy,
  policyEffects,
  type RelationshipPolicy,
  resolvePolicy,
} from './policy';
import { defaultWorkweek } from './time';

const policies: RelationshipPolicy[] = defaultPolicies(defaultWorkweek('US')).map((p, i) => ({
  ...p,
  id: `p${i}`,
}));
const nyWorkday10am = new Date('2026-09-23T14:00:00Z'); // Wed 10:00 New York
const nyWorkday9pm = new Date('2026-09-24T01:00:00Z'); // Wed 21:00 New York
const nySaturday = new Date('2026-09-26T15:00:00Z');
const tz = 'America/New_York';

describe('resolvePolicy', () => {
  it('uses the PRD defaults (§32, §68)', () => {
    expect(resolvePolicy(policies, { sphere: 'family' })).toMatchObject({
      notify: 'always',
      priority: 'priority',
      allowUrgent: true,
    });
    const manager = resolvePolicy(policies, { sphere: 'work', role: 'manager' });
    expect(manager).toMatchObject({
      notify: 'schedule',
      priority: 'priority',
      priorityInScheduleOnly: true,
    });
    expect(manager.schedule).toMatchObject({ start: '08:00', end: '20:00' });
    expect(resolvePolicy(policies, { sphere: 'vendor' })).toMatchObject({
      notify: 'important_only',
      followUpHours: 48,
    });
  });

  it('more specific wins field by field; unmatched falls back to the base', () => {
    const custom: RelationshipPolicy[] = [
      ...policies,
      { id: 'c1', scope: { connectionId: 'conn-sarah' }, settings: { notify: 'always' } },
    ];
    const r = resolvePolicy(custom, {
      sphere: 'work',
      role: 'manager',
      connectionId: 'conn-sarah',
    });
    expect(r.notify).toBe('always');
    expect(r.priority).toBe('priority');
    expect(r.sources.map((s) => s.level)).toEqual(['connection', 'role', 'sphere']);
    expect(resolvePolicy(custom, { sphere: null })).toMatchObject({
      notify: 'always',
      priority: 'normal',
    });
  });

  it('manager is priority only during work hours', () => {
    const manager = resolvePolicy(policies, { sphere: 'work', role: 'manager' });
    expect(currentPriority(manager, nyWorkday10am, tz)).toBe('priority');
    expect(currentPriority(manager, nyWorkday9pm, tz)).toBe('normal');
    expect(currentPriority(manager, nySaturday, tz)).toBe('normal');
  });

  it('describes itself in words', () => {
    expect(describePolicy(resolvePolicy(policies, { sphere: 'vendor' }))).toBe(
      'Quiet unless important · Follow up after 48 h',
    );
  });
});

describe('decideNotification', () => {
  const manager = resolvePolicy(policies, { sphere: 'work', role: 'manager' });
  const vendor = resolvePolicy(policies, { sphere: 'vendor' });
  const family = resolvePolicy(policies, { sphere: 'family' });

  it('work messages outside hours are held until the window opens', () => {
    const d = decideNotification(
      manager,
      { kind: 'message' },
      { now: nyWorkday9pm, timeZone: tz, relationshipLabel: 'Manager' },
    );
    expect(d.deliver).toBe('held');
    expect(d.holdUntil).toBe('2026-09-24T12:00:00.000Z');
    expect(d.reason).toBe('Manager · outside Mon–Fri 08:00–20:00');
  });

  it('urgency breaks through only where the recipient allows it (R10)', () => {
    expect(
      decideNotification(
        manager,
        { kind: 'message', urgent: true },
        { now: nyWorkday9pm, timeZone: tz },
      ).deliver,
    ).toBe('push');
    expect(
      decideNotification(
        vendor,
        { kind: 'message', urgent: true },
        { now: nyWorkday10am, timeZone: tz },
      ).deliver,
    ).toBe('silent');
  });

  it('vendors are quiet unless important', () => {
    expect(
      decideNotification(vendor, { kind: 'message' }, { now: nyWorkday10am, timeZone: tz }).deliver,
    ).toBe('silent');
    expect(
      decideNotification(vendor, { kind: 'question' }, { now: nyWorkday10am, timeZone: tz })
        .deliver,
    ).toBe('push');
  });

  it('family always, reminders always, mute respected, quiet hours hold', () => {
    expect(
      decideNotification(family, { kind: 'message' }, { now: nyWorkday9pm, timeZone: tz }).deliver,
    ).toBe('push');
    expect(
      decideNotification(vendor, { kind: 'reminder' }, { now: nyWorkday9pm, timeZone: tz }).deliver,
    ).toBe('push');
    expect(
      decideNotification(
        family,
        { kind: 'message' },
        { now: nyWorkday10am, timeZone: tz, muted: true },
      ).deliver,
    ).toBe('silent');
    const quiet = { days: [0, 1, 2, 3, 4, 5, 6], start: '20:00', end: '07:00' };
    const d = decideNotification(
      family,
      { kind: 'message' },
      { now: nyWorkday9pm, timeZone: tz, quietHours: quiet },
    );
    expect(d).toMatchObject({
      deliver: 'held',
      reason: 'Quiet hours',
      holdUntil: '2026-09-24T11:00:00.000Z',
    });
  });
});

describe('in a meeting (R51)', () => {
  const manager = resolvePolicy(policies, { sphere: 'work', role: 'manager' });
  const family = resolvePolicy(policies, { sphere: 'family' });
  const busyUntil = '2026-09-24T15:00:00.000Z';

  it('holds work until the meeting ends; family and calls arrive; nothing after it', () => {
    const held = decideNotification(
      manager,
      { kind: 'message' },
      { now: nyWorkday10am, timeZone: tz, relationshipLabel: 'Manager', busyUntil, sphere: 'work' },
    );
    expect(held).toMatchObject({
      deliver: 'held',
      holdUntil: busyUntil,
      reason: 'Manager · in a meeting',
    });
    expect(
      decideNotification(
        family,
        { kind: 'message' },
        { now: nyWorkday10am, timeZone: tz, busyUntil, sphere: 'family' },
      ).deliver,
    ).toBe('push');
    expect(
      decideNotification(
        manager,
        { kind: 'call' },
        { now: nyWorkday10am, timeZone: tz, busyUntil, sphere: 'work' },
      ).deliver,
    ).toBe('push');
    expect(
      decideNotification(
        manager,
        { kind: 'message', urgent: true },
        { now: nyWorkday10am, timeZone: tz, busyUntil, sphere: 'work' },
      ).deliver,
    ).toBe('push');
    // A meeting that has ended holds nothing.
    expect(
      decideNotification(
        manager,
        { kind: 'message' },
        { now: new Date('2026-09-24T15:00:00.000Z'), timeZone: tz, busyUntil, sphere: 'work' },
      ).deliver,
    ).toBe('push');
  });
});

describe('daysText', () => {
  it('names workweeks the way people say them', () => {
    expect(daysText([1, 2, 3, 4, 5])).toBe('Mon–Fri');
    expect(daysText([0, 1, 2, 3, 4])).toBe('Sun–Thu');
    expect(daysText([6, 0, 1, 2, 3])).toBe('Sat–Wed');
    expect(daysText([1, 3, 5])).toBe('Mon, Wed, Fri');
    expect(daysText([5, 6])).toBe('Fri, Sat');
    expect(daysText([0, 1, 2, 3, 4, 5, 6])).toBe('');
    expect(daysText([])).toBe('');
  });
});

describe('what a relationship changes (R66)', () => {
  it('says what the rule that applies does, in sentences', () => {
    const manager = policyEffects(
      resolvePolicy(policies, { sphere: 'work', role: 'manager' }),
      'Alex',
    );
    expect(manager[0]).toBe('Alex comes first in your Attention during your hours.');
    expect(manager.some((l) => l.startsWith('Notifications from Alex: '))).toBe(true);
    expect(manager.at(-1)).toBe(
      'What Alex asks of you, and what you promise, is kept in Attention.',
    );
    const vendor = policyEffects(resolvePolicy(policies, { sphere: 'vendor' }), 'Sam');
    expect(vendor).toContain('Notifications from Sam only when it’s important.');
    expect(vendor).toContain(
      'If your question to Sam goes unanswered for 48 hours, Caime offers a follow-up.',
    );
    const family = policyEffects(resolvePolicy(policies, { sphere: 'family' }), 'Mona');
    expect(family).toContain('A notification whenever Mona writes.');
    expect(family.some((l) => l.includes('urgent'))).toBe(false);
  });
});
