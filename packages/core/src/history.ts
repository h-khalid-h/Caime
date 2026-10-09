/**
 * How a relationship's history reads on a person's profile (PRD §9: relationships change, and
 * Caime keeps the story). The server stores a snapshot before and after each change; this turns
 * one event into one line, using the person's name and never a pronoun (R27).
 */

import { tr } from './i18n';
import { isSphere, relationshipLabel, type Sphere } from './taxonomy';

export interface RelationshipEventLike {
  kind: string;
  before: unknown;
  after: unknown;
}

interface Snapshot {
  sphere: Sphere;
  role: string | null;
  roleLabel: string | null;
  orgName: string | null;
  contextNote: string | null;
  shared: boolean;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** Snapshots come from storage; anything malformed reads as unknown rather than throwing. */
function snapshotOf(value: unknown): Snapshot | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  if (!isSphere(s.sphere)) return null;
  return {
    sphere: s.sphere,
    role: text(s.role),
    roleLabel: text(s.roleLabel),
    orgName: text(s.orgName),
    contextNote: text(s.contextNote),
    shared: s.shared === true,
  };
}

const quoted = (s: Snapshot) => `“${relationshipLabel(s)}”`;

export function describeRelationshipEvent(e: RelationshipEventLike, name: string): string {
  const before = snapshotOf(e.before);
  const after = snapshotOf(e.after);
  const subject = after ?? before;
  const what = subject ? quoted(subject) : tr('a label');
  switch (e.kind) {
    case 'created':
      return tr('Added {what}', { what });
    case 'changed':
      if (before && after && quoted(before) !== quoted(after))
        return tr('{quoted} became {quoted2}', { quoted: quoted(before), quoted2: quoted(after) });
      if (before && after && before.contextNote !== after.contextNote)
        return after.contextNote
          ? tr('Added a note to {what}', { what })
          : tr('Removed the note from {what}', { what });
      return tr('Updated {what}', { what });
    case 'ended':
      return tr('{what} ended', { what: before ? quoted(before) : what });
    case 'archived':
      return tr('Archived {what}', { what });
    case 'restored':
      return tr('Restored {what}', { what });
    case 'merged':
      return tr('Merged {quoted} into another label', { quoted: before ? quoted(before) : what });
    case 'shared':
      return tr('Shared {what} with {name}', { what, name });
    case 'unshared':
      return tr('Stopped sharing {what} with {name}', { what, name });
    default:
      return tr('Updated {what}', { what });
  }
}
