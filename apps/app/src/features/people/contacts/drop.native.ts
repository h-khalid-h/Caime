import type { RefObject } from 'react';
import type { View } from 'react-native';

/** Nothing is dropped on a phone: its files come through the picker. */
export function useFileDrop(
  _target: RefObject<View | null>,
  _onFile: (name: string, text: string) => void,
  _enabled: boolean,
): boolean {
  return false;
}
