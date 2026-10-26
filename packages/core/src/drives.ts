/**
 * Each connected account's drive by its own name (R90), the light part: apart from `accounts.ts`
 * (which re-exports it), so the composer's Share sheet and the drive sheet don't carry the
 * accounts' scopes and labels into the first download.
 */

/** Each provider's drive, by its own name: never translated. */
export const ACCOUNT_DRIVE_NAMES: Record<'google' | 'microsoft', string> = {
  google: 'Google Drive',
  microsoft: 'OneDrive',
};
