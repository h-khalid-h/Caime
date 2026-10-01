import { endpoints } from '@/api/endpoints';
import { useSession } from '@/state/session';
import { type PrefValues, usePrefs } from '@/theme/prefs';

let timer: ReturnType<typeof setTimeout> | null = null;

/** Apply now on this device, mirror to the account shortly after (every device follows). */
export function savePrefs(patch: Partial<PrefValues>): void {
  usePrefs.getState().set(patch);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const p = usePrefs.getState();
    const preferences: Record<string, unknown> = {
      theme: p.theme,
      personality: p.personality,
      bubbleTheme: p.bubbleTheme,
      reduceMotion: p.reduceMotion,
      holdWhileBusy: p.holdWhileBusy,
    };
    if (p.enterToSend !== null) preferences.enterToSend = p.enterToSend;
    void endpoints
      .updateMe({ preferences })
      .then((res) => useSession.getState().setUser(res.user))
      .catch(() => {});
  }, 600);
}
