/**
 * Calls, as the rest of the app sees them (PRD §47): what this browser can do, known at once,
 * and the rest (both engines and their screens, stack.web.ts) loaded the first time it's
 * needed, so none of it is in what the app loads to start. The realtime socket asks for a live
 * call as it connects, so they're here before one rings.
 */
import type { GroupCallView, RealtimeEvent } from '@caishy/core/api';
import type { CallKind } from '@caishy/core/calls';

type Stack = typeof import('./stack.web');
let loading: Promise<Stack> | null = null;

/** The calls, loaded once. A load that failed (no network) is tried again the next time. */
export function loadCallStack(): Promise<Stack> {
  loading ??= import('./stack.web').catch((err: unknown) => {
    loading = null;
    throw err;
  });
  return loading;
}

export const callsSupported =
  typeof window !== 'undefined' && 'RTCPeerConnection' in window && Boolean(navigator.mediaDevices);
export const groupCallsSupported = callsSupported;

export async function startCall(conversationId: string, kind: CallKind): Promise<void> {
  return (await loadCallStack()).startCall(conversationId, kind);
}
export async function startGroupCall(conversationId: string, kind: CallKind): Promise<void> {
  return (await loadCallStack()).startGroupCall(conversationId, kind);
}
export async function joinGroupCall(target?: GroupCallView): Promise<void> {
  return (await loadCallStack()).joinGroupCall(target);
}
export async function checkGroupCallIn(conversationId: string): Promise<void> {
  return (await loadCallStack()).checkGroupCallIn(conversationId);
}
export async function checkLiveCall(me?: string): Promise<void> {
  return (await loadCallStack()).checkLiveCall(me);
}
export async function checkLiveGroupCall(me?: string): Promise<void> {
  return (await loadCallStack()).checkLiveGroupCall(me);
}
/** Each in the order it came: every one waits on the same load, then on the one before it. */
export function onCallEvent(event: RealtimeEvent): void {
  void loadCallStack().then((s) => s.onCallEvent(event));
}
export function onGroupCallEvent(event: RealtimeEvent): void {
  void loadCallStack().then((s) => s.onGroupCallEvent(event));
}
