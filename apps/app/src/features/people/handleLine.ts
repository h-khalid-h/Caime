import type { PersonView } from '@caime/core/api';

/**
 * What stands for someone's handle: `@handle`, or, for a person reached by email (R75, who has
 * no handle anyone can type), how they're reached.
 */
export function handleOf(person: Pick<PersonView, 'handle' | 'kind' | 'trust'>): string {
  return person.kind === 'provisional' ? person.trust.label : `@${person.handle}`;
}

/**
 * The line under someone's name: their handle and what Caime knows of who they are, or, for a
 * person reached by email, that alone.
 */
export function handleLine(person: Pick<PersonView, 'handle' | 'kind' | 'trust'>): string {
  return person.kind === 'provisional'
    ? person.trust.label
    : `${handleOf(person)} · ${person.trust.label}`;
}
