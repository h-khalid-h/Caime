import { describe, expect, it } from 'vitest';
import {
  canChangeOrgRole,
  canManageOrg,
  canRemoveFromOrg,
  normalizeDomain,
  orgKindName,
  recordMatches,
  verificationRecord,
} from './orgs';
import { nextOwner } from './spaces';

describe('organizations', () => {
  it('names a kind the way a profile says it', () => {
    expect(orgKindName('clinic')).toBe('Clinic or practice');
    expect(orgKindName('other')).toBe('Organization');
  });

  it('reads a domain the way people type it', () => {
    expect(normalizeDomain('https://www.DataC.com/about?x=1')).toBe('datac.com');
    expect(normalizeDomain('shop.datac.co.uk.')).toBe('shop.datac.co.uk');
    expect(normalizeDomain('datac.com:8443')).toBe('datac.com');
    expect(normalizeDomain('xn--mgbh0fb.xn--kgbechtv')).toBe('xn--mgbh0fb.xn--kgbechtv');
    for (const bad of ['localhost', '10.0.0.1', 'datac', '-datac.com', 'data_c.com', 'a..com', ''])
      expect(normalizeDomain(bad)).toBeNull();
  });

  it('says where the TXT record goes and matches it however it was split', () => {
    const record = verificationRecord('datac.com', 'k7q2');
    expect(record).toEqual({
      name: '_caishy-verify.datac.com',
      type: 'TXT',
      value: 'caishy-verify=k7q2',
    });
    expect(recordMatches([['v=spf1 -all'], ['caishy-', 'verify=k7q2']], 'k7q2')).toBe(true);
    expect(recordMatches([['caishy-verify=k7q2x']], 'k7q2')).toBe(false);
    expect(recordMatches([], 'k7q2')).toBe(false);
  });

  it('owners and admins run it; admins remove the team, not each other or the owner', () => {
    expect(canManageOrg('admin')).toBe(true);
    expect(canManageOrg('agent')).toBe(false);
    expect(canRemoveFromOrg('owner', 'admin')).toBe(true);
    expect(canRemoveFromOrg('admin', 'agent')).toBe(true);
    expect(canRemoveFromOrg('admin', 'admin')).toBe(false);
    expect(canRemoveFromOrg('agent', 'agent')).toBe(false);
    expect(canChangeOrgRole('owner', 'agent')).toBe(true);
    expect(canChangeOrgRole('admin', 'agent')).toBe(false);
    const members = [
      { userId: 'o', role: 'owner' as const, joinedAt: '2026-01-01T00:00:00Z' },
      { userId: 't', role: 'agent' as const, joinedAt: '2026-01-02T00:00:00Z' },
      { userId: 'a', role: 'admin' as const, joinedAt: '2026-02-01T00:00:00Z' },
    ];
    expect(nextOwner(members, 'o')).toBe('a');
  });
});
