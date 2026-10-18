/**
 * A small thing three modules each wrote their own of (review 2026-10-09, the Ls). Words cut to a
 * length are core's `truncate` (by character, never half of one: M16 D3), or `previewText` on one
 * line.
 */

/** What someone typed, safe inside a LIKE pattern: `%`, `_` and `\\` escaped. */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);
