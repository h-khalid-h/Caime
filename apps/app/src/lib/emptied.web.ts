/**
 * `lib/emptied.ts` on the web, where a box emptied by its state is empty and no keyboard echoes
 * what went: the state alone, and no echo ever. Four boxes in four chunks used the hook, so it sat
 * in the first download's shared chunk; this twin keeps the phone's rule out of it.
 */
import type { RefObject } from 'react';
import type { TextInput } from 'react-native';

const WEB = {
  empty: (set: (value: string) => void) => set(''),
  echoes: (_current: string, _next: string) => false,
};

export function useEmptied(_input: RefObject<TextInput | null>) {
  return WEB;
}
