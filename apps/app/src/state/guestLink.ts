/**
 * A meeting guest's own link (R84), kept on this device when they join, so any other address
 * takes them back to their meeting. Apart from the join page, so the guest's landing route
 * doesn't carry it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

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
