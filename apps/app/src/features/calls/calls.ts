/**
 * Calls, as the rest of the app sees them (PRD §47), on the web and the phones: what this device
 * can do, known at once, and the rest (both engines and their screens) loaded the first time it's
 * needed (load.ts), so none of it is in what the web app loads to start. The realtime socket asks
 * what's live each time it connects, so they're loaded before a call rings. Where WebRTC comes
 * from is rtc.ts (the browser's) or rtc.native.ts (react-native-webrtc's).
 */
import type { GroupCallView, RealtimeEvent } from '@caime/core/api';
import type { CallKind } from '@caime/core/calls';
import { toast } from '@/ui/Toast';
import { loadCallStack, callStackOr as loadedOr } from './load';
import { callsAvailable, onPhone } from './rtc';

type Stack = Awaited<ReturnType<typeof loadCallStack>>;

export const callsSupported: boolean = callsAvailable;
export const groupCallsSupported: boolean = callsSupported;

/**
 * The calls, where this device can make them. Where it can't (a browser without WebRTC, or Expo
 * Go, which hasn't the phones' native half), nothing of them is loaded: the screens import it.
 */
const callStackOr: typeof loadedOr = (key, later) =>
  callsSupported ? loadedOr(key, later) : Promise.resolve(null);

/** What rang, or ended, while the calls couldn't load: the server says what's live now. */
const live = (stack: Stack) => {
  void stack.checkLiveCalls();
};

/** For what someone asked for: when the calls can't load, they're told, and can load afresh. */
async function asked(): Promise<Stack | null> {
  if (!callsSupported) return null;
  try {
    return await loadCallStack();
  } catch {
    toast(
      onPhone
        ? 'Calls couldn’t load. Check your connection, then try again.'
        : 'Calls couldn’t load. Check your connection, or reload Caime.',
      {
        tone: 'danger',
        ...(onPhone
          ? {}
          : { action: { label: 'Reload', onPress: () => window.location.reload() } }),
      },
    );
    return null;
  }
}

export async function startCall(conversationId: string, kind: CallKind): Promise<void> {
  await (await asked())?.startCall(conversationId, kind);
}
export async function startGroupCall(conversationId: string, kind: CallKind): Promise<void> {
  await (await asked())?.startGroupCall(conversationId, kind);
}
export async function joinGroupCall(target?: GroupCallView): Promise<void> {
  await (await asked())?.joinGroupCall(target);
}
export async function checkGroupCallIn(conversationId: string): Promise<void> {
  const check = (stack: Stack) => stack.checkGroupCallIn(conversationId);
  const stack = await callStackOr(`in:${conversationId}`, check);
  if (stack) await check(stack);
}
/** What's live now, both kinds, from one answer: asked each time the socket connects. */
export async function checkLiveCalls(me?: string): Promise<void> {
  await (await callStackOr('live', live))?.checkLiveCalls(me);
}
/**
 * Each in the order it came: every one waits on the same load, then on the one before it. One
 * that came while the calls couldn't load is made up for by asking what's live once they do.
 */
export function onCallEvent(event: RealtimeEvent): void {
  void callStackOr('live', live).then((stack) => stack?.onCallEvent(event));
}
export function onGroupCallEvent(event: RealtimeEvent): void {
  void callStackOr('live', live).then((stack) => stack?.onGroupCallEvent(event));
}
