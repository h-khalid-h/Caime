import { describe, expect, it } from 'vitest';
import {
  canChangeSpaceRole,
  canManageSpace,
  canRemoveFromSpace,
  nextSpaceOwner,
  SPACE_KIND_DEFS,
  SPACE_KINDS,
} from './spaces';
import { SPHERES } from './taxonomy';

describe('spaces', () => {
  it('every kind belongs to a sphere, so its cards fit it', () => {
    for (const kind of SPACE_KINDS) expect(SPHERES).toContain(SPACE_KIND_DEFS[kind].sphere);
    expect(SPACE_KIND_DEFS.family.sphere).toBe('family');
    expect(SPACE_KIND_DEFS.team.sphere).toBe('work');
  });

  it('owners and admins manage; owners remove anyone but themselves, admins only members', () => {
    expect(canManageSpace('owner')).toBe(true);
    expect(canManageSpace('admin')).toBe(true);
    expect(canManageSpace('member')).toBe(false);
    expect(canManageSpace(null)).toBe(false);
    expect(canRemoveFromSpace('owner', 'admin')).toBe(true);
    expect(canRemoveFromSpace('owner', 'owner')).toBe(false);
    expect(canRemoveFromSpace('admin', 'member')).toBe(true);
    expect(canRemoveFromSpace('admin', 'admin')).toBe(false);
    expect(canRemoveFromSpace('member', 'member')).toBe(false);
    expect(canChangeSpaceRole('owner', 'member')).toBe(true);
    expect(canChangeSpaceRole('admin', 'member')).toBe(false);
  });

  it('hands the space to the longest-standing admin, else the longest-standing member', () => {
    const members = [
      { userId: 'owner', role: 'owner' as const, joinedAt: '2026-01-01T00:00:00Z' },
      { userId: 'new-admin', role: 'admin' as const, joinedAt: '2026-03-01T00:00:00Z' },
      { userId: 'old-member', role: 'member' as const, joinedAt: '2026-02-01T00:00:00Z' },
      { userId: 'old-admin', role: 'admin' as const, joinedAt: '2026-02-15T00:00:00Z' },
    ];
    expect(nextSpaceOwner(members, 'owner')).toBe('old-admin');
    expect(nextSpaceOwner(members.slice(0, 1).concat(members[2]!), 'owner')).toBe('old-member');
    expect(nextSpaceOwner(members.slice(0, 1), 'owner')).toBeNull();
  });
});
