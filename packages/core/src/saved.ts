/**
 * What's saved, the light part (PRD §69): the default collection and a collection's name as it's
 * kept. Apart from `automations.ts` (which re-exports it), so the screens that save or list what's
 * saved don't carry the automations' rules into the first download.
 */

/** The longest name of a collection. */
export const COLLECTION_MAX = 60;
/** Where a message is saved when no collection is chosen. */
export const SAVED_DEFAULT = 'Saved';
/** The most one person keeps saved; past it, nothing more is saved until some is removed. */
export const SAVED_MAX = 5000;

/** A collection's name as it's kept: its spaces tidied, never empty. */
export function collectionName(name: string | null | undefined): string {
  const n = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, COLLECTION_MAX);
  return n || SAVED_DEFAULT;
}
