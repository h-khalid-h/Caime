import { describe, expect, it } from 'vitest';
import {
  currentPriority,
  decideNotification,
  defaultPolicies,
  describePolicy,
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
    expect(d.reason).toBe('Manager · outside 08:00–20:00');
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
