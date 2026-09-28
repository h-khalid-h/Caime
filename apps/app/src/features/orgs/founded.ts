/** The year an organization began, as its forms take it (core schemas.ts FoundedYear). */

/** A year it could have begun: four digits, from 1000 to this one. */
export function foundedError(value: string): string | undefined {
  if (!value) return undefined;
  const year = Number(value);
  if (!/^\d{4}$/.test(value) || year < 1000) return 'Enter the year it began.';
  return year > new Date().getFullYear() ? 'That year hasn’t come yet.' : undefined;
}
