/**
 * Spaces (PRD §40, R32): an optional place around a family, a team, a project or a community,
 * holding its people and conversations. A space's kind says which sphere it belongs to, so the
 * cards its conversations offer fit it the way a relationship's do (R19).
 */

import { msg } from './i18n';
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
    label: msg('Family'),
    sphere: 'family',
    hint: msg('Home, and the family around it'),
  },
  friends: {
    id: 'friends',
    label: msg('Friends'),
    sphere: 'friend',
    hint: msg('A circle of friends'),
  },
  team: { id: 'team', label: msg('Team'), sphere: 'work', hint: msg('The people you work with') },
  project: {
    id: 'project',
    label: msg('Project'),
    sphere: 'work',
    hint: msg('A goal, and the people on it'),
  },
  community: {
    id: 'community',
    label: msg('Community'),
    sphere: 'community',
    hint: msg('A club, a building, a group around something shared'),
  },
  school: {
    id: 'school',
    label: msg('School'),
    sphere: 'community',
    hint: msg('A class, a course, a parents’ group'),
  },
  other: { id: 'other', label: msg('Something else'), sphere: 'other', hint: msg('Anything else') },
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
  // Longest there first; two who joined at the same instant go by id (uuidv7: made first,
  // first), so the heir is the same whichever order the rows came in.
  const staying = members
    .filter((m) => m.userId !== leaving)
    .sort(
      (a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt) || a.userId.localeCompare(b.userId),
    );
  return (staying.find((m) => m.role === 'admin') ?? staying[0])?.userId ?? null;
}

export const nextSpaceOwner = nextOwner<SpaceRole>;
