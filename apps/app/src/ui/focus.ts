/**
 * Keyboard focus rings on the web without flashing them on every click: the ring shows only
 * after the person used the keyboard, until they use the mouse again (like :focus-visible).
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

let keyboard = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab' && !keyboard) {
        keyboard = true;
        emit();
      }
    },
    true,
  );
  window.addEventListener(
    'pointerdown',
    () => {
      if (keyboard) {
        keyboard = false;
        emit();
      }
    },
    true,
  );
}

export function useKeyboardMode(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => keyboard,
    () => false,
  );
}
