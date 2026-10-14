/**
 * Notifications on this phone: Expo's push service delivers what the server sends while Caime
 * isn't in front (lib/expo-push.ts on the server), a call ringing above all. The phone asks the
 * person once, from something they pressed; after that, each sign-in here registers this phone's
 * Expo token with the server, which pushes only to live sessions, so a session that ends hears
 * nothing more. The same shape as push.web.ts, so the shared code (sign-in, sign-out, Settings,
 * the Chats prompt, a read elsewhere) needn't know which it is.
 */
import { PUSH_CHANNELS } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type { NotificationResponse } from 'expo-notifications';
import { Platform } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { appPath } from '@/lib/paths';
import { notificationPath } from './notificationPath';
import {
  notifications,
  type PushState,
  pushState,
  pushSupported,
  readPushState,
} from './support.native';

export { type PushState, pushState, pushSupported };

/** This phone's Expo token, kept to tell the server which it was on signing out. */
const TOKEN_KEY = 'caime.push-token';
/** Turned off here, it stays off until turned on here, whatever the phone allows. */
const OFF_KEY = 'caime.push-off';

const turnedOff = async () => (await AsyncStorage.getItem(OFF_KEY).catch(() => null)) === '1';
const setTurnedOff = (off: boolean) =>
  (off ? AsyncStorage.setItem(OFF_KEY, '1') : AsyncStorage.removeItem(OFF_KEY)).catch(() => {});

let handling = false;
/**
 * While Caime is in front it shows what arrives itself (the conversation, the inbox, a call's
 * screen), as a browser tab does: the phone adds nothing over it.
 */
async function inFrontShowsNothing(): Promise<void> {
  if (handling) return;
  handling = true;
  (await notifications()).setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Android's channels, made before the first ask (Android 13 shows its prompt only once one
 * exists): what asks for them rings, the rest arrives quietly. Named in the person's language;
 * the phone's settings list them.
 */
async function channels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const n = await notifications();
  await n.setNotificationChannelAsync(PUSH_CHANNELS.alert, {
    name: tr('Messages and calls'),
    importance: n.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
  await n.setNotificationChannelAsync(PUSH_CHANNELS.quiet, {
    name: tr('Other activity'),
    importance: n.AndroidImportance.LOW,
  });
}

/** This phone's token, told to the server for this session. */
async function subscribe(): Promise<void> {
  await channels();
  const projectId =
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) throw new Error(tr('This phone couldn’t turn them on.'));
  const { data: token } = await (await notifications()).getExpoPushTokenAsync({ projectId });
  await endpoints.subscribePush({ kind: 'expo', token });
  await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
}

/** Turn them on, from a button: the phone asks the person. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported) return 'unsupported';
  await inFrontShowsNothing();
  await channels();
  const { status } = await (await notifications()).requestPermissionsAsync();
  const answer = await readPushState();
  if (status === 'granted') {
    await setTurnedOff(false);
    await subscribe();
  }
  return answer;
}

/**
 * Signed in where they already said yes: this session gets its pushes too. Never asks, and never
 * while they've turned them off here.
 */
export async function resumePush(): Promise<void> {
  if (!pushSupported) return;
  await inFrontShowsNothing();
  if ((await readPushState()) !== 'granted' || (await turnedOff())) return;
  await subscribe().catch(() => {});
}

/** The server forgets this phone's token (while it can still be asked). */
async function unsubscribe(tellServer: boolean): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  if (tellServer && token) await endpoints.unsubscribePush(token).catch(() => {});
}

/** Off on this phone, and kept off: the server forgets it, whatever the phone still allows. */
export async function disablePush(): Promise<void> {
  if (!pushSupported) return;
  await setTurnedOff(true);
  await unsubscribe(true);
}

/**
 * What this phone shows of Caime's notifications, cleared: those read (on any device), or all.
 * A notification read in the app has nothing more to say on the lock screen.
 */
export async function closeShownNotifications(ids: string[] | null): Promise<void> {
  if (!pushSupported) return;
  const n = await notifications();
  const shown = await n.getPresentedNotificationsAsync().catch(() => []);
  for (const s of shown) {
    const id = (s.request.content.data as { id?: unknown } | null)?.id;
    if (ids === null || (typeof id === 'string' && ids.includes(id)))
      await n.dismissNotificationAsync(s.request.identifier).catch(() => {});
  }
}

/**
 * Signing out here: the server forgets this phone (a session that ended gets nothing anyway), and
 * what's shown goes with it, so the next person to use this phone sees none of it. Signing in
 * again registers afresh, unless they'd turned them off.
 */
export async function leaveThisDevice({ tellServer }: { tellServer: boolean }): Promise<void> {
  if (!pushSupported) return;
  await unsubscribe(tellServer);
  await closeShownNotifications(null);
}

/** Whether this phone gets them now (for Settings). */
export async function pushOn(): Promise<boolean> {
  if ((await readPushState()) !== 'granted' || (await turnedOff())) return false;
  return Boolean(await AsyncStorage.getItem(TOKEN_KEY).catch(() => null));
}

/** Taps already followed: the one that opened the app comes by both ways. */
const followed = new Set<string>();

/**
 * A tapped notification opens where it leads, as a browser's does (`notificationPath`, the
 * service worker's twin), including the tap that started the app.
 */
export function onOpenFromNotification(go: (path: string) => void): () => void {
  if (!pushSupported) return () => {};
  let stopped = false;
  let stop = () => {};
  const open = (r: NotificationResponse) => {
    const key = r.notification.request.identifier;
    if (stopped || followed.has(key)) return;
    followed.add(key);
    const path = appPath(notificationPath(r.notification.request.content.data));
    if (path) go(path);
  };
  void notifications()
    .then((n) => {
      if (stopped) return;
      const sub = n.addNotificationResponseReceivedListener(open);
      stop = () => sub.remove();
      return n.getLastNotificationResponseAsync().then((r) => (r ? open(r) : undefined));
    })
    .catch(() => {});
  return () => {
    stopped = true;
    stop();
  };
}
