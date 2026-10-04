import type { MeView } from '@caime/core/api';
import { request } from '@/api/client';
import { isWeb } from '@/lib/config';
import { useLanguage } from '@/lib/languageState';
import { clearPrefsPending, markPrefsPending } from '@/state/prefsPending';
import { useSession } from '@/state/session';
import { type PrefValues, usePrefs } from '@/theme/prefs';

let timer: ReturnType<typeof setTimeout> | null = null;

/** The device's whole choice, as the account keeps it. */
function snapshot(): Record<string, unknown> {
  const p = usePrefs.getState();
  const preferences: Record<string, unknown> = {
    theme: p.theme,
    personality: p.personality,
    bubbleTheme: p.bubbleTheme,
    reduceMotion: p.reduceMotion,
    holdWhileBusy: p.holdWhileBusy,
    language: p.language,
  };
  if (p.enterToSend !== null) preferences.enterToSend = p.enterToSend;
  // The language this device shows (what `auto` came to), so the server writes to this person
  // in it (R54). Sent with the choice, in the one request, so nothing the account answers back
  // can predate it.
  const shown = useLanguage.getState().language;
  if (shown) preferences.interfaceLanguage = shown;
  return preferences;
}

function send(keepalive = false): void {
  timer = null;
  void request<{ user: MeView }>('PATCH', '/me', { body: { preferences: snapshot() }, keepalive })
    .then((res) => useSession.getState().setUser(res.user))
    .catch(() => {})
    .finally(clearPrefsPending);
}

/**
 * Apply now on this device, mirror to the account shortly after (every device follows). Until
 * the account has it, what's read back from the account doesn't replace it (prefsPending).
 */
export function savePrefs(patch: Partial<PrefValues>): void {
  usePrefs.getState().set(patch);
  if (timer) clearTimeout(timer);
  else markPrefsPending();
  timer = setTimeout(send, 600);
}

// A setting changed just before the tab goes (a reload, a link) is saved as it goes, not lost:
// the request is let outlive the page.
if (isWeb && typeof window !== 'undefined')
  window.addEventListener('pagehide', () => {
    if (!timer) return;
    clearTimeout(timer);
    send(true);
  });
