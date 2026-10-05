import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { usePrefs } from '@/theme/prefs';

const QUERY = '(prefers-reduced-motion: reduce)';

/** What the device says, read once and followed (the browser's media query, the phone's setting). */
function systemReduceMotion(): boolean {
  if (Platform.OS === 'web')
    return typeof window !== 'undefined' && Boolean(window.matchMedia?.(QUERY).matches);
  return false;
}

/**
 * Whether to move less: the person's own setting (Appearance), or the device's, whichever asks
 * for it. Anything that animates for effect (a sheet sliding, a skeleton pulsing) asks this.
 */
export function useReduceMotion(): boolean {
  const chosen = usePrefs((p) => p.reduceMotion);
  const [system, setSystem] = useState(systemReduceMotion);
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const media = window.matchMedia(QUERY);
      const onChange = () => setSystem(media.matches);
      media.addEventListener?.('change', onChange);
      return () => media.removeEventListener?.('change', onChange);
    }
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (live) setSystem(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystem);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return chosen || system;
}
