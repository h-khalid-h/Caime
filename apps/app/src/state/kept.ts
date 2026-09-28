/**
 * The account as a device keeps it between launches, in the shape of the app version that wrote
 * it (api/queryClient.ts CACHE_VERSION): one kept in another shape is asked for again, never
 * misread.
 */
import type { MeView } from '@caishy/core/api';

export function keepUser(user: MeView, version: string): string {
  return JSON.stringify({ v: version, user });
}

/** The account kept, if it's in this version's shape. */
export function keptUser(raw: string | null, version: string): MeView | null {
  if (!raw) return null;
  try {
    const kept = JSON.parse(raw) as { v?: string; user?: MeView };
    return kept.v === version && kept.user ? kept.user : null;
  } catch {
    return null;
  }
}

/** Whose account is kept, whichever version of the app wrote it (another tab may be older). */
export function keptId(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const kept = JSON.parse(raw) as { id?: string; user?: { id?: string } };
    return kept.user?.id ?? kept.id ?? null;
  } catch {
    return null;
  }
}
