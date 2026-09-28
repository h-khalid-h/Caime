/**
 * Calls, as the rest of the app sees them (PRD §47): what this browser can do, known at once,
 * and the rest (both engines and their screens) loaded the first time it's needed
 * (load.web.ts), so none of it is in what the app loads to start. The realtime socket asks
 * what's live each time it connects, so they're loaded before a call rings. The same names as
 * calls.ts, which is what the typecheck reads (calls.check.ts).
 */
import type { GroupCallView, RealtimeEvent } from '@caime/core/api';
import type { CallKind } from '@caime/core/calls';
import { toast } from '@/ui/Toast';
import { callStackOr, loadCallStack } from './load.web';

type Stack = Awaited<ReturnType<typeof loadCallStack>>;

export const callsSupported: boolean =
  typeof window !== 'undefined' && 'RTCPeerConnection' in window && Boolean(navigator.mediaDevices);
export const groupCallsSupported: boolean = callsSupported;

/** What rang, or ended, while the calls couldn't load: the server says what's live now. */
const live = (stack: Stack) => {
  void stack.checkLiveCall();
  void stack.checkLiveGroupCall();
};

/** For what someone asked for: when the calls can't load, they're told, and can load afresh. */
async function asked(): Promise<Stack | null> {
  try {
    return await loadCallStack();
  } catch {
    toast('Calls couldn’t load. Check your connection, or reload Caime.', {
      tone: 'danger',
      action: { label: 'Reload', onPress: () => window.location.reload() },
    });
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
export async function checkLiveCall(me?: string): Promise<void> {
  await (await callStackOr('live', live))?.checkLiveCall(me);
}
export async function checkLiveGroupCall(me?: string): Promise<void> {
  await (await callStackOr('live', live))?.checkLiveGroupCall(me);
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
