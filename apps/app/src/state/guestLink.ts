/**
 * A meeting guest's own link (R84), kept on this device when they join, so any other address
 * takes them back to their meeting. Apart from the join page, so the guest's landing route
 * doesn't carry it.
 */
import AsyncStorage from '@/lib/kv';

const KEY = 'caime.guest-link';

export function keepGuestLink(path: string): Promise<void> {
  return AsyncStorage.setItem(KEY, path).catch(() => {});
}

export function guestLink(): Promise<string | null> {
  return AsyncStorage.getItem(KEY).catch(() => null);
}

export function forgetGuestLink(): Promise<void> {
  return AsyncStorage.removeItem(KEY).catch(() => {});
}

/**
 * Keeping the meeting (M16 C3f): what the guest's page hands sign-up (their name, the address
 * their invitation came to or a guest by link's claim, and the meeting's title), kept on this
 * device for the half hour a claim is good and forgotten once sign-up is done with it.
 */
export interface KeptMeeting {
  name: string;
  email: string | null;
  claim: string | null;
  title: string;
}

const KEEP_KEY = 'caime.keep-meeting';
const KEEP_MS = 30 * 60_000;

export function keepMeeting(kept: KeptMeeting): Promise<void> {
  const until = Date.now() + KEEP_MS;
  return AsyncStorage.setItem(KEEP_KEY, JSON.stringify({ ...kept, until })).catch(() => {});
}

export async function keptMeeting(): Promise<KeptMeeting | null> {
  try {
    const raw = await AsyncStorage.getItem(KEEP_KEY);
    const kept = raw ? (JSON.parse(raw) as KeptMeeting & { until: number }) : null;
    return kept && kept.until > Date.now() ? kept : null;
  } catch {
    return null;
  }
}

export function forgetKeptMeeting(): Promise<void> {
  return AsyncStorage.removeItem(KEEP_KEY).catch(() => {});
}
