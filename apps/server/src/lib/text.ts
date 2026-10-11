/** Two small things three modules each wrote their own of (review 2026-10-09, the Ls). */

/** The first `max` characters with an ellipsis where it was cut, else the text as it is. */
export const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** What someone typed, safe inside a LIKE pattern: `%`, `_` and `\\` escaped. */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);
