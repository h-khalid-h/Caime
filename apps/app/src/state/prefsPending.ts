/**
 * Whether this device has a preference change the account hasn't been told yet (savePrefs
 * debounces, then sends). While it does, nothing read back from the account (a refresh, a
 * `me.updated` echo of an earlier save) may replace the device's choice: the pending save is
 * the newer truth, and its own answer settles the account.
 */
let pending = 0;

export function markPrefsPending(): void {
  pending++;
}

export function clearPrefsPending(): void {
  pending = Math.max(0, pending - 1);
}

export function prefsPending(): boolean {
  return pending > 0;
}
