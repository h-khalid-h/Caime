export interface Key {
  text: string;
  plural: boolean;
  files: Set<string>;
}
export const SITE_FILES: Set<string>;
export function isSiteKey(key: Key): boolean;
export function keysFor(keys: Map<string, Key>, site: boolean): Map<string, Key>;
export function collectKeys(): Map<string, Key>;
