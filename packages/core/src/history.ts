/**
 * How a relationship's history reads on a person's profile (PRD §9: relationships change, and
 * Caishy keeps the story). The server stores a snapshot before and after each change; this turns
 * one event into one line, using the person's name and never a pronoun (R27).
 */
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
  const what = subject ? quoted(subject) : 'a label';
  switch (e.kind) {
    case 'created':
      return `Added ${what}`;
    case 'changed':
      if (before && after && quoted(before) !== quoted(after))
        return `${quoted(before)} became ${quoted(after)}`;
      if (before && after && before.contextNote !== after.contextNote)
        return after.contextNote ? `Added a note to ${what}` : `Removed the note from ${what}`;
      return `Updated ${what}`;
    case 'ended':
      return `${before ? quoted(before) : what} ended`;
    case 'archived':
      return `Archived ${what}`;
    case 'restored':
      return `Restored ${what}`;
    case 'merged':
      return `Merged ${before ? quoted(before) : what} into another label`;
    case 'shared':
      return `Shared ${what} with ${name}`;
    case 'unshared':
      return `Stopped sharing ${what} with ${name}`;
    default:
      return `Updated ${what}`;
  }
}
