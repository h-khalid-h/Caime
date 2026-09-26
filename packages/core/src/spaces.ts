/**
 * Spaces (PRD §40, R32): an optional place around a family, a team, a project or a community,
 * holding its people and conversations. A space's kind says which sphere it belongs to, so the
 * cards its conversations offer fit it the way a relationship's do (R19).
 */
import type { Sphere } from './taxonomy';

export const SPACE_KINDS = [
  'family',
  'friends',
  'team',
  'project',
  'community',
  'school',
  'other',
] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];

export interface SpaceKindDef {
  id: SpaceKind;
  label: string;
  /** The sphere its conversations count as (kits, policies). */
  sphere: Sphere;
  /** One line under the choice when creating a space. */
  hint: string;
}

export const SPACE_KIND_DEFS: Record<SpaceKind, SpaceKindDef> = {
  family: {
    id: 'family',
    label: 'Family',
    sphere: 'family',
    hint: 'Home, and the family around it',
  },
  friends: { id: 'friends', label: 'Friends', sphere: 'friend', hint: 'A circle of friends' },
  team: { id: 'team', label: 'Team', sphere: 'work', hint: 'The people you work with' },
  project: {
    id: 'project',
    label: 'Project',
    sphere: 'work',
    hint: 'A goal, and the people on it',
  },
  community: {
    id: 'community',
    label: 'Community',
    sphere: 'community',
    hint: 'A club, a building, a group around something shared',
  },
  school: {
    id: 'school',
    label: 'School',
    sphere: 'community',
    hint: 'A class, a course, a parents’ group',
  },
  other: { id: 'other', label: 'Something else', sphere: 'other', hint: 'Anything else' },
};

export const SPACE_ROLES = ['owner', 'admin', 'member'] as const;
export type SpaceRole = (typeof SPACE_ROLES)[number];

export const SPACE_ROLE_LABELS: Record<SpaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

/** Owners and admins rename the space, add people and start its settings. */
export function canManageSpace(role: SpaceRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/** Owners remove anyone but themselves; admins remove members. Anyone may leave. */
export function canRemoveFromSpace(actor: SpaceRole, target: SpaceRole): boolean {
  if (actor === 'owner') return target !== 'owner';
  if (actor === 'admin') return target === 'member';
  return false;
}

/** Only the owner makes someone an admin or a member again. */
export function canChangeSpaceRole(actor: SpaceRole, target: SpaceRole): boolean {
  return actor === 'owner' && target !== 'owner';
}

/**
 * Who owns a space or an organization when its owner leaves: the admin who has been there
 * longest, else whoever has. Null when nobody is left.
 */
export function nextOwner<R extends string>(
  members: ReadonlyArray<{ userId: string; role: R; joinedAt: string }>,
  leaving: string,
): string | null {
  const staying = members
    .filter((m) => m.userId !== leaving)
    .sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt));
  return (staying.find((m) => m.role === 'admin') ?? staying[0])?.userId ?? null;
}

export const nextSpaceOwner = nextOwner<SpaceRole>;
