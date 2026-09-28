/**
 * Calls on phones aren't built yet (PRD §47: WebRTC 1:1 on the web first). The web build uses
 * engine.web.ts; these keep the same shape so shared code needn't know.
 */
import type { RealtimeEvent } from '@caime/core/api';
import type { CallKind } from '@caime/core/calls';

export const callsSupported: boolean = false;
export const screenShareSupported = false;
export async function startCall(_conversationId: string, _kind: CallKind): Promise<void> {}
export async function answer(): Promise<void> {}
export async function hangUp(_note: string | null = null, _failed = false): Promise<void> {}
export function toggleMute(): void {}
export function toggleCamera(): void {}
export async function startSharing(): Promise<void> {}
export async function stopSharing(): Promise<void> {}
export function onCallEvent(_event: RealtimeEvent): void {}
export async function checkLiveCall(_me?: string): Promise<void> {}
