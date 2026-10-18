import { describe, expect, it } from 'vitest';
import { isLargeGroup, LARGE_GROUP } from './large-group';

describe('a group of many (M16 D2b)', () => {
  it('is a group or a broadcast past a hundred people, never a chat or a business thread', () => {
    expect(LARGE_GROUP).toBe(100);
    expect(isLargeGroup('group', 100)).toBe(false);
    expect(isLargeGroup('group', 101)).toBe(true);
    expect(isLargeGroup('broadcast', 500)).toBe(true);
    expect(isLargeGroup('direct', 500)).toBe(false);
    expect(isLargeGroup('business', 500)).toBe(false);
  });
});
