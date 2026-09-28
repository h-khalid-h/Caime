/**
 * Calls on phones aren't built yet (PRD §47: WebRTC on the web first). The web build uses
 * group.web.ts; these keep the same shape so shared code needn't know.
 */
import type { GroupCallView, RealtimeEvent } from '@caime/core/api';
import type { CallKind } from '@caime/core/calls';

export const groupCallsSupported: boolean = false;
export async function startGroupCall(_conversationId: string, _kind: CallKind): Promise<void> {}
export async function joinGroupCall(_target?: GroupCallView): Promise<void> {}
export async function leaveGroupCall(): Promise<void> {}
export function toggleGroupMute(): void {}
export function toggleGroupCamera(): void {}
export async function startGroupSharing(): Promise<void> {}
export async function stopGroupSharing(): Promise<void> {}
export function onGroupCallEvent(_event: RealtimeEvent): void {}
export async function checkLiveGroupCall(_me?: string): Promise<void> {}
export async function checkGroupCallIn(_conversationId: string): Promise<void> {}
export const inGroupCall = () => false;
