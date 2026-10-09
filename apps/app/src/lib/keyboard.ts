import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Whether the keyboard has pushed the screen up: on Android, which makes room for it, so what
 * sits at the bottom (the bar of places) would ride above it and take that room. iOS and
 * browsers lay the keyboard over the screen (Chrome since 108, `resizes-visual`), so the bar is
 * under it and nothing needs to move; moving it there anyway shifts the screen as a field loses
 * the focus, under the finger pressing the button below it, and that press is lost.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const shown = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return open;
}
