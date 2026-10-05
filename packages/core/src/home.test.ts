import { describe, expect, it } from 'vitest';
import type { InboxItemView } from './api';
import { firstName, greetingKey, homeEntries, homeSummary } from './home';

const item = (id: string, space: string | null = null) =>
  ({ id, space: space ? { id: space, name: space, kind: 'project' } : null }) as InboxItemView;

describe('the Attention home (R66)', () => {
  it('greets by the reader’s own hour, in their zone', () => {
    const at = new Date('2026-10-06T06:30:00Z');
    expect(greetingKey(at, 'UTC')).toBe('Good morning, {name}');
    expect(greetingKey(at, 'Asia/Tokyo')).toBe('Good afternoon, {name}');
    expect(greetingKey(at, 'America/Los_Angeles')).toBe('Good evening, {name}');
    expect(greetingKey(at, 'Not/AZone')).toBe('Good morning, {name}');
    expect(firstName('  Hassan Khalid ')).toBe('Hassan');
  });

  it('folds a space’s conversations into one line once two of them need you', () => {
    const entries = homeEntries([
      item('a', 'venue'),
      item('b'),
      item('c', 'venue'),
      item('d', 'x'),
    ]);
    expect(
      entries.map((e) => (e.kind === 'one' ? e.item.id : `${e.space.id}:${e.items.length}`)),
    ).toEqual(['venue:2', 'b', 'd']);
  });

  it('says how many, or that nothing does', () => {
    expect(homeSummary(0)).toBe('Nothing needs you right now.');
    expect(homeSummary(1)).toBe('1 thing needs you.');
    expect(homeSummary(3)).toBe('3 things need you.');
  });
});
