import type { PersonView } from '@caime/core/api';

/**
 * What stands for someone's handle: `@handle`, or, for a person reached by email (R75, who has
 * no handle anyone can type), how they're reached.
 */
export function handleOf(person: Pick<PersonView, 'handle' | 'kind' | 'trust'>): string {
  // The handle is Latin and reads left to right whatever the line is in: isolated (U+2066…U+2069),
  // so an Arabic line never puts its "@" at the far end.
  return person.kind === 'provisional' ? person.trust.label : `\u2066@${person.handle}\u2069`;
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
