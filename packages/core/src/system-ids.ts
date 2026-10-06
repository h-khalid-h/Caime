/**
 * Caime's own accounts by id (R67): apart from their words (`system-accounts.ts`), so anything
 * drawn on every screen (an avatar) knows one without carrying the rest. The ids are fixed by
 * migration 0059.
 */
export const CAI_ID = '00000000-0000-4000-8000-00000000ca10';
/** Caishy, the first of the Caime Friends: where they're met. */
export const CAISHY_ID = '00000000-0000-4000-8000-00000000ca11';

export const SYSTEM_HANDLES: Readonly<Record<string, string>> = {
  [CAI_ID]: 'cai',
  [CAISHY_ID]: 'caishy',
  '00000000-0000-4000-8000-00000000ca12': 'momo',
  '00000000-0000-4000-8000-00000000ca13': 'panda',
  '00000000-0000-4000-8000-00000000ca14': 'lumi',
  '00000000-0000-4000-8000-00000000ca15': 'pico',
  '00000000-0000-4000-8000-00000000ca16': 'niko',
  '00000000-0000-4000-8000-00000000ca17': 'zuzu',
};

/** Cai's or a friend's handle for its id; null for anyone else. */
export function systemHandleOf(id: string | null | undefined): string | null {
  return (id && SYSTEM_HANDLES[id]) || null;
}

export type SystemKind = 'assistant' | 'character';

export function isSystemKind(kind: string | null | undefined): kind is SystemKind {
  return kind === 'assistant' || kind === 'character';
}
