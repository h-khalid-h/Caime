/**
 * Whether this phone can show Caime's notifications, and what it allows (support.ts is a
 * browser's). Pushes come through Expo's service with the phone's own permission. Expo Go on
 * Android has had no remote notifications since SDK 53, so there the app offers none; a build of
 * Caime's own, and Expo Go on an iPhone, have them. expo-notifications loads only where it's
 * there to use, and only when something asks.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';

export const pushSupported = !(Platform.OS === 'android' && isRunningInExpoGo());

/** The library, loaded on first use where this phone can have pushes at all. */
export const notifications = () => import('expo-notifications');

/** What the phone said last time it was asked here: a phone answers only asynchronously. */
let known: PushState = pushSupported ? 'default' : 'unsupported';

export function pushState(): PushState {
  return known;
}

/** What the phone allows now, read from it (and kept for `pushState`). */
export async function readPushState(): Promise<PushState> {
  if (!pushSupported) return 'unsupported';
  try {
    const { status } = await (await notifications()).getPermissionsAsync();
    known = status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'default';
  } catch {
    known = 'unsupported';
  }
  return known;
}

const SEEN = 'caime.push-prompt';

/** A phone looks it up before it can say: Chats shows the offer a moment later, if at all. */
export function promptAtStart(): boolean {
  return false;
}

/** Whether Chats offers to turn them on: the phone hasn't been asked, nor the offer answered. */
export async function promptLater(): Promise<boolean> {
  if ((await readPushState()) !== 'default') return false;
  return (await AsyncStorage.getItem(SEEN).catch(() => '1')) !== '1';
}

/** Asked once: whatever they answered, Chats doesn't offer it again on this phone. */
export function promptAnswered(): void {
  void AsyncStorage.setItem(SEEN, '1').catch(() => {});
}
