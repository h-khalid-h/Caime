/**
 * Live location (R29): someone shares where they are for a while, and it follows them until the
 * time they chose, or until they stop it. Adults only, never with an organization, and only the
 * latest point is kept. No zod here, so the apps can use it.
 */

/** How long someone can share where they are live: 15 minutes, an hour, or 8 hours. */
export const LIVE_LOCATION_MINUTES = [15, 60, 480] as const;
export type LiveLocationMinutes = (typeof LIVE_LOCATION_MINUTES)[number];

/** A live location as stored and shown: until when, and when it last moved. */
export interface LiveLocation {
  startedAt: string;
  until: string;
  updatedAt: string;
  /** Stopped before its time by the person sharing it. */
  stoppedAt: string | null;
}

/** Still following the sharer at `now`? */
export function liveNow(live: LiveLocation | null | undefined, now: Date): boolean {
  return Boolean(live && !live.stoppedAt && Date.parse(live.until) > now.getTime());
}
