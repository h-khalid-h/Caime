import { describe, expect, it } from 'vitest';
import { formatBytes, formatSoon } from './format';
import {
  nextOrgPlan,
  nextPersonPlan,
  ORG_ALLOWANCES,
  ORG_PLANS,
  PERSON_ALLOWANCES,
  PERSON_PLANS,
  PLAN_NAMES,
} from './plans';

describe('plans', () => {
  it('every plan includes some of everything, and a higher plan never includes less', () => {
    for (const [i, plan] of PERSON_PLANS.entries()) {
      const a = PERSON_ALLOWANCES[plan];
      expect(a.aiPerDay).toBeGreaterThan(0);
      expect(a.storageBytes).toBeGreaterThan(0);
      const below = PERSON_PLANS[i - 1];
      if (below) {
        expect(a.aiPerDay).toBeGreaterThanOrEqual(PERSON_ALLOWANCES[below].aiPerDay);
        expect(a.storageBytes).toBeGreaterThanOrEqual(PERSON_ALLOWANCES[below].storageBytes);
      }
    }
    for (const [i, plan] of ORG_PLANS.entries()) {
      const a = ORG_ALLOWANCES[plan];
      expect(a.teamSize).toBeGreaterThan(1);
      expect(a.apps).toBeGreaterThan(0);
      const below = ORG_PLANS[i - 1];
      if (below) {
        expect(a.teamSize).toBeGreaterThan(ORG_ALLOWANCES[below].teamSize);
        expect(a.apps).toBeGreaterThan(ORG_ALLOWANCES[below].apps);
        expect(a.insights || !ORG_ALLOWANCES[below].insights).toBe(true);
      }
    }
  });

  it('suggests the next plan up, and names every plan', () => {
    expect(nextPersonPlan('personal')).toBe('pro');
    expect(nextPersonPlan('pro')).toBe('enterprise');
    expect(nextPersonPlan('enterprise')).toBeNull();
    expect(nextOrgPlan('free')).toBe('business');
    expect(nextOrgPlan('enterprise')).toBeNull();
    for (const plan of [...PERSON_PLANS, ...ORG_PLANS]) expect(PLAN_NAMES[plan]).toBeTruthy();
  });

  it('writes sizes the way people say them', () => {
    expect(formatBytes(5 * 1024 ** 3)).toBe('5 GB');
    expect(formatBytes(1.5 * 1024 ** 2)).toBe('1.5 MB');
    expect(formatBytes(800)).toBe('800 B');
    expect(formatBytes(100 * 1024 ** 3)).toBe('100 GB');
    expect(formatBytes(2048 * 1024 ** 3)).toBe('2 TB');
  });

  it('says when something is ready as the reader’s clock does', () => {
    const now = new Date('2026-09-23T14:00:00Z'); // 10:00 AM in New York
    const ny = 'America/New_York';
    expect(formatSoon('2026-09-23T20:00:00Z', now, ny).replace(/\s/g, ' ')).toBe('at 4:00 PM');
    expect(formatSoon('2026-09-24T13:00:00Z', now, ny).replace(/\s/g, ' ')).toBe(
      'tomorrow at 9:00 AM',
    );
    // Past midnight in Tokyo, the same moment is already tomorrow.
    expect(formatSoon('2026-09-23T16:00:00Z', now, 'Asia/Tokyo', 'en')).toMatch(
      /^tomorrow at 1:00/,
    );
  });
});
