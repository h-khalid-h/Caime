/**
 * Each person's security code in a private conversation, and my devices (R18), kept up to date as
 * devices change: for the sheet and Settings, which load when shown.
 */
import { useCallback } from 'react';
import { usePrivate } from './hooks';
import type { MyDevice, PersonCode } from './private';

/** The codes in a conversation, kept up to date as devices change. */
export function useCodes(conversationId: string | null): PersonCode[] | null {
  const load = useCallback(
    (p: typeof import('./private')) => p.codesFor(conversationId ?? ''),
    [conversationId],
  );
  return usePrivate(conversationId ? load : null);
}

/** My devices that read private conversations, and those waiting, kept up to date. */
export function useMyDevices(on: boolean): MyDevice[] | null {
  const load = useCallback((p: typeof import('./private')) => p.myDevices(), []);
  return usePrivate(on ? load : null);
}
